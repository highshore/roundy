begin;

-- Event-scoped pricing. Defaults match the current Roundy 1:1 Mingle price card,
-- while keeping each event independently configurable later.
alter table public.events
  add column if not exists price_gents integer not null default 49000 check(price_gents>=0),
  add column if not exists price_ladies integer not null default 29000 check(price_ladies>=0),
  add column if not exists early_bird_hours integer not null default 240 check(early_bird_hours>=0),
  add column if not exists last_minute_hours integer not null default 72 check(last_minute_hours>=0);

-- Legacy referral-code metadata remains unchanged for historical compatibility.
-- The new event checkout applies its own fixed 20% referral / promo discount.

create table if not exists public.marketing_promo_codes(
  code text primary key check(code ~ '^[A-Z0-9_-]{4,24}$'),
  campaign_name text not null default '',
  discount_percent smallint not null default 20 check(discount_percent=20),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer check(max_redemptions is null or max_redemptions>0),
  created_at timestamptz not null default now(),
  check(ends_at is null or starts_at is null or ends_at>starts_at)
);

create table if not exists public.event_payment_orders(
  order_number text primary key,
  charge_order_number text not null unique,
  event_id uuid not null references public.events(id),
  user_id uuid not null references public.members(id),
  status text not null check(status in(
    'pending_auth','charging','completed','failed','refunding',
    'refunded','refunded_pending_reconcile'
  )),
  gender text not null check(gender in('male','female')),
  base_amount integer not null check(base_amount>=0),
  code_kind text check(code_kind in('referral','marketing')),
  discount_code text,
  code_discount_amount integer not null default 0 check(code_discount_amount>=0),
  gender_balance_discount_amount integer not null default 0 check(gender_balance_discount_amount>=0),
  time_discount_amount integer not null default 0 check(time_discount_amount>=0),
  time_discount_kind text check(time_discount_kind in('early_bird','last_minute')),
  boomerang_discount_amount integer not null default 0 check(boomerang_discount_amount>=0),
  discount_amount integer not null check(discount_amount>=0),
  amount integer not null check(amount>=0),
  pricing_snapshot jsonb not null default '{}'::jsonb,
  terms_accepted_at timestamptz not null,
  billing_key_used text,
  authorization_response jsonb,
  payment_result jsonb,
  refund_response jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  check(amount=greatest(0,base_amount-discount_amount)),
  check(discount_amount=code_discount_amount+gender_balance_discount_amount+time_discount_amount+boomerang_discount_amount),
  check((code_kind is null and discount_code is null and code_discount_amount=0) or
        (code_kind is not null and discount_code is not null))
);

create unique index if not exists event_payment_one_active_order
  on public.event_payment_orders(event_id,user_id)
  where status in('pending_auth','charging','refunding');

create index if not exists event_payment_orders_user_history
  on public.event_payment_orders(user_id,created_at desc);
create index if not exists event_payment_orders_event_history
  on public.event_payment_orders(event_id,created_at desc);

alter table public.bookings
  add column if not exists payment_order_number text unique
  references public.event_payment_orders(order_number);

create table if not exists public.checkout_discount_redemptions(
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in('referral','marketing')),
  code text not null,
  user_id uuid not null references public.members(id),
  event_id uuid not null references public.events(id),
  payment_order_number text not null unique references public.event_payment_orders(order_number),
  discount_amount integer not null check(discount_amount>0),
  status text not null default 'reserved' check(status in('reserved','consumed')),
  reserved_at timestamptz not null default now(),
  consumed_at timestamptz,
  unique(kind,code,user_id)
);

alter table public.marketing_promo_codes enable row level security;
alter table public.event_payment_orders enable row level security;
alter table public.checkout_discount_redemptions enable row level security;

revoke all on public.marketing_promo_codes,public.event_payment_orders,public.checkout_discount_redemptions
from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_promo_codes to authenticated;
grant select on public.event_payment_orders to authenticated;
grant all on public.marketing_promo_codes,public.event_payment_orders,public.checkout_discount_redemptions to service_role;

