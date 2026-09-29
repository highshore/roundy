begin;

-- Per-event pricing. Existing ticket lots remain only for legacy bookings; new checkout
-- pricing is quoted per event and snapshots every applied discount on the purchase.
alter table public.events
  add column if not exists male_price_krw integer not null default 49000 check (male_price_krw between 1000 and 1000000),
  add column if not exists female_price_krw integer not null default 29000 check (female_price_krw between 1000 and 1000000);

-- Referral codes are now a 10% event discount. Historical redemption rows keep their
-- original snapshot, so this does not rewrite prior 100% referral transactions.
alter table public.referral_codes alter column discount_percent set default 10;
update public.referral_codes
set discount_percent=10
where active and discount_percent is distinct from 10;

create table if not exists public.promo_codes(
  code text primary key
    check(code=upper(code) and code ~ '^[A-Z0-9_-]{4,24}$'),
  discount_percent smallint not null default 20
    check(discount_percent between 1 and 20),
  active boolean not null default true,
  event_id uuid references public.events(id) on delete cascade,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer check(max_redemptions is null or max_redemptions>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at is null or starts_at is null or ends_at>starts_at)
);

create table if not exists public.event_purchases(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  user_id uuid not null references auth.users(id),
  booking_id uuid unique references public.bookings(id) on delete set null,
  gender text not null check(gender in('male','female')),
  original_amount integer not null check(original_amount>=0),
  code_kind text not null default 'none' check(code_kind in('none','referral','promo')),
  code text,
  referral_discount_amount integer not null default 0 check(referral_discount_amount>=0),
  promo_discount_amount integer not null default 0 check(promo_discount_amount>=0),
  gender_balance_discount_amount integer not null default 0 check(gender_balance_discount_amount>=0),
  time_discount_amount integer not null default 0 check(time_discount_amount>=0),
  time_discount_kind text not null default 'none' check(time_discount_kind in('none','early_bird','last_minute')),
  boomerang_discount_amount integer not null default 0 check(boomerang_discount_amount>=0),
  total_discount_amount integer not null check(total_discount_amount>=0),
  final_amount integer not null check(final_amount>=0),
  discount_snapshot jsonb not null default '{}'::jsonb,
  payment_status text not null default 'pending'
    check(payment_status in('pending','paid','failed','void','refunded')),
  booking_status text not null default 'pending'
    check(booking_status in('pending','confirmed','cancelled')),
  payment_reference text unique,
  quoted_at timestamptz not null default now(),
  paid_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(total_discount_amount=
    referral_discount_amount+promo_discount_amount+gender_balance_discount_amount+
    time_discount_amount+boomerang_discount_amount),
  check(final_amount=original_amount-total_discount_amount),
  check((code_kind='none' and code is null) or (code_kind<>'none' and code is not null)),
  check((payment_status<>'paid' and paid_at is null) or paid_at is not null)
);

create index if not exists event_purchases_user_paid
  on public.event_purchases(user_id,paid_at desc);
create index if not exists event_purchases_event
  on public.event_purchases(event_id,booking_status,payment_status);
create index if not exists event_purchases_code
  on public.event_purchases(code_kind,code,paid_at)
  where code is not null;

alter table public.promo_codes enable row level security;
alter table public.event_purchases enable row level security;

revoke all on public.promo_codes,public.event_purchases from public,anon,authenticated;
grant select,insert,update,delete on public.promo_codes to authenticated;
grant select on public.event_purchases to authenticated;
grant all on public.promo_codes,public.event_purchases to service_role;

drop policy if exists promo_codes_admin on public.promo_codes;
create policy promo_codes_admin
on public.promo_codes
for all
to authenticated
using((select public.is_admin()))
with check((select public.is_admin()));

drop policy if exists own_event_purchases on public.event_purchases;
create policy own_event_purchases
on public.event_purchases
for select
to authenticated
using((select auth.uid())=user_id);

create or replace function roundy_private.touch_promo_code()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  new.updated_at=now();
  new.code=upper(btrim(new.code));
  return new;
