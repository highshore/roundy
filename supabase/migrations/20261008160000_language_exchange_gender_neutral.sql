-- Gender-neutral, paid language exchange with safe defaults for all existing events.
-- Existing speed-mingle events continue to use gender-split capacity, prices and pairings.
alter table public.events
  add column if not exists gender_split_enabled boolean not null default true,
  add column if not exists price_general integer not null default 0;
alter table public.events drop constraint if exists events_theme_check;
alter table public.events add constraint events_theme_check
  check (theme in ('1:1 Speed Mingle','Business Talk','Language Exchange'));
alter table public.events drop constraint if exists events_price_general_valid;
alter table public.events add constraint events_price_general_valid
  check (price_general >= 0 and (gender_split_enabled or status <> 'live' or price_general >= 1000));
-- For an event that has been sold, neither its format nor its event category may be changed.
create or replace function roundy_private.protect_sold_event_format()
returns trigger language plpgsql security definer set search_path to ''
as $format$
begin
  if (old.gender_split_enabled is distinct from new.gender_split_enabled or old.theme is distinct from new.theme)
    and (exists(select 1 from public.bookings b where b.event_id=old.id)
         or exists(select 1 from public.event_payment_orders o
                    where o.event_id=old.id and o.status in ('pending_auth','charging','completed','refunding','refunded_pending_reconcile'))) then
    raise exception 'Cannot change the event format after bookings or payment orders exist';
  end if;
  return new;
end;
$format$;
drop trigger if exists events_format_lock on public.events;
create trigger events_format_lock before update on public.events
for each row execute function roundy_private.protect_sold_event_format();