drop policy if exists marketing_promo_admin on public.marketing_promo_codes;
create policy marketing_promo_admin on public.marketing_promo_codes
for all to authenticated
using((select public.is_admin()))
with check((select public.is_admin()));

drop policy if exists own_event_payment_orders on public.event_payment_orders;
create policy own_event_payment_orders on public.event_payment_orders
for select to authenticated
using(user_id=(select auth.uid()));

-- Keep event capacity derived from confirmed/held bookings rather than relying on
-- callers to remember to mutate seats_remaining.
create or replace function roundy_private.sync_event_seats()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  target_event uuid:=coalesce(new.event_id,old.event_id);
begin
  update public.events e
  set seats_remaining=greatest(
    0,
    e.capacity-(select count(*)::int from public.bookings b where b.event_id=target_event)
  )
  where e.id=target_event;
  return coalesce(new,old);
end;
$$;

drop trigger if exists sync_event_seats on public.bookings;
create trigger sync_event_seats
after insert or delete or update of event_id on public.bookings
for each row execute function roundy_private.sync_event_seats();

update public.events e
set seats_remaining=greatest(
  0,
  e.capacity-(select count(*)::int from public.bookings b where b.event_id=e.id)
);

create or replace function roundy_private.event_checkout_quote(p_event uuid,p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  e public.events;
  profile_data jsonb;
  member_gender text;
  base_amount int;
  women_count int:=0;
  men_count int:=0;
  own_count int:=0;
  opposite_count int:=0;
  normalized text:=upper(btrim(coalesce(p_code,'')));
  code_kind text;
  code_valid boolean;
  code_reason text;
  code_discount int:=0;
  gender_discount int:=0;
  time_discount int:=0;
  time_kind text;
  boomerang_discount int:=0;
  total_discount int:=0;
  final_amount int:=0;
  hours_until numeric;
  referral public.referral_codes;
  promo public.marketing_promo_codes;
  is_boomerang boolean:=false;
begin
  if u is null then raise exception 'Sign in required'; end if;

  select * into e
  from public.events
  where id=p_event;

  if e.id is null or e.status<>'live' or e.starts_at<=now() then
    raise exception 'Event is not accepting payments';
  end if;

  if exists(select 1 from public.bookings where event_id=p_event and user_id=u) then
    raise exception 'Seat already confirmed';
  end if;

  select profile into profile_data
  from public.profiles
  where user_id=u;

  member_gender:=coalesce(profile_data->>'gender','');
  if member_gender not in('male','female') then
    raise exception 'Complete your profile before checkout';
  end if;

  select
    count(*) filter(where p.profile->>'gender'='female')::int,
    count(*) filter(where p.profile->>'gender'='male')::int
  into women_count,men_count
  from public.bookings b
  join public.profiles p on p.user_id=b.user_id
  where b.event_id=p_event;

  own_count:=case member_gender when 'female' then women_count else men_count end;
  opposite_count:=case member_gender when 'female' then men_count else women_count end;

  if e.seats_remaining<1 or own_count>=e.capacity/2 then
    raise exception 'No place available for your participant group';
  end if;

  base_amount:=case member_gender when 'female' then e.price_ladies else e.price_gents end;

  if own_count+2<=opposite_count then
    gender_discount:=round(base_amount*0.10)::int;
  end if;

  hours_until:=extract(epoch from (e.starts_at-now()))/3600.0;
  if hours_until>=e.early_bird_hours then
    time_kind:='early_bird';
    time_discount:=round(base_amount*0.05)::int;
  elsif hours_until<=e.last_minute_hours then
    time_kind:='last_minute';
    time_discount:=round(base_amount*0.05)::int;
  end if;

  select exists(
    select 1
    from public.event_payment_orders o
    where o.user_id=u and o.paid_at is not null
  ) into is_boomerang;

  if is_boomerang then
    boomerang_discount:=round(base_amount*0.05)::int;
  end if;

  if normalized<>'' then
    select r.* into referral
    from public.referral_codes r
    join public.members m on m.id=r.referrer_user_id
    where r.code=normalized and r.active and m.deleted_at is null
    limit 1;

    if referral.code is not null then
      code_kind:='referral';
      if referral.referrer_user_id=u then
        code_valid:=false;
        code_reason:='self';
      elsif exists(select 1 from public.referral_redemptions rr where rr.referred_user_id=u)
        or exists(
          select 1 from public.checkout_discount_redemptions d
          where d.kind='referral' and d.user_id=u and d.status in('reserved','consumed')
        ) then
        code_valid:=false;
        code_reason:='already_redeemed';
      else
        code_valid:=true;
        code_reason:='valid';
      end if;
    else
      select p.* into promo
      from public.marketing_promo_codes p
      where p.code=normalized
        and p.active
        and (p.starts_at is null or p.starts_at<=now())
        and (p.ends_at is null or p.ends_at>now())
      limit 1;

      if promo.code is not null then
        code_kind:='marketing';
        if exists(
          select 1 from public.checkout_discount_redemptions d
          where d.kind='marketing' and d.code=normalized and d.user_id=u
            and d.status in('reserved','consumed')
        ) then
          code_valid:=false;
          code_reason:='already_redeemed';
        elsif promo.max_redemptions is not null and (
          select count(*) from public.checkout_discount_redemptions d
          where d.kind='marketing' and d.code=normalized and d.status in('reserved','consumed')
        )>=promo.max_redemptions then
          code_valid:=false;
          code_reason:='exhausted';
        else
          code_valid:=true;
          code_reason:='valid';
        end if;
      else
        code_valid:=false;
        code_reason:='invalid';
      end if;
    end if;

    if code_valid is true then
      code_discount:=round(base_amount*0.20)::int;
    end if;
  end if;

  total_discount:=code_discount+gender_discount+time_discount+boomerang_discount;
  final_amount:=greatest(0,base_amount-total_discount);

  return jsonb_build_object(
    'event_id',e.id,
    'gender',member_gender,
    'base_amount',base_amount,
    'code',nullif(normalized,''),
    'code_kind',code_kind,
    'code_valid',code_valid,
    'code_reason',code_reason,
    'code_discount_percent',case when code_discount>0 then 20 else 0 end,
    'code_discount_amount',code_discount,
    'gender_balance_discount_percent',case when gender_discount>0 then 10 else 0 end,
    'gender_balance_discount_amount',gender_discount,
    'time_discount_percent',case when time_discount>0 then 5 else 0 end,
    'time_discount_amount',time_discount,
    'time_discount_kind',time_kind,
    'boomerang_discount_percent',case when boomerang_discount>0 then 5 else 0 end,
    'boomerang_discount_amount',boomerang_discount,
    'discount_amount',total_discount,
    'final_amount',final_amount,
    'women_count',women_count,
    'men_count',men_count,
    'hours_until_event',hours_until,
    'is_boomerang',is_boomerang
  );
end;
$$;

create or replace function public.event_checkout_quote(p_event uuid,p_code text default null)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select roundy_private.event_checkout_quote(p_event,p_code);
$$;

-- Called only by the payment Edge Function after Payple authorization succeeds.
-- It atomically holds the seat and reserves any one-time code before the card charge.
create or replace function roundy_private.claim_event_payment_order(p_order text,p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  o public.event_payment_orders;
  e public.events;
  profile_data jsonb;
  member_gender text;
  same_gender_bookings int;
  existing_booking uuid;
  redemption_id uuid;
  promo public.marketing_promo_codes;
begin
  select * into o
  from public.event_payment_orders
  where order_number=p_order and user_id=p_user
  for update;

  if o.order_number is null then raise exception 'Payment order not found'; end if;
  if o.status='completed' then
    select id into existing_booking from public.bookings where payment_order_number=o.order_number;
    return jsonb_build_object('booking_id',existing_booking,'charge_order_number',o.charge_order_number,'amount',o.amount,'already_completed',true);
  end if;
  if o.status<>'pending_auth' then raise exception 'Payment order is not payable'; end if;

  select * into e from public.events where id=o.event_id for update;
  if e.id is null or e.status<>'live' or e.starts_at<=now() or e.seats_remaining<1 then
    raise exception 'No place available';
  end if;

  if exists(select 1 from public.bookings where event_id=o.event_id and user_id=p_user) then
    raise exception 'Seat already confirmed';
  end if;

  select profile into profile_data from public.profiles where user_id=p_user;
  member_gender:=coalesce(profile_data->>'gender','');
  if member_gender<>o.gender then raise exception 'Profile changed after checkout quote'; end if;

  if e.theme='1:1 Speed Mingle' then
    select count(*)::int into same_gender_bookings
    from public.bookings b
    join public.profiles p on p.user_id=b.user_id
    where b.event_id=e.id and p.profile->>'gender'=member_gender;
    if same_gender_bookings>=e.capacity/2 then
      raise exception 'Your participant group is full';
    end if;
  end if;

  if o.code_kind='referral' then
    if not exists(
      select 1 from public.referral_codes r
      join public.members m on m.id=r.referrer_user_id
      where r.code=o.discount_code and r.active and m.deleted_at is null
        and r.referrer_user_id<>p_user
    ) then raise exception 'Referral code is no longer available'; end if;

    if exists(select 1 from public.referral_redemptions rr where rr.referred_user_id=p_user)
      or exists(
        select 1 from public.checkout_discount_redemptions d
        where d.kind='referral' and d.user_id=p_user
      ) then raise exception 'Referral code has already been used'; end if;

    insert into public.checkout_discount_redemptions(
      kind,code,user_id,event_id,payment_order_number,discount_amount,status
    ) values('referral',o.discount_code,p_user,o.event_id,o.order_number,o.code_discount_amount,'reserved')
    returning id into redemption_id;
  elsif o.code_kind='marketing' then
    select * into promo
    from public.marketing_promo_codes
    where code=o.discount_code and active
      and (starts_at is null or starts_at<=now())
      and (ends_at is null or ends_at>now())
    for update;

    if promo.code is null then raise exception 'Promo code is no longer available'; end if;
    if exists(
      select 1 from public.checkout_discount_redemptions d
      where d.kind='marketing' and d.code=o.discount_code and d.user_id=p_user
    ) then raise exception 'Promo code has already been used'; end if;
    if promo.max_redemptions is not null and (
      select count(*) from public.checkout_discount_redemptions d
      where d.kind='marketing' and d.code=o.discount_code
    )>=promo.max_redemptions then raise exception 'Promo code is fully redeemed'; end if;

    insert into public.checkout_discount_redemptions(
      kind,code,user_id,event_id,payment_order_number,discount_amount,status
    ) values('marketing',o.discount_code,p_user,o.event_id,o.order_number,o.code_discount_amount,'reserved')
    returning id into redemption_id;
  end if;

  insert into public.bookings(event_id,user_id,credit_lot_id,terms_accepted_at,payment_order_number)
  values(o.event_id,p_user,null,o.terms_accepted_at,o.order_number)
  returning id into existing_booking;

  update public.event_payment_orders
  set status='charging',updated_at=now()
  where order_number=o.order_number;

  return jsonb_build_object(
    'booking_id',existing_booking,
    'charge_order_number',o.charge_order_number,
    'amount',o.amount,
    'already_completed',false
  );
end;
$$;

create or replace function roundy_private.complete_event_payment_order(
  p_order text,p_user uuid,p_billing_key text,p_authorization jsonb,p_payment_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  booking_id uuid;
begin
  if not exists(
    select 1 from public.event_payment_orders
    where order_number=p_order and user_id=p_user and status in('charging','completed')
  ) then raise exception 'Payment order is not in a completable state'; end if;

  update public.event_payment_orders
  set status='completed',
      billing_key_used=p_billing_key,
      authorization_response=p_authorization,
      payment_result=p_payment_result,
      paid_at=coalesce(paid_at,now()),
      updated_at=now(),
      error_code=null,
      error_message=null
  where order_number=p_order and user_id=p_user;

  update public.checkout_discount_redemptions
  set status='consumed',consumed_at=coalesce(consumed_at,now())
  where payment_order_number=p_order;

  select id into booking_id
  from public.bookings
  where payment_order_number=p_order;

  return booking_id;
end;
$$;

create or replace function roundy_private.fail_event_payment_order(
  p_order text,p_user uuid,p_error_code text,p_error_message text,p_authorization jsonb default null,p_payment_result jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from public.bookings
  where payment_order_number=p_order and user_id=p_user;

  delete from public.checkout_discount_redemptions
  where payment_order_number=p_order and status='reserved';

  update public.event_payment_orders
  set status='failed',
      authorization_response=coalesce(p_authorization,authorization_response),
      payment_result=coalesce(p_payment_result,payment_result),
      error_code=p_error_code,
      error_message=p_error_message,
      updated_at=now()
  where order_number=p_order and user_id=p_user and status<>'completed';

  return true;
end;
$$;

create or replace function roundy_private.prepare_event_refund(p_order text,p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  o public.event_payment_orders;
  e public.events;
  b public.bookings;
begin
  select * into o
  from public.event_payment_orders
  where order_number=p_order and user_id=p_user
  for update;

  if o.order_number is null then raise exception 'Payment order not found'; end if;

  select * into b from public.bookings where payment_order_number=o.order_number and user_id=p_user for update;
  select * into e from public.events where id=o.event_id for share;

  if o.status='refunded' then
    return jsonb_build_object('already_refunded',true,'amount',o.amount,'charge_order_number',o.charge_order_number,'payment_result',o.payment_result,'paid_at',o.paid_at);
  end if;
  if o.status='refunded_pending_reconcile' then
    return jsonb_build_object('needs_reconcile',true,'amount',o.amount,'charge_order_number',o.charge_order_number,'payment_result',o.payment_result,'refund_response',o.refund_response,'paid_at',o.paid_at);
  end if;
  if o.status<>'completed' then raise exception 'Payment is not refundable'; end if;
  if b.id is null then raise exception 'Booking not found'; end if;
  if b.checked_in_at is not null then raise exception 'Checked-in bookings cannot be cancelled'; end if;
  if now()>=e.starts_at-make_interval(mins=>e.lockdown_minutes) then
    raise exception 'Event cancellation is locked';
  end if;

  update public.event_payment_orders
  set status='refunding',updated_at=now()
  where order_number=o.order_number;

  return jsonb_build_object(
    'already_refunded',false,
    'needs_reconcile',false,
    'amount',o.amount,
    'charge_order_number',o.charge_order_number,
    'payment_result',o.payment_result,
    'paid_at',o.paid_at
  );
end;
$$;

create or replace function roundy_private.complete_event_refund(
  p_order text,p_user uuid,p_refund_response jsonb
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  event_to_cancel uuid;
begin
  select event_id into event_to_cancel
  from public.event_payment_orders
  where order_number=p_order and user_id=p_user
  for update;

  if event_to_cancel is null then raise exception 'Payment order not found'; end if;

  delete from public.bookings
  where payment_order_number=p_order and user_id=p_user;

  update public.reminder_deliveries
  set status='cancelled',updated_at=now()
  where event_id=event_to_cancel and user_id=p_user and status in('queued','processing');

  -- Deliberately retain checkout_discount_redemptions. Referral/promo discounts
  -- are consumed by the successful purchase and never restored on cancellation.
  update public.event_payment_orders
  set status='refunded',
      refund_response=p_refund_response,
      refunded_at=coalesce(refunded_at,now()),
      updated_at=now()
  where order_number=p_order and user_id=p_user;

  return true;
end;
$$;

create or replace function roundy_private.mark_event_refund_reconcile(
  p_order text,p_user uuid,p_refund_response jsonb,p_error_message text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.event_payment_orders
  set status='refunded_pending_reconcile',
      refund_response=p_refund_response,
      error_message=p_error_message,
      updated_at=now()
  where order_number=p_order and user_id=p_user;
  return true;
end;
$$;

create or replace function roundy_private.fail_event_refund(
  p_order text,p_user uuid,p_error_code text,p_error_message text,p_refund_response jsonb
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.event_payment_orders
  set status='completed',
      refund_response=p_refund_response,
      error_code=p_error_code,
      error_message=p_error_message,
      updated_at=now()
  where order_number=p_order and user_id=p_user and status='refunding';
  return true;
end;
$$;

-- Service-only public wrappers let the Edge Function call transactional helpers
-- through PostgREST without exposing the private schema.
create or replace function public.claim_event_payment_order(p_order text,p_user uuid)
returns jsonb language sql security definer set search_path='' as $$
  select roundy_private.claim_event_payment_order(p_order,p_user);
$;

create or replace function public.complete_event_payment_order(
  p_order text,p_user uuid,p_billing_key text,p_authorization jsonb,p_payment_result jsonb
)
returns uuid language sql security definer set search_path='' as $$
  select roundy_private.complete_event_payment_order(p_order,p_user,p_billing_key,p_authorization,p_payment_result);
$;

create or replace function public.fail_event_payment_order(
  p_order text,p_user uuid,p_error_code text,p_error_message text,p_authorization jsonb default null,p_payment_result jsonb default null
)
returns boolean language sql security definer set search_path='' as $$
  select roundy_private.fail_event_payment_order(p_order,p_user,p_error_code,p_error_message,p_authorization,p_payment_result);
$;

create or replace function public.prepare_event_refund(p_order text,p_user uuid)
returns jsonb language sql security definer set search_path='' as $$
  select roundy_private.prepare_event_refund(p_order,p_user);
$;

create or replace function public.complete_event_refund(p_order text,p_user uuid,p_refund_response jsonb)
returns boolean language sql security definer set search_path='' as $$
  select roundy_private.complete_event_refund(p_order,p_user,p_refund_response);
$;

create or replace function public.mark_event_refund_reconcile(
  p_order text,p_user uuid,p_refund_response jsonb,p_error_message text
)
returns boolean language sql security definer set search_path='' as $$
  select roundy_private.mark_event_refund_reconcile(p_order,p_user,p_refund_response,p_error_message);
$;

create or replace function public.fail_event_refund(
  p_order text,p_user uuid,p_error_code text,p_error_message text,p_refund_response jsonb
)
returns boolean language sql security definer set search_path='' as $$
  select roundy_private.fail_event_refund(p_order,p_user,p_error_code,p_error_message,p_refund_response);
$;

-- Account deletion must never silently discard a paid future seat. A member must
-- first cancel/refund every paid future booking through the payment path.
create or replace function roundy_private.anonymize_account()
returns boolean
language plpgsql
security definer
set search_path=''
as $
declare
  u uuid:=auth.uid();
begin
  if u is null then raise exception 'Sign in required'; end if;

  if exists(
    select 1
    from public.bookings b
    join public.events e on e.id=b.event_id
    join public.event_payment_orders o on o.order_number=b.payment_order_number
    where b.user_id=u
      and e.starts_at>now()
      and o.status in('completed','refunding','refunded_pending_reconcile')
  ) then
    raise exception 'Cancel and refund paid future events before deleting your account';
  end if;

  insert into public.members(id,auth_user_id)
  values(u,u)
  on conflict(id) do nothing;

  delete from public.bookings b
  using public.events e
  where b.user_id=u
    and b.event_id=e.id
    and e.starts_at>now();

  delete from public.applications a
  using public.events e
  where a.user_id=u
    and a.event_id=e.id
    and e.starts_at>now();

  update public.reminder_deliveries
  set status='cancelled',updated_at=now()
  where user_id=u and status in('queued','processing');

  delete from public.verifications where user_id=u;
  delete from public.profiles where user_id=u;
  delete from public.user_roles where user_id=u;
  delete from public.staff where user_id=u;

  update public.members
  set auth_user_id=null,
      deleted_at=now()
  where id=u;

  return true;
end;
$;

-- Legacy ticket bookings still restore their credit. Paid-event bookings must
-- go through the payment refund path so only the amount actually paid is returned.
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

  select * into e from public.events where id=p_event for update;
  if e.id is null then raise exception 'Event unavailable'; end if;

  select * into b
  from public.bookings
  where event_id=p_event and user_id=u
  for update;

  if b.id is null then raise exception 'Booking not found'; end if;
  if b.payment_order_number is not null then
    raise exception 'Paid bookings must be cancelled through payment checkout';
  end if;
  if b.checked_in_at is not null then raise exception 'Checked-in bookings cannot be cancelled'; end if;
  if now()>=e.starts_at-make_interval(mins=>e.lockdown_minutes) then
    raise exception 'Event cancellation is locked';
  end if;

  delete from public.bookings where id=b.id;

  if b.credit_lot_id is not null then
    update public.credit_lots
    set remaining=least(quantity,remaining+1)
    where id=b.credit_lot_id and user_id=u;
  end if;

  update public.reminder_deliveries
  set status='cancelled',updated_at=now()
  where event_id=p_event and user_id=u and status in('queued','processing');

  return true;
end;
$$;

revoke all on function roundy_private.sync_event_seats(),
  roundy_private.event_checkout_quote(uuid,text),
  public.event_checkout_quote(uuid,text),
  public.claim_event_payment_order(text,uuid),
  public.complete_event_payment_order(text,uuid,text,jsonb,jsonb),
  public.fail_event_payment_order(text,uuid,text,text,jsonb,jsonb),
  public.prepare_event_refund(text,uuid),
  public.complete_event_refund(text,uuid,jsonb),
  public.mark_event_refund_reconcile(text,uuid,jsonb,text),
  public.fail_event_refund(text,uuid,text,text,jsonb),
  roundy_private.claim_event_payment_order(text,uuid),
  roundy_private.complete_event_payment_order(text,uuid,text,jsonb,jsonb),
  roundy_private.fail_event_payment_order(text,uuid,text,text,jsonb,jsonb),
  roundy_private.prepare_event_refund(text,uuid),
  roundy_private.complete_event_refund(text,uuid,jsonb),
  roundy_private.mark_event_refund_reconcile(text,uuid,jsonb,text),
  roundy_private.fail_event_refund(text,uuid,text,text,jsonb)
from public,anon,authenticated,service_role;

grant execute on function roundy_private.sync_event_seats() to service_role;
grant execute on function roundy_private.event_checkout_quote(uuid,text),public.event_checkout_quote(uuid,text)
to authenticated,service_role;
grant execute on function public.claim_event_payment_order(text,uuid),
  public.complete_event_payment_order(text,uuid,text,jsonb,jsonb),
  public.fail_event_payment_order(text,uuid,text,text,jsonb,jsonb),
  public.prepare_event_refund(text,uuid),
  public.complete_event_refund(text,uuid,jsonb),
  public.mark_event_refund_reconcile(text,uuid,jsonb,text),
  public.fail_event_refund(text,uuid,text,text,jsonb),
  roundy_private.claim_event_payment_order(text,uuid),
  roundy_private.complete_event_payment_order(text,uuid,text,jsonb,jsonb),
  roundy_private.fail_event_payment_order(text,uuid,text,text,jsonb,jsonb),
  roundy_private.prepare_event_refund(text,uuid),
  roundy_private.complete_event_refund(text,uuid,jsonb),
  roundy_private.mark_event_refund_reconcile(text,uuid,jsonb,text),
  roundy_private.fail_event_refund(text,uuid,text,text,jsonb)
to service_role;

revoke all on function roundy_private.cancel_booking(uuid),public.cancel_booking(uuid)
from public,anon,authenticated,service_role;
grant execute on function roundy_private.cancel_booking(uuid),public.cancel_booking(uuid)
to authenticated,service_role;

commit;
