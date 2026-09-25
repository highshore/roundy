begin;

create or replace function roundy_private.admin_event_night_state(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
    'can_prepare',(s.state='waiting' and checked_total>0 and checked_men=checked_women and now()>=e.starts_at-interval '30 minutes' and now()<e.ends_at),
    'can_start',(s.state='ready' and now()>=e.starts_at-interval '15 minutes' and now()<e.ends_at),
    'attendees',attendees,
    'checked_men',coalesce(checked_men,0),
    'checked_women',coalesce(checked_women,0),
    'checked_total',checked_total,
    'submitted_count',coalesce(submitted_count,0),
    'matches',coalesce(match_count,0)
  );
end;
$$;

create or replace function roundy_private.admin_set_check_in(
  p_event uuid,
  p_user uuid,
  p_checked boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.event_sessions;
  e public.events;
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into e from public.events where id=p_event;
  if e.id is null then raise exception 'Event unavailable'; end if;
  if now()>e.starts_at+interval '15 minutes' then
    raise exception 'Check-in is closed after the 15-minute grace period';
  end if;

  select * into s from public.event_sessions where event_id=p_event;
  if s.event_id is not null and s.state<>'waiting' then
    raise exception 'Check-in is locked after meetup preparation';
  end if;

  if not exists(select 1 from public.bookings where event_id=p_event and user_id=p_user) then
    raise exception 'Booking unavailable';
  end if;

  update public.bookings
  set checked_in_at=case when p_checked then coalesce(checked_in_at,now()) else null end
  where event_id=p_event and user_id=p_user;

  return true;
end;
$$;

create or replace function roundy_private.admin_prepare_event_night(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into e from public.events where id=p_event for update;
  if e.id is null then raise exception 'Event unavailable'; end if;
  if e.theme<>'1:1 Speed Mingle' then raise exception 'Meetup rotations are available for 1:1 Speed Mingle events'; end if;
  if now()<e.starts_at-interval '30 minutes' then raise exception 'Meetup preparation opens 30 minutes before the event'; end if;
  if now()>=e.ends_at then raise exception 'This event has ended'; end if;
  if exists(select 1 from public.choices where event_id=p_event) then
    raise exception 'Seating is locked after choices begin';
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
$$;

create or replace function roundy_private.admin_start_event_night(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.event_sessions;
  e public.events;
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into e from public.events where id=p_event;
  if e.id is null then raise exception 'Event unavailable'; end if;
  if now()<e.starts_at-interval '15 minutes' then raise exception 'Meetup start opens 15 minutes before the scheduled time'; end if;
  if now()>=e.ends_at then raise exception 'This event has ended'; end if;

  select * into s from public.event_sessions where event_id=p_event for update;
  if s.event_id is null or s.state<>'ready' then
    raise exception 'Prepare the meetup before starting';
  end if;

  update public.event_sessions
  set state='live',current_round=1,started_at=coalesce(started_at,now()),round_started_at=now(),updated_at=now()
  where event_id=p_event
  returning * into s;

  return jsonb_build_object('state',s.state,'current_round',s.current_round,'total_rounds',s.total_rounds,'round_started_at',s.round_started_at);
end;
$$;

create or replace function roundy_private.admin_finish_event_night(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.event_sessions;
  checked_total int;
  submitted_count int;
  n int;
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into s from public.event_sessions where event_id=p_event for update;
  if s.event_id is null or s.state<>'final_choices' then
    raise exception 'Open final choices before finishing the meetup';
  end if;

  select count(*)::int into checked_total
  from public.bookings
  where event_id=p_event and checked_in_at is not null;

  select count(*)::int into submitted_count
  from public.event_choice_submissions
  where event_id=p_event;

  if submitted_count<checked_total then
    raise exception 'Waiting for % participant(s) to submit final choices',checked_total-submitted_count;
  end if;

  insert into public.matches(event_id,user_a,user_b)
  select p_event,least(a.user_id,a.recipient_id),greatest(a.user_id,a.recipient_id)
  from public.choices a
  join public.choices b
    on a.event_id=b.event_id
   and a.user_id=b.recipient_id
   and a.recipient_id=b.user_id
  where a.event_id=p_event and a.choice='yes' and b.choice='yes'
  on conflict do nothing;

  select count(*)::int into n from public.matches where event_id=p_event;

  update public.event_sessions
  set state='finished',finished_at=now(),round_started_at=null,updated_at=now()
  where event_id=p_event;

  return jsonb_build_object('state','finished','matches',n);
end;
$$;

commit;