-- Same-gender and mixed-gender conversations are both allowed in neutral events.
-- Generates unique one-to-one pairings. Odd groups take a rotating bye.
create or replace function roundy_private.build_neutral_seating(p_event uuid, p_checked_in boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $neutral$
declare
  participants uuid[];
  circle uuid[];
  rotated uuid[];
  actual_count integer;
  slot_count integer;
  r integer;
  i integer;
  left_id uuid;
  right_id uuid;
  left_code text;
  right_code text;
  skipped integer := 0;
  rows jsonb := '[]'::jsonb;
  roster jsonb := '[]'::jsonb;
begin
  select array_agg(b.user_id order by b.checked_in_at nulls last,b.created_at,b.user_id)
    into participants
  from public.bookings b
  where b.event_id=p_event and (not p_checked_in or b.checked_in_at is not null);
  actual_count:=coalesce(cardinality(participants),0);
  if actual_count<2 then raise exception 'At least two participants are required to generate seating'; end if;
  slot_count:=actual_count + (actual_count % 2);
  circle:=participants;
  if slot_count>actual_count then circle:=array_append(circle,null::uuid); end if;
  for i in 1..actual_count loop
    roster:=roster||jsonb_build_array(jsonb_build_object(
      'code','P'||i,
      'name',(select profile->>'full_name' from public.profiles where user_id=participants[i])
    ));
  end loop;
  delete from public.encounters where event_id=p_event;
  for r in 1..(slot_count-1) loop
    for i in 1..(slot_count/2) loop
      left_id:=circle[i];
      right_id:=circle[slot_count-i+1];
      if left_id is not null and right_id is not null then
        if exists(select 1 from public.pair_exclusions
          where user_a=least(left_id,right_id) and user_b=greatest(left_id,right_id)) then
          skipped:=skipped+1;
        else
          left_code:='P'||array_position(participants,left_id);
          right_code:='P'||array_position(participants,right_id);
          insert into public.encounters(event_id,user_a,user_b,round_number,table_number)
          values(p_event,left_id,right_id,r,i);
          rows:=rows||jsonb_build_array(jsonb_build_object(
            'round',r,'table',i,'left',left_code,'right',right_code
          ));
        end if;
      end if;
    end loop;
    rotated:=array[circle[1],circle[slot_count]];
    for i in 2..(slot_count-1) loop
      rotated:=array_append(rotated,circle[i]);
    end loop;
    circle:=rotated;
  end loop;
  if jsonb_array_length(rows)=0 then raise exception 'No safe pairings are available'; end if;
  return jsonb_build_object('rows',rows,'skipped',skipped,'roster',roster,'total_rounds',slot_count-1);
end;
$neutral$;

-- The checkout quote and seat claim are both enforced in the database.
CREATE OR REPLACE FUNCTION roundy_private.event_checkout_quote(p_event uuid, p_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if e.seats_remaining<1 or (e.gender_split_enabled and own_count>=e.capacity/2) then
    raise exception 'No place available for your participant group';
  end if;

  base_amount:=case when not e.gender_split_enabled then e.price_general when member_gender='female' then e.price_ladies else e.price_gents end;

  if e.gender_split_enabled and now()>=e.starts_at-make_interval(mins=>coalesce(e.lockdown_minutes,4320)) and own_count+2<=opposite_count then
    gender_discount:=round(base_amount*0.10)::int;
  end if;

  hours_until:=extract(epoch from (e.starts_at-now()))/3600.0;
  if hours_until<=coalesce(e.lockdown_minutes,4320)/60.0 then
    time_kind:='last_minute';
    time_discount:=round(base_amount*0.10)::int;
  elsif hours_until>=240 then
    time_kind:='early_bird';
    time_discount:=round(base_amount*0.10)::int;
  end if;

  select exists(
    select 1
    from public.bookings b
    join public.events past on past.id=b.event_id
    where b.user_id=u and b.event_id<>p_event
      and b.checked_in_at is not null and past.starts_at<now()
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
        if promo.required_role is not null and not exists(
          select 1 from public.user_roles ur
          where ur.user_id=u and ur.role=promo.required_role
        ) then
          code_valid:=false;
          code_reason:='not_eligible';
        elsif promo.allowed_user_id is not null and promo.allowed_user_id<>u then
          code_valid:=false;
          code_reason:='not_eligible';
        elsif promo.max_redemptions_per_user is not null and (
          select count(*) from public.checkout_discount_redemptions d
          where d.kind='marketing' and d.code=normalized and d.user_id=u
            and d.status in('reserved','consumed')
        )>=promo.max_redemptions_per_user then
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

  -- A 100% code is a true zero-cost registration. Do not stack cosmetic
  -- discounts above the event price in the persisted pricing snapshot.
  if code_discount>=base_amount then
    gender_discount:=0;
    time_discount:=0;
    time_kind:=null;
    boomerang_discount:=0;
  end if;

  -- Preserve line-item sum constraints even for unusually large admin promo codes.
  code_discount:=least(base_amount,code_discount);
  time_discount:=least(time_discount,greatest(0,base_amount-code_discount));
  gender_discount:=least(gender_discount,greatest(0,base_amount-code_discount-time_discount));
  boomerang_discount:=least(boomerang_discount,greatest(0,base_amount-code_discount-time_discount-gender_discount));
  total_discount:=least(base_amount,code_discount+gender_discount+time_discount+boomerang_discount);
  final_amount:=base_amount-total_discount;

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
    'time_discount_percent',case when time_discount>0 then 10 else 0 end,
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
$function$;

CREATE OR REPLACE FUNCTION roundy_private.claim_event_payment_order(p_order text, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if e.gender_split_enabled then
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
    if promo.required_role is not null and not exists(
      select 1 from public.user_roles ur
      where ur.user_id=p_user and ur.role=promo.required_role
    ) then
      raise exception 'Promo code is not available for this account';
    elsif promo.allowed_user_id is not null and promo.allowed_user_id<>p_user then
      raise exception 'Promo code is not available for this account';
    end if;
    if promo.max_redemptions_per_user is not null and (
      select count(*) from public.checkout_discount_redemptions d
      where d.kind='marketing' and d.code=o.discount_code and d.user_id=p_user
        and d.status in('reserved','consumed')
    )>=promo.max_redemptions_per_user then raise exception 'Promo code has already been used'; end if;
    if promo.max_redemptions is not null and (
      select count(*) from public.checkout_discount_redemptions d
      where d.kind='marketing' and d.code=o.discount_code
        and d.status in('reserved','consumed')
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
$function$;

CREATE OR REPLACE FUNCTION roundy_private.generate_seating(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare men uuid[];women uuid[];e public.events;n int;i int;r int;j int;skipped int:=0;rows jsonb:='[]';roster jsonb:='[]';total int;neutral_plan jsonb;
begin
 if auth.uid() is null or not roundy_private.is_admin() then raise exception 'Administrator access required';end if;
 select * into e from public.events where id=p_event for update;
 if e.id is null or e.starts_at<=now() then raise exception 'Seating can only change before the event starts';end if;
 if exists(select 1 from public.choices where event_id=p_event) then raise exception 'Seating is locked after choices begin';end if;
 select count(*) into total from public.bookings where event_id=p_event;
 if exists(select 1 from public.bookings b left join public.verifications v on v.user_id=b.user_id where b.event_id=p_event and coalesce(v.status,'')<>'Verified') then raise exception 'All confirmed attendees must be verified before seating';end if;
 if not e.gender_split_enabled then
   neutral_plan:=roundy_private.build_neutral_seating(p_event,false);
   insert into public.seating_plans(event_id,plan,generated_by) values(p_event,neutral_plan,auth.uid()) on conflict(event_id) do update set plan=excluded.plan,generated_at=now(),generated_by=auth.uid();
   return neutral_plan;
 end if;
 select array_agg(b.user_id order by b.created_at,b.user_id) into men from public.bookings b join public.profiles p on p.user_id=b.user_id where b.event_id=p_event and p.profile->>'gender'='male';
 select array_agg(b.user_id order by b.created_at,b.user_id) into women from public.bookings b join public.profiles p on p.user_id=b.user_id where b.event_id=p_event and p.profile->>'gender'='female';
 n=coalesce(cardinality(men),0);
 if n=0 or n<>coalesce(cardinality(women),0) or total<>2*n then raise exception 'Confirm an equal number of men and women before generating seating';end if;
 for i in 1..n loop
  roster=roster||jsonb_build_array(jsonb_build_object('code','M'||i,'name',(select profile->>'full_name' from public.profiles where user_id=men[i])),jsonb_build_object('code','W'||i,'name',(select profile->>'full_name' from public.profiles where user_id=women[i])));
 end loop;
 delete from public.encounters where event_id=p_event;
 for r in 1..n loop for i in 1..n loop
  j=((i+r-2)%n)+1;
  if exists(select 1 from public.pair_exclusions where user_a=least(men[i],women[j]) and user_b=greatest(men[i],women[j])) then skipped=skipped+1;
  else
   insert into public.encounters(event_id,user_a,user_b,round_number,table_number) values(p_event,men[i],women[j],r,i);
   rows=rows||jsonb_build_array(jsonb_build_object('round',r,'table',i,'left','M'||i,'right','W'||j));
  end if;
 end loop;end loop;
 if jsonb_array_length(rows)=0 then raise exception 'No safe pairings are available';end if;
 insert into public.seating_plans(event_id,plan,generated_by) values(p_event,jsonb_build_object('rows',rows,'skipped',skipped,'roster',roster),auth.uid()) on conflict(event_id) do update set plan=excluded.plan,generated_at=now(),generated_by=auth.uid();
 return jsonb_build_object('rows',rows,'skipped',skipped,'roster',roster);
end;$function$;

CREATE OR REPLACE FUNCTION roundy_private.admin_prepare_event_night(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.events;
  men uuid[];
  women uuid[];
  n int;
  total int;
  i int;
  r int;
  j int;
  skipped int:=0;
  rows jsonb:='[]'::jsonb;
  roster jsonb:='[]'::jsonb;
  neutral_plan jsonb;
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into e from public.events where id=p_event for update;
  if e.id is null then raise exception 'Event unavailable'; end if;
  if e.theme not in ('1:1 Speed Mingle','Language Exchange') then raise exception 'Meetup rotations are only available for supported hosted events'; end if;
  if now()<e.starts_at-interval '30 minutes' then raise exception 'Meetup preparation opens 30 minutes before the event'; end if;
  if now()>=e.ends_at then raise exception 'This event has ended'; end if;
  if exists(select 1 from public.choices where event_id=p_event) then
    raise exception 'Seating is locked after choices begin';
  end if;

  if not e.gender_split_enabled then
    select count(*)::int into total from public.bookings
    where event_id=p_event and checked_in_at is not null;
    if total<2 then raise exception 'At least two checked-in participants are required'; end if;
    delete from public.seating_plans where event_id=p_event;
    neutral_plan:=roundy_private.build_neutral_seating(p_event,true);
    insert into public.seating_plans(event_id,plan,generated_by)
    values(p_event,neutral_plan,auth.uid());
    insert into public.event_sessions(
      event_id,state,total_rounds,current_round,round_duration_seconds,
      prepared_at,started_at,round_started_at,final_choices_at,finished_at,updated_at
    ) values(
      p_event,'ready',(neutral_plan->>'total_rounds')::int,1,900,now(),null,null,null,null,now()
    )
    on conflict(event_id) do update set
      state='ready',total_rounds=excluded.total_rounds,current_round=1,round_duration_seconds=900,
      prepared_at=now(),started_at=null,round_started_at=null,final_choices_at=null,finished_at=null,updated_at=now();
    delete from public.event_choice_submissions where event_id=p_event;
    return neutral_plan;
  end if;

  select count(*)::int into total
  from public.bookings
  where event_id=p_event and checked_in_at is not null;

  select array_agg(b.user_id order by b.checked_in_at,b.created_at,b.user_id)
  into men
  from public.bookings b
  join public.profiles p on p.user_id=b.user_id
  where b.event_id=p_event and b.checked_in_at is not null and p.profile->>'gender'='male';

  select array_agg(b.user_id order by b.checked_in_at,b.created_at,b.user_id)
  into women
  from public.bookings b
  join public.profiles p on p.user_id=b.user_id
  where b.event_id=p_event and b.checked_in_at is not null and p.profile->>'gender'='female';

  n:=coalesce(cardinality(men),0);
  if n=0 or n<>coalesce(cardinality(women),0) or total<>2*n then
    raise exception 'Check in an equal number of men and women before preparing the meetup';
  end if;

  delete from public.encounters where event_id=p_event;
  delete from public.seating_plans where event_id=p_event;

  for i in 1..n loop
    roster:=roster||jsonb_build_array(
      jsonb_build_object('code','M'||i,'name',(select profile->>'full_name' from public.profiles where user_id=men[i])),
      jsonb_build_object('code','W'||i,'name',(select profile->>'full_name' from public.profiles where user_id=women[i]))
    );
  end loop;

  for r in 1..n loop
    for i in 1..n loop
      j:=((i+r-2)%n)+1;
      if exists(
        select 1 from public.pair_exclusions
        where user_a=least(men[i],women[j]) and user_b=greatest(men[i],women[j])
      ) then
        skipped:=skipped+1;
      else
        insert into public.encounters(event_id,user_a,user_b,round_number,table_number)
        values(p_event,men[i],women[j],r,i);
        rows:=rows||jsonb_build_array(jsonb_build_object('round',r,'table',i,'left','M'||i,'right','W'||j));
      end if;
    end loop;
  end loop;

  if jsonb_array_length(rows)=0 then raise exception 'No safe pairings are available'; end if;

  insert into public.seating_plans(event_id,plan,generated_by)
  values(p_event,jsonb_build_object('rows',rows,'skipped',skipped,'roster',roster),auth.uid());

  insert into public.event_sessions(
    event_id,state,total_rounds,current_round,round_duration_seconds,
    prepared_at,started_at,round_started_at,final_choices_at,finished_at,updated_at
  ) values(
    p_event,'ready',n,1,900,now(),null,null,null,null,now()
  )
  on conflict(event_id) do update set
    state='ready',
    total_rounds=excluded.total_rounds,
    current_round=1,
    round_duration_seconds=900,
    prepared_at=now(),
    started_at=null,
    round_started_at=null,
    final_choices_at=null,
    finished_at=null,
    updated_at=now();

  delete from public.event_choice_submissions where event_id=p_event;

  return jsonb_build_object('rows',rows,'skipped',skipped,'roster',roster,'total_rounds',n);
end;
$function$;

CREATE OR REPLACE FUNCTION roundy_private.admin_event_night_state(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.events;
  s public.event_sessions;
  attendees jsonb;
  checked_men int;
  checked_women int;
  submitted_count int;
  match_count int;
  checked_total int;
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into e from public.events where id=p_event;
  if e.id is null then raise exception 'Event unavailable'; end if;

  select * into s from public.event_sessions where event_id=p_event;
  if s.event_id is null then
    s.event_id:=p_event;
    s.state:='waiting';
    s.total_rounds:=0;
    s.current_round:=0;
    s.round_duration_seconds:=900;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',b.user_id,
    'full_name',coalesce(p.profile->>'full_name','Member'),
    'gender',coalesce(p.profile->>'gender',''),
    'photo',p.profile->'photos'->>0,
    'checked_in_at',b.checked_in_at,
    'created_at',b.created_at
  ) order by b.created_at,b.user_id),'[]'::jsonb)
  into attendees
  from public.bookings b
  left join public.profiles p on p.user_id=b.user_id
  where b.event_id=p_event;

  select
    count(*) filter(where p.profile->>'gender'='male' and b.checked_in_at is not null)::int,
    count(*) filter(where p.profile->>'gender'='female' and b.checked_in_at is not null)::int
  into checked_men,checked_women
  from public.bookings b
  left join public.profiles p on p.user_id=b.user_id
  where b.event_id=p_event;

  checked_total:=coalesce(checked_men,0)+coalesce(checked_women,0);

  select count(*)::int into submitted_count
  from public.event_choice_submissions
  where event_id=p_event;

  select count(*)::int into match_count
  from public.matches
  where event_id=p_event;

  return jsonb_build_object(
    'event_id',p_event,
    'state',s.state,
    'total_rounds',s.total_rounds,
    'current_round',s.current_round,
    'round_duration_seconds',s.round_duration_seconds,
    'prepared_at',s.prepared_at,
    'started_at',s.started_at,
    'round_started_at',s.round_started_at,
    'final_choices_at',s.final_choices_at,
    'finished_at',s.finished_at,
    'starts_at',e.starts_at,
    'ends_at',e.ends_at,
    'check_in_open',(s.state='waiting' and now()<=e.starts_at+interval '15 minutes'),
    'can_prepare',(s.state='waiting' and checked_total>=2 and (not e.gender_split_enabled or checked_men=checked_women) and now()>=e.starts_at-interval '30 minutes' and now()<e.ends_at),
    'can_start',(s.state='ready' and now()>=e.starts_at-interval '15 minutes' and now()<e.ends_at),
    'attendees',attendees,
    'checked_men',coalesce(checked_men,0),
    'checked_women',coalesce(checked_women,0),
    'checked_total',checked_total,
    'submitted_count',coalesce(submitted_count,0),
    'matches',coalesce(match_count,0)
  );
end;
$function$;
