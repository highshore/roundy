begin;

-- Pre-launch hard reset: Roundy is payment-per-event only.
-- Remove legacy ticket/application state and wipe all pre-launch participation/payment data.

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
    join public.event_payment_orders o on o.order_number=b.payment_order_number
    where b.event_id=p_event
      and b.user_id=u
      and o.status='completed'
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
      elsif exists(
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

    if exists(
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

  insert into public.bookings(event_id,user_id,terms_accepted_at,payment_order_number)
  values(o.event_id,p_user,o.terms_accepted_at,o.order_number)
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

create or replace function roundy_private.event_attendees(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  e public.events;
  women jsonb;
  men jsonb;
  women_count int;
  men_count int;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into e from public.events where id=p_event;
  if e.id is null or (e.status<>'live' and not roundy_private.is_admin()) then
    raise exception 'Event unavailable';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object('photo',p.profile->'photos'->>0) order by b.created_at,b.id)
      filter(where p.profile->>'gender'='female'),'[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('photo',p.profile->'photos'->>0) order by b.created_at,b.id)
      filter(where p.profile->>'gender'='male'),'[]'::jsonb),
    count(*) filter(where p.profile->>'gender'='female')::int,
    count(*) filter(where p.profile->>'gender'='male')::int
  into women,men,women_count,men_count
  from public.bookings b
  join public.event_payment_orders o on o.order_number=b.payment_order_number
  left join public.profiles p on p.user_id=b.user_id
  where b.event_id=p_event
    and o.status='completed';

  return jsonb_build_object(
    'women',women,
    'men',men,
    'women_count',women_count,
    'men_count',men_count,
    'total',women_count+men_count
  );
end;
$$;

create or replace function roundy_private.can_view_attendee_photo(p_member uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
begin
  if u is null then return false; end if;
  if u=p_member or roundy_private.is_admin() then return true; end if;

  return exists(
    select 1
    from public.bookings b
    join public.events e on e.id=b.event_id
    join public.event_payment_orders o on o.order_number=b.payment_order_number
    where b.user_id=p_member
      and e.status='live'
      and e.starts_at>now()-interval '6 hours'
      and o.status='completed'
  ) or exists(
    select 1
    from public.matches m
    join public.events e on e.id=m.event_id
    left join public.event_sessions s on s.event_id=m.event_id
    join public.members a on a.id=u and a.deleted_at is null
    join public.members b on b.id=p_member and b.deleted_at is null
    where ((m.user_a=u and m.user_b=p_member) or (m.user_b=u and m.user_a=p_member))
      and (s.state='finished' or e.ends_at<=now())
  );
end;
$$;

create or replace function roundy_private.public_age_band(p_profile jsonb)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  raw_birth text:=coalesce(p_profile->>'birth_date','');
  birth_year int;
  decade int;
  band text;
begin
  if raw_birth !~ '^\d{4}-\d{2}-\d{2}$' then return 'unknown'; end if;
  begin
    birth_year:=extract(year from raw_birth::date)::int;
  exception when others then
    return 'unknown';
  end;
  decade:=((birth_year % 100) / 10) * 10;
  band:=case
    when (birth_year % 10)<=3 then 'early'
    when (birth_year % 10)<=6 then 'mid'
    else 'late'
  end;
  return lpad(decade::text,2,'0')||'_'||band;
end;
$$;

create or replace function roundy_private.public_job_group(p_profile jsonb)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  work text:=lower(
    case
      when coalesce(p_profile->>'public_job','')<>'' and lower(coalesce(p_profile->>'public_job',''))<>'professional'
        then coalesce(p_profile->>'public_job','')||' '||coalesce(p_profile->>'public_workplace','')
      else coalesce(p_profile->>'job_title','')||' '||coalesce(p_profile->>'workplace','')
    end
  );
begin
  if work ~ '(software|developer|engineer|programmer|data|technology)' then return 'developer'; end if;
  if work ~ '(doctor|physician|nurse|medical|healthcare|pharmac|dentist|hospital)' then return 'medical'; end if;
  if work ~ '(finance|bank|banking|investment|securit|insurance|asset management)' then return 'finance'; end if;
  if work ~ '(government|public sector|civil servant|public institution|public organization)' then return 'public'; end if;
  if work ~ '(large company|large corporation|conglomerate)' then return 'large_company'; end if;
  if work ~ '(lawyer|attorney|accountant|tax|consultant|researcher|professor|architect|professional)' then return 'professional'; end if;
  if work ~ '(teacher|education|school|university|academy)' then return 'education'; end if;
  if work ~ '(designer|design|artist|creative|content|media|writer|editor)' then return 'creative'; end if;
  if work ~ '(student)' then return 'student'; end if;
  if work ~ '(founder|owner|freelance|self-employed|entrepreneur)' then return 'self_employed'; end if;
  if work ~ '(sales|marketing|product manager|manager|business|strategy|operations|human resources|hr)' then return 'business'; end if;
  return 'office';
end;
$$;

create or replace function roundy_private.event_public_roster(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  e public.events;
  women jsonb;
  men jsonb;
  women_count int:=0;
  men_count int:=0;
  last_update timestamptz;
begin
  select * into e from public.events where id=p_event;
  if e.id is null or e.status<>'live' or e.deleted_at is not null then
    raise exception 'Event unavailable';
  end if;

  with confirmed as (
    select b.id,b.created_at,p.profile
    from public.bookings b
    join public.event_payment_orders o on o.order_number=b.payment_order_number
    join public.profiles p on p.user_id=b.user_id
    where b.event_id=p_event
      and o.status='completed'
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'age_band',roundy_private.public_age_band(profile),
          'job_group',roundy_private.public_job_group(profile)
        )
        order by created_at,id
      ) filter(where profile->>'gender'='female'),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'age_band',roundy_private.public_age_band(profile),
          'job_group',roundy_private.public_job_group(profile)
        )
        order by created_at,id
      ) filter(where profile->>'gender'='male'),
      '[]'::jsonb
    ),
    count(*) filter(where profile->>'gender'='female')::int,
    count(*) filter(where profile->>'gender'='male')::int,
    max(created_at)
  into women,men,women_count,men_count,last_update
  from confirmed;

  return jsonb_build_object(
    'women',women,
    'men',men,
    'women_count',women_count,
    'men_count',men_count,
    'total',women_count+men_count,
    'updated_at',last_update
  );
