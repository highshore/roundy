begin;

alter table public.wis_bookings
  add column if not exists terms_accepted_at timestamptz;

create or replace function wis_private.redeem(p_event uuid,p_terms_accepted boolean)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  e public.wis_events;
  credit uuid;
  booking uuid;
  profile_data jsonb;
  verification_status text;
  member_gender text;
  years int;
  same_gender_bookings int;
begin
  if u is null then raise exception 'Sign in required';end if;
  if coalesce(p_terms_accepted,false) is not true then
    raise exception 'Confirm the cancellation guidelines and terms before enrolling';
  end if;

  select * into e
  from public.wis_events
  where id=p_event
  for update;

  select id into booking
  from public.wis_bookings
  where event_id=p_event and user_id=u;

  if booking is not null then return booking;end if;

  if e.id is null or e.status<>'live' or e.starts_at<=now() or e.seats_remaining<1 then
    raise exception 'No place available';
  end if;

  if now()>=e.starts_at-make_interval(mins=>e.lockdown_minutes) then
    raise exception 'Event registration is locked';
  end if;

  select profile into profile_data
  from public.wis_profiles
  where user_id=u;

  if profile_data is null
    or coalesce(profile_data->>'full_name','')=''
    or coalesce(profile_data->>'birth_date','')=''
    or coalesce(profile_data->>'gender','') not in ('male','female')
    or coalesce(profile_data->>'nationality','')=''
    or coalesce(profile_data->>'job_title','')=''
    or coalesce(profile_data->>'workplace','')=''
    or coalesce((profile_data->>'height_cm')::int,0) not between 100 and 250
    or coalesce(profile_data->>'phone','')!~'^010-[0-9]{4}-[0-9]{4}$'
    or coalesce((profile_data->>'contact_consent')::boolean,false)=false
    or coalesce(jsonb_array_length(profile_data->'photos'),0) not between 1 and 3
    or coalesce(jsonb_array_length(profile_data->'interests'),0) not between 3 and 10 then
    raise exception 'Complete all required profile fields before enrolling';
  end if;

  select status into verification_status
  from public.wis_verifications
  where user_id=u;

  if coalesce(verification_status,'')<>'Verified' then
    raise exception 'Your profile must be approved before enrolling';
  end if;

  years=extract(year from age(current_date,(profile_data->>'birth_date')::date));
  if years not between e.age_min and e.age_max then
    raise exception 'Your age is outside this event range';
  end if;

  member_gender=profile_data->>'gender';

  if e.theme='1:1 Speed Meetup' then
    select count(*) into same_gender_bookings
    from public.wis_bookings b
    join public.wis_profiles p on p.user_id=b.user_id
    where b.event_id=e.id
      and p.profile->>'gender'=member_gender;

    if same_gender_bookings>=e.capacity/2 then
      raise exception 'The % seats for this event are currently full',
        case member_gender when 'female' then 'women''s' else 'men''s' end;
    end if;
  end if;

  select id into credit
  from public.wis_credit_lots
  where user_id=u
    and remaining>0
    and expires_at>now()
  order by expires_at
  for update
  limit 1;

  if credit is null then
    raise exception 'No valid ticket available';
  end if;

  update public.wis_credit_lots
  set remaining=remaining-1
  where id=credit;

  insert into public.wis_bookings(event_id,user_id,credit_lot_id,terms_accepted_at)
  values(p_event,u,credit,now())
  returning id into booking;

  return booking;
end;
$$;

create or replace function wis_private.redeem(p_event uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Confirm the cancellation guidelines and terms before enrolling';
end;
$$;

create or replace function public.wis_redeem(p_event uuid,p_terms_accepted boolean)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select wis_private.redeem(p_event,p_terms_accepted);
$$;

create or replace function public.wis_redeem(p_event uuid)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
begin
  raise exception 'Confirm the cancellation guidelines and terms before enrolling';
end;
$$;

revoke all on function wis_private.redeem(uuid),wis_private.redeem(uuid,boolean),public.wis_redeem(uuid),public.wis_redeem(uuid,boolean) from public,anon,authenticated;
grant execute on function wis_private.redeem(uuid,boolean),public.wis_redeem(uuid,boolean) to authenticated;

commit;
