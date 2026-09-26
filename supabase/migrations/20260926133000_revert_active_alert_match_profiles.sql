begin;

drop function if exists public.my_event_attention();
drop function if exists roundy_private.my_event_attention();

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

commit;
