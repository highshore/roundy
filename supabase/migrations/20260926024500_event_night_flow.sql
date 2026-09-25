begin;

create table if not exists public.event_sessions(
  event_id uuid primary key references public.events(id) on delete cascade,
  state text not null default 'waiting' check(state in('waiting','ready','live','final_choices','finished')),
  total_rounds int not null default 0 check(total_rounds>=0),
  current_round int not null default 0 check(current_round>=0),
  round_duration_seconds int not null default 900 check(round_duration_seconds between 60 and 3600),
  prepared_at timestamptz,
  started_at timestamptz,
  round_started_at timestamptz,
  final_choices_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.event_choice_submissions(
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

alter table public.event_sessions enable row level security;
alter table public.event_choice_submissions enable row level security;
revoke all on public.event_sessions,public.event_choice_submissions from public,anon,authenticated;

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
  match_count int;
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

  select count(*)::int into match_count from public.matches where event_id=p_event;

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
    'attendees',attendees,
    'checked_men',coalesce(checked_men,0),
    'checked_women',coalesce(checked_women,0),
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
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
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
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
  end if;

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

create or replace function roundy_private.admin_advance_event_night(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.event_sessions;
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into s from public.event_sessions where event_id=p_event for update;
  if s.event_id is null or s.state<>'live' then raise exception 'Meetup is not live'; end if;

  if s.current_round<s.total_rounds then
    update public.event_sessions
    set current_round=current_round+1,round_started_at=now(),updated_at=now()
    where event_id=p_event
    returning * into s;
  else
    update public.event_sessions
    set state='final_choices',final_choices_at=now(),round_started_at=null,updated_at=now()
    where event_id=p_event
    returning * into s;
  end if;

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
  n int;
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into s from public.event_sessions where event_id=p_event for update;
  if s.event_id is null or s.state not in('final_choices','live') then
    raise exception 'Meetup is not ready to finish';
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

create or replace function roundy_private.event_night_state(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  b public.bookings;
  e public.events;
  s public.event_sessions;
  starting_table int;
  current_data jsonb;
  encounters_data jsonb;
  yes_count int;
  maybe_count int;
  no_count int;
  submitted boolean;
  match_count int;
begin
  if u is null then raise exception 'Sign in required'; end if;

  select * into b from public.bookings where event_id=p_event and user_id=u;
  if b.id is null then raise exception 'Confirmed booking required'; end if;

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

  select table_number into starting_table
  from public.encounters
  where event_id=p_event and round_number=1 and (user_a=u or user_b=u)
  limit 1;

  if s.state='live' then
    select jsonb_build_object(
      'id',r.id,
      'round',r.round_number,
      'table',r.table_number,
      'choice',c.choice,
      'next_table',(
        select nr.table_number from public.encounters nr
        where nr.event_id=p_event and nr.round_number=s.current_round+1 and (nr.user_a=u or nr.user_b=u)
        limit 1
      )
    )
    into current_data
    from public.encounters r
    left join public.choices c on c.encounter_id=r.id and c.user_id=u
    where r.event_id=p_event and r.round_number=s.current_round and (r.user_a=u or r.user_b=u)
    limit 1;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'round',r.round_number,
    'table',r.table_number,
    'choice',c.choice,
    'photo',p.profile->'photos'->>0
  ) order by r.round_number),'[]'::jsonb)
  into encounters_data
  from public.encounters r
  left join public.choices c on c.encounter_id=r.id and c.user_id=u
  left join public.profiles p on p.user_id=case when r.user_a=u then r.user_b else r.user_a end
  where r.event_id=p_event and (r.user_a=u or r.user_b=u);

  select
    count(*) filter(where choice='yes')::int,
    count(*) filter(where choice='maybe')::int,
    count(*) filter(where choice='no')::int
  into yes_count,maybe_count,no_count
  from public.choices
  where event_id=p_event and user_id=u;

  select exists(
    select 1 from public.event_choice_submissions where event_id=p_event and user_id=u
  ) into submitted;

  select count(*)::int into match_count
  from public.matches
  where event_id=p_event and (user_a=u or user_b=u);

  return jsonb_build_object(
    'event_id',p_event,
    'checked_in_at',b.checked_in_at,
    'state',s.state,
    'total_rounds',s.total_rounds,
    'current_round',s.current_round,
    'round_duration_seconds',s.round_duration_seconds,
    'round_started_at',s.round_started_at,
    'starting_table',starting_table,
    'current',current_data,
    'encounters',encounters_data,
    'yes_count',coalesce(yes_count,0),
    'maybe_count',coalesce(maybe_count,0),
    'no_count',coalesce(no_count,0),
    'submitted',submitted,
    'matches',coalesce(match_count,0)
  );
end;
$$;

create or replace function roundy_private.submit_event_choices(p_event uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  s public.event_sessions;
  encounter_count int;
  choice_count int;
begin
  if u is null then raise exception 'Sign in required'; end if;

  select * into s from public.event_sessions where event_id=p_event;
  if s.event_id is null or s.state<>'final_choices' then
    raise exception 'Final choices are not open';
  end if;

  select count(*)::int into encounter_count
  from public.encounters
  where event_id=p_event and (user_a=u or user_b=u);

  select count(*)::int into choice_count
  from public.choices
  where event_id=p_event and user_id=u;

  if encounter_count=0 then raise exception 'No meetup encounters found'; end if;
  if choice_count<encounter_count then raise exception 'Choose No, Maybe, or Yes for every tablemate first'; end if;

  insert into public.event_choice_submissions(event_id,user_id)
  values(p_event,u)
  on conflict(event_id,user_id) do update set submitted_at=now();

  return true;
end;
$$;

create or replace function roundy_private.choose(p_encounter uuid,p_choice text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  r public.encounters;
  b public.bookings;
  target uuid;
  count_yes int;
  s public.event_sessions;
begin
  if u is null then raise exception 'Sign in required';end if;
  if p_choice not in ('no','maybe','yes') then raise exception 'Invalid choice';end if;

  select * into r from public.encounters where id=p_encounter and (user_a=u or user_b=u);
  if r.id is null then raise exception 'Encounter unavailable';end if;

  select * into s from public.event_sessions where event_id=r.event_id;
  if s.event_id is null or s.state not in('live','final_choices') then raise exception 'Choices are closed';end if;

  if exists(select 1 from public.event_choice_submissions where event_id=r.event_id and user_id=u) then
    raise exception 'Final choices have already been submitted';
  end if;

  select * into b from public.bookings where event_id=r.event_id and user_id=u for update;
  if b.id is null or b.checked_in_at is null then raise exception 'Host check-in required';end if;

  target:=case when r.user_a=u then r.user_b else r.user_a end;

  select count(*) into count_yes
  from public.choices
  where event_id=r.event_id and user_id=u and choice='yes' and encounter_id<>p_encounter;

  if p_choice='yes' and count_yes>=3 then raise exception 'At most 3 Yes choices';end if;

  insert into public.choices(event_id,encounter_id,user_id,recipient_id,choice)
  values(r.event_id,p_encounter,u,target,p_choice)
  on conflict(encounter_id,user_id) do update set choice=excluded.choice,updated_at=now();
end;
$$;

create or replace function roundy_private.match_profile(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  target uuid;
  p jsonb;
begin
  if u is null then raise exception 'Sign in required';end if;

  select case when m.user_a=u then m.user_b else m.user_a end into target
  from public.matches m
  left join public.event_sessions s on s.event_id=m.event_id
  join public.events e on e.id=m.event_id
  where m.id=p_match
    and (m.user_a=u or m.user_b=u)
    and (s.state='finished' or e.ends_at<=now());

  if target is null then raise exception 'Match unavailable';end if;

  select profile into p from public.profiles where user_id=target;

  return jsonb_build_object(
    'full_name',p->>'full_name',
    'age',extract(year from age(current_date,(p->>'birth_date')::date)),
    'nationality',p->>'nationality',
    'height_cm',p->'height_cm',
    'public_job',p->>'public_job',
    'public_workplace',p->>'public_workplace',
    'phone',p->>'phone',
    'interests',p->'interests'
  );
end;
$$;

create or replace function public.admin_event_night_state(p_event uuid)
returns jsonb language sql security invoker set search_path=''
as $$select roundy_private.admin_event_night_state(p_event);$$;

create or replace function public.admin_set_check_in(p_event uuid,p_user uuid,p_checked boolean)
returns boolean language sql security invoker set search_path=''
as $$select roundy_private.admin_set_check_in(p_event,p_user,p_checked);$$;

create or replace function public.admin_prepare_event_night(p_event uuid)
returns jsonb language sql security invoker set search_path=''
as $$select roundy_private.admin_prepare_event_night(p_event);$$;

create or replace function public.admin_start_event_night(p_event uuid)
returns jsonb language sql security invoker set search_path=''
as $$select roundy_private.admin_start_event_night(p_event);$$;

create or replace function public.admin_advance_event_night(p_event uuid)
returns jsonb language sql security invoker set search_path=''
as $$select roundy_private.admin_advance_event_night(p_event);$$;

create or replace function public.admin_finish_event_night(p_event uuid)
returns jsonb language sql security invoker set search_path=''
as $$select roundy_private.admin_finish_event_night(p_event);$$;

create or replace function public.event_night_state(p_event uuid)
returns jsonb language sql security invoker set search_path=''
as $$select roundy_private.event_night_state(p_event);$$;

create or replace function public.submit_event_choices(p_event uuid)
returns boolean language sql security invoker set search_path=''
as $$select roundy_private.submit_event_choices(p_event);$$;

revoke all on function
  roundy_private.admin_event_night_state(uuid),
  roundy_private.admin_set_check_in(uuid,uuid,boolean),
  roundy_private.admin_prepare_event_night(uuid),
  roundy_private.admin_start_event_night(uuid),
  roundy_private.admin_advance_event_night(uuid),
  roundy_private.admin_finish_event_night(uuid),
  roundy_private.event_night_state(uuid),
  roundy_private.submit_event_choices(uuid)
from public,anon,authenticated,service_role;

grant execute on function
  roundy_private.admin_event_night_state(uuid),
  roundy_private.admin_set_check_in(uuid,uuid,boolean),
  roundy_private.admin_prepare_event_night(uuid),
  roundy_private.admin_start_event_night(uuid),
  roundy_private.admin_advance_event_night(uuid),
  roundy_private.admin_finish_event_night(uuid),
  roundy_private.event_night_state(uuid),
  roundy_private.submit_event_choices(uuid)
to authenticated,service_role;

revoke all on function
  public.admin_event_night_state(uuid),
  public.admin_set_check_in(uuid,uuid,boolean),
  public.admin_prepare_event_night(uuid),
  public.admin_start_event_night(uuid),
  public.admin_advance_event_night(uuid),
  public.admin_finish_event_night(uuid),
  public.event_night_state(uuid),
  public.submit_event_choices(uuid)
from public,anon,authenticated,service_role;

grant execute on function
  public.admin_event_night_state(uuid),
  public.admin_set_check_in(uuid,uuid,boolean),
  public.admin_prepare_event_night(uuid),
  public.admin_start_event_night(uuid),
  public.admin_advance_event_night(uuid),
  public.admin_finish_event_night(uuid),
  public.event_night_state(uuid),
  public.submit_event_choices(uuid)
to authenticated,service_role;

commit;
