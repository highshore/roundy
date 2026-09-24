begin;

-- Approved members with a valid ticket can book directly from the event page.
-- Applications remain readable for legacy history, but are no longer required
-- before redeeming a ticket.
create or replace function wis_private.redeem(p_event uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  e public.wis_events;
  p jsonb;
  verification_status text;
  years int;
  user_gender text;
  same_gender_bookings int;
  gender_limit int;
  credit uuid;
  booking uuid;
begin
  if u is null then raise exception 'Sign in required'; end if;

  select * into e
  from public.wis_events
  where id=p_event
  for update;

  select id into booking
  from public.wis_bookings
  where event_id=p_event and user_id=u;

  if booking is not null then return booking; end if;

  if e.id is null or e.status<>'live' or e.starts_at<=now() or e.seats_remaining<1 then
    raise exception 'No place available';
  end if;

  select profile into p
  from public.wis_profiles
  where user_id=u;

  if p is null
    or coalesce(p->>'full_name','')=''
    or coalesce(p->>'birth_date','')=''
    or coalesce(p->>'gender','') not in ('male','female')
    or coalesce(p->>'nationality','')=''
    or coalesce(p->>'job_title','')=''
    or coalesce(p->>'workplace','')=''
    or coalesce((p->>'height_cm')::int,0) not between 100 and 250
    or coalesce(p->>'phone','')!~'^010-[0-9]{4}-[0-9]{4}$'
    or coalesce((p->>'contact_consent')::boolean,false)=false
    or coalesce(jsonb_array_length(p->'photos'),0) not between 1 and 3
    or coalesce(jsonb_array_length(p->'interests'),0) not between 3 and 10 then
    raise exception 'Complete all required profile fields before booking';
  end if;

  select status into verification_status
  from public.wis_verifications
  where user_id=u;

  if coalesce(verification_status,'')<>'Verified' then
    raise exception 'Your profile must be approved before booking';
  end if;

  years=extract(year from age(current_date,(p->>'birth_date')::date));
  if years not between e.age_min and e.age_max then
    raise exception 'Your age is outside this event range';
  end if;

  user_gender=p->>'gender';

  -- Speed meetups are enrolled into the roster group matching the approved
  -- profile gender. Each group can use at most half the room, rounded up for
  -- odd capacities. Business meetups use the overall event capacity only.
  if e.theme='1:1 Speed Meetup' then
    gender_limit=(e.capacity+1)/2;
    select count(*) into same_gender_bookings
    from public.wis_bookings b
    join public.wis_profiles bp on bp.user_id=b.user_id
    where b.event_id=p_event
      and bp.profile->>'gender'=user_gender;

    if same_gender_bookings>=gender_limit then
      raise exception 'No place available for your gender group';
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

  insert into public.wis_bookings(event_id,user_id,credit_lot_id)
  values(p_event,u,credit)
  returning id into booking;

  return booking;
end;
$$;

revoke all on function wis_private.redeem(uuid) from public,anon,authenticated;
grant execute on function wis_private.redeem(uuid) to authenticated;
grant execute on function public.wis_redeem(uuid) to authenticated;

commit;