end;
$$;

create or replace function public.event_public_roster(p_event uuid)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select roundy_private.event_public_roster(p_event);
$$;

revoke all on function roundy_private.public_age_band(jsonb),
  roundy_private.public_job_group(jsonb),
  roundy_private.event_public_roster(uuid),
  public.event_public_roster(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.event_public_roster(uuid) to anon,authenticated,service_role;

create or replace function roundy_private.admin_delete_event(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  e public.events;
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into e from public.events where id=p_event for update;
  if e.id is null then raise exception 'Event not found'; end if;
  if e.deleted_at is not null then return jsonb_build_object('deleted',true); end if;

  if exists(
    select 1 from public.event_payment_orders o
    where o.event_id=p_event
      and o.status in('pending_auth','charging','completed','refunding','refunded_pending_reconcile')
  ) then
    raise exception 'Resolve active or paid payment orders before deleting this event';
  end if;

  update public.events set status='draft',deleted_at=now() where id=p_event;
  update public.reminder_deliveries set status='cancelled',updated_at=now()
  where event_id=p_event and status in('queued','processing');

  return jsonb_build_object('deleted',true);
end;
$$;

-- Hard reset all pre-launch participation state.
delete from public.event_choice_submissions;
delete from public.choices;
delete from public.matches;
delete from public.encounters;
delete from public.seating_plans;
delete from public.event_sessions;
delete from public.pair_exclusions;
delete from public.reminder_deliveries;
delete from public.checkout_discount_redemptions;
delete from public.bookings;
delete from public.event_payment_order_events;
delete from public.event_payment_orders;
delete from public.referral_redemptions;
delete from public.applications;

update public.events set seats_remaining=capacity;

-- Retire application/ticket/credit RPCs and storage.
drop function if exists public.apply(uuid);
drop function if exists roundy_private.apply(uuid);
drop function if exists public.redeem(uuid);
drop function if exists public.redeem(uuid,boolean);
drop function if exists roundy_private.redeem(uuid);
drop function if exists roundy_private.redeem(uuid,boolean);
drop function if exists public.redeem_referral(uuid,integer,text,boolean);
drop function if exists roundy_private.redeem_referral(uuid,integer,text,boolean);
drop function if exists public.referral_quote(text,integer);
drop function if exists roundy_private.referral_quote(text,integer);
drop function if exists roundy_private.redeem_with_credit(uuid,boolean,uuid);
drop function if exists public.cancel_booking(uuid);
drop function if exists roundy_private.cancel_booking(uuid);

drop table if exists public.applications cascade;
drop table if exists public.referral_redemptions cascade;

alter table public.bookings drop column if exists credit_lot_id;
drop table if exists public.credit_lots cascade;

alter table public.bookings
  alter column payment_order_number set not null,
  alter column terms_accepted_at set not null;

commit;
