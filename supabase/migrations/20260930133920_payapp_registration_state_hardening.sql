begin;

create table if not exists public.event_payment_order_events(
  id bigint generated always as identity primary key,
  order_number text not null references public.event_payment_orders(order_number) on delete cascade,
  event_id uuid not null references public.events(id),
  user_id uuid not null,
  event_type text not null,
  status_before text,
  status_after text not null,
  provider text,
  provider_payment_id text,
  provider_state text,
  amount integer not null,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists event_payment_order_events_order_history
  on public.event_payment_order_events(order_number,created_at,id);
create index if not exists event_payment_order_events_user_history
  on public.event_payment_order_events(user_id,created_at desc);

alter table public.event_payment_order_events enable row level security;
revoke all on public.event_payment_order_events from public,anon,authenticated;
grant select on public.event_payment_order_events to service_role;

create or replace function roundy_private.audit_event_payment_order()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  kind text;
begin
  if tg_op='INSERT' then
    kind:='order_created';
  elsif new.status is distinct from old.status then
    kind:='status_changed';
  elsif new.provider_feedback_at is distinct from old.provider_feedback_at then
    kind:='provider_feedback';
  elsif new.provider_payment_id is distinct from old.provider_payment_id then
    kind:='provider_linked';
  elsif new.error_code is distinct from old.error_code then
    kind:='error_changed';
  else
    return new;
  end if;

  insert into public.event_payment_order_events(
    order_number,event_id,user_id,event_type,status_before,status_after,
    provider,provider_payment_id,provider_state,amount,error_code
  ) values(
    new.order_number,new.event_id,new.user_id,kind,
    case when tg_op='INSERT' then null else old.status end,
    new.status,new.provider,new.provider_payment_id,
    new.payment_result->'payapp_feedback'->>'pay_state',
    new.amount,new.error_code
  );
  return new;
end;
$$;

revoke all on function roundy_private.audit_event_payment_order() from public,anon,authenticated;

drop trigger if exists audit_event_payment_order on public.event_payment_orders;
create trigger audit_event_payment_order
after insert or update on public.event_payment_orders
for each row execute function roundy_private.audit_event_payment_order();

insert into public.event_payment_order_events(
  order_number,event_id,user_id,event_type,status_before,status_after,
  provider,provider_payment_id,provider_state,amount,error_code,created_at
)
select
  o.order_number,o.event_id,o.user_id,'current_state',null,o.status,
  o.provider,o.provider_payment_id,
  o.payment_result->'payapp_feedback'->>'pay_state',
  o.amount,o.error_code,now()
from public.event_payment_orders o
where not exists(
  select 1 from public.event_payment_order_events h
  where h.order_number=o.order_number and h.event_type='current_state' and h.status_before is null
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
  code_discount_rate int:=0;
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
  active_snapshot jsonb;
begin
  if u is null then raise exception 'Sign in required'; end if;

  select * into e
  from public.events
  where id=p_event;

  if e.id is null or e.status<>'live' or e.starts_at<=now() then
    raise exception 'Event is not accepting payments';
  end if;

  select o.pricing_snapshot into active_snapshot
  from public.event_payment_orders o
  where o.event_id=p_event
    and o.user_id=u
    and o.status in('pending_auth','charging')
  order by o.created_at desc
  limit 1;

  if active_snapshot is not null then
    return active_snapshot;
  end if;

  if exists(
    select 1
    from public.bookings b
    left join public.event_payment_orders o on o.order_number=b.payment_order_number
    where b.event_id=p_event
      and b.user_id=u
      and (b.payment_order_number is null or o.status='completed')
  ) then
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
      code_discount_rate:=10;
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
        code_discount_rate:=promo.discount_percent;
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
      code_discount:=round(base_amount*code_discount_rate/100.0)::int;
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
    'code_discount_percent',case when code_discount>0 then code_discount_rate else 0 end,
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

commit;
