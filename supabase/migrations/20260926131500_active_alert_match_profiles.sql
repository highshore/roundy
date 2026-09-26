begin;

create or replace function roundy_private.my_event_attention()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  active_events jsonb;
begin
  if u is null then raise exception 'Sign in required'; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'event_id',e.id,
        'slug',e.slug,
        'title',e.title,
        'starts_at',e.starts_at,
        'ends_at',e.ends_at,
        'session_state',coalesce(s.state,'scheduled')
      )
      order by e.starts_at
    ),
    '[]'::jsonb
  )
  into active_events
  from public.bookings b
  join public.events e on e.id=b.event_id
  left join public.event_sessions s on s.event_id=e.id
  where b.user_id=u
    and (
      s.state in('live','final_choices')
      or (
        now()>=e.starts_at
        and now()<e.ends_at
        and coalesce(s.state,'scheduled')<>'finished'
      )
    );

  return jsonb_build_object(
    'has_active',jsonb_array_length(active_events)>0,
    'events',active_events
  );
end;
$$;

create or replace function public.my_event_attention()
returns jsonb
language sql
security invoker
set search_path=''
as $$select roundy_private.my_event_attention();$$;

revoke all on function roundy_private.my_event_attention()
from public,anon,authenticated,service_role;
grant execute on function roundy_private.my_event_attention()
to authenticated,service_role;

revoke all on function public.my_event_attention()
from public,anon,authenticated,service_role;
grant execute on function public.my_event_attention()
to authenticated,service_role;

create or replace function roundy_private.match_profile(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  m public.matches;
  target uuid;
  p jsonb;
  verification_status text;
  encounter_row public.encounters;
  e public.events;
begin
  if u is null then raise exception 'Sign in required';end if;

  select mt.* into m
  from public.matches mt
  join public.events ev on ev.id=mt.event_id
  left join public.event_sessions s on s.event_id=mt.event_id
  where mt.id=p_match
    and (mt.user_a=u or mt.user_b=u)
    and (s.state='finished' or ev.ends_at<=now());

  if m.id is null then raise exception 'Match unavailable';end if;

  target:=case when m.user_a=u then m.user_b else m.user_a end;

  select profile into p
  from public.profiles
  where user_id=target;

  if p is null then raise exception 'Matched profile unavailable'; end if;

  select status into verification_status
  from public.verifications
  where user_id=target;

  select r.* into encounter_row
  from public.encounters r
  where r.event_id=m.event_id
    and least(r.user_a,r.user_b)=least(u,target)
    and greatest(r.user_a,r.user_b)=greatest(u,target)
  order by r.round_number
  limit 1;

  select * into e
  from public.events
  where id=m.event_id;

  return jsonb_build_object(
    'id',m.id,
    'event_id',m.event_id,
    'event_title',e.title,
    'event_slug',e.slug,
    'created_at',m.created_at,
    'full_name',p->>'full_name',
    'age',extract(year from age(current_date,(p->>'birth_date')::date)),
    'nationality',p->>'nationality',
    'height_cm',p->'height_cm',
    'job_title',coalesce(nullif(p->>'job_title',''),nullif(p->>'public_job','')),
    'workplace',coalesce(nullif(p->>'workplace',''),nullif(p->>'public_workplace','')),
    'phone',p->>'phone',
    'interests',coalesce(p->'interests','[]'::jsonb),
    'photos',coalesce(p->'photos','[]'::jsonb),
    'verified',coalesce(verification_status,'')='Verified',
    'met_table',encounter_row.table_number,
    'met_round',encounter_row.round_number
  );
end;
$$;

commit;