end;
$$;

drop trigger if exists promo_codes_touch on public.promo_codes;
create trigger promo_codes_touch
before insert or update on public.promo_codes
for each row execute function roundy_private.touch_promo_code();

create or replace function roundy_private.event_price_quote_for_user(
  p_event uuid,
  p_user uuid,
  p_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  e public.events;
  profile_data jsonb;
  user_gender text;
  original_amount integer;
  normalized_code text:=upper(btrim(coalesce(p_code,'')));
  referral public.referral_codes;
  promo public.promo_codes;
  code_kind text:='none';
  code_valid boolean:=false;
  code_reason text:='none';
  code_rate integer:=0;
  referral_discount integer:=0;
  promo_discount integer:=0;
  balance_discount integer:=0;
  time_discount integer:=0;
  time_kind text:='none';
  boomerang_discount integer:=0;
  total_discount integer:=0;
  final_amount integer:=0;
  male_count integer:=0;
  female_count integer:=0;
  same_count integer:=0;
  opposite_count integer:=0;
  hours_to_start numeric;
  returning_user boolean:=false;
begin
  if p_user is null then raise exception 'Sign in required'; end if;

  select * into e
  from public.events
  where id=p_event;

  if e.id is null or e.status<>'live' or e.starts_at<=now() or e.seats_remaining<1 then
    raise exception 'Event unavailable';
  end if;

  select profile into profile_data
  from public.profiles
  where user_id=p_user;

  user_gender:=coalesce(profile_data->>'gender','');
  if user_gender not in('male','female') then
    raise exception 'Complete your gender before checkout';
  end if;

  original_amount:=case user_gender
    when 'male' then e.male_price_krw
    else e.female_price_krw
  end;

  select
    count(*) filter(where p.profile->>'gender'='male')::integer,
    count(*) filter(where p.profile->>'gender'='female')::integer
  into male_count,female_count
  from public.bookings b
  join public.profiles p on p.user_id=b.user_id
  where b.event_id=e.id;

  same_count:=case user_gender when 'male' then male_count else female_count end;
  opposite_count:=case user_gender when 'male' then female_count else male_count end;

  if same_count+2<=opposite_count then
    balance_discount:=round(original_amount*0.10)::integer;
  end if;

  hours_to_start:=extract(epoch from (e.starts_at-now()))/3600.0;
  if hours_to_start>=240 then
    time_kind:='early_bird';
    time_discount:=round(original_amount*0.05)::integer;
  elsif hours_to_start<=72 and hours_to_start>0 then
    time_kind:='last_minute';
    time_discount:=round(original_amount*0.05)::integer;
  end if;

  returning_user:=
    exists(
      select 1
      from public.event_purchases ep
      where ep.user_id=p_user and ep.paid_at is not null
    )
    or exists(
      select 1
      from public.credit_lots cl
      where cl.user_id=p_user
        and cl.purchased_at is not null
        and cl.payment_reference not like 'referral:%'
    );

  if returning_user then
    boomerang_discount:=round(original_amount*0.05)::integer;
  end if;

  if normalized_code<>'' then
    select r.* into referral
    from public.referral_codes r
    join public.members m on m.id=r.referrer_user_id
    where r.code=normalized_code
      and r.active
      and m.deleted_at is null
    limit 1;

    if referral.code is not null then
      if referral.referrer_user_id=p_user then
        code_reason:='self';
      elsif exists(
        select 1 from public.referral_redemptions rr where rr.referred_user_id=p_user
      ) or exists(
        select 1 from public.event_purchases ep
        where ep.user_id=p_user
          and ep.code_kind='referral'
          and ep.paid_at is not null
      ) then
        code_reason:='already_redeemed';
      else
        code_kind:='referral';
        code_valid:=true;
        code_reason:='valid';
        code_rate:=10;
        referral_discount:=round(original_amount*0.10)::integer;
      end if;
    else
      select pc.* into promo
      from public.promo_codes pc
      where pc.code=normalized_code
        and pc.active
        and (pc.event_id is null or pc.event_id=e.id)
        and (pc.starts_at is null or pc.starts_at<=now())
        and (pc.ends_at is null or pc.ends_at>now())
        and (
          pc.max_redemptions is null
          or (
            select count(*)
            from public.event_purchases ep
            where ep.code_kind='promo'
              and ep.code=pc.code
              and ep.paid_at is not null
          )<pc.max_redemptions
        )
      limit 1;

      if promo.code is not null then
        code_kind:='promo';
        code_valid:=true;
        code_reason:='valid';
        code_rate:=promo.discount_percent;
        promo_discount:=round(original_amount*promo.discount_percent/100.0)::integer;
      else
        code_reason:='invalid';
      end if;
    end if;
  end if;

  total_discount:=referral_discount+promo_discount+balance_discount+time_discount+boomerang_discount;
  final_amount:=greatest(0,original_amount-total_discount);

  return jsonb_build_object(
    'event_id',e.id,
    'gender',user_gender,
    'original_amount',original_amount,
    'code',nullif(normalized_code,''),
    'code_kind',code_kind,
    'code_valid',code_valid,
    'code_reason',code_reason,
    'code_discount_percent',code_rate,
    'referral_discount_amount',referral_discount,
    'promo_discount_amount',promo_discount,
    'gender_balance_discount_amount',balance_discount,
    'gender_balance_applied',balance_discount>0,
    'time_discount_amount',time_discount,
    'time_discount_kind',time_kind,
    'boomerang_discount_amount',boomerang_discount,
    'boomerang_applied',returning_user,
    'total_discount_amount',total_discount,
    'total_discount_percent',round(total_discount*100.0/original_amount)::integer,
    'final_amount',final_amount,
    'male_count',male_count,
    'female_count',female_count,
    'hours_to_start',round(hours_to_start,2)
  );
end;
$$;

create or replace function public.event_price_quote(
  p_event uuid,
  p_code text default null
)
returns jsonb
language sql
security definer
set search_path=''
as $
  select roundy_private.event_price_quote_for_user(p_event,(select auth.uid()),p_code);
$;

-- New per-event purchases do not restore a discount or create a reusable ticket on
-- cancellation. Legacy credit-backed bookings keep their original credit behavior.
create or replace function roundy_private.cancel_booking(p_event uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  e public.events;
  b public.bookings;
begin
  if u is null then raise exception 'Sign in required'; end if;

  select * into e
  from public.events
  where id=p_event
  for update;

  if e.id is null then raise exception 'Event unavailable'; end if;

  select * into b
  from public.bookings
  where event_id=p_event and user_id=u
  for update;

  if b.id is null then raise exception 'Booking not found'; end if;
  if b.checked_in_at is not null then raise exception 'Checked-in bookings cannot be cancelled'; end if;
  if now()>=e.starts_at-make_interval(mins=>e.lockdown_minutes) then
    raise exception 'Event cancellation is locked';
  end if;

  update public.event_purchases
  set booking_status='cancelled',cancelled_at=now(),updated_at=now()
  where booking_id=b.id
    and user_id=u;

  delete from public.bookings where id=b.id;

  -- Transitional compatibility only. New per-event purchases have no credit lot.
  if b.credit_lot_id is not null then
    update public.credit_lots
    set remaining=least(quantity,remaining+1)
    where id=b.credit_lot_id and user_id=u;
  end if;

  update public.reminder_deliveries
  set status='cancelled',updated_at=now()
  where event_id=p_event
    and user_id=u
    and status in('queued','processing');

  return true;
end;
$$;

revoke all on function roundy_private.touch_promo_code(),
  roundy_private.event_price_quote_for_user(uuid,uuid,text),
  public.event_price_quote(uuid,text)
from public,anon,authenticated,service_role;

grant execute on function public.event_price_quote(uuid,text)
to authenticated,service_role;
grant execute on function roundy_private.event_price_quote_for_user(uuid,uuid,text)
to service_role;

commit;
