begin;

alter table public.bookings
  add column if not exists check_in_token uuid;

update public.bookings
set check_in_token=gen_random_uuid()
where check_in_token is null;

alter table public.bookings
  alter column check_in_token set default gen_random_uuid();

alter table public.bookings
  alter column check_in_token set not null;

create unique index if not exists bookings_check_in_token_key
  on public.bookings(check_in_token);

create or replace function roundy_private.admin_check_in_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  b public.bookings;
  e public.events;
  s public.event_sessions;
  profile_data jsonb;
  was_checked boolean;
begin
  if auth.uid() is null or not roundy_private.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into b
  from public.bookings
  where check_in_token=p_token
  for update;

  if b.id is null then raise exception 'Invalid check-in QR'; end if;

  select * into e
  from public.events
  where id=b.event_id;

  if e.id is null then raise exception 'Event unavailable'; end if;

  was_checked:=b.checked_in_at is not null;

  if not was_checked then
    if now()>e.starts_at+interval '15 minutes' then
      raise exception 'Check-in is closed after the 15-minute grace period';
    end if;

    select * into s from public.event_sessions where event_id=e.id;
    if s.event_id is not null and s.state<>'waiting' then
      raise exception 'Check-in is locked after meetup preparation';
    end if;

    update public.bookings
    set checked_in_at=now()
    where id=b.id
    returning * into b;
  end if;

  select profile into profile_data
  from public.profiles
  where user_id=b.user_id;

  return jsonb_build_object(
    'booking_id',b.id,
    'event_id',e.id,
    'event_slug',e.slug,
    'event_title',e.title,
    'user_id',b.user_id,
    'full_name',coalesce(profile_data->>'full_name','Member'),
    'gender',coalesce(profile_data->>'gender',''),
    'checked_in_at',b.checked_in_at,
    'already_checked_in',was_checked
  );
end;
$$;

create or replace function public.admin_check_in_by_token(p_token uuid)
returns jsonb
language sql
security invoker
set search_path=''
as $$select roundy_private.admin_check_in_by_token(p_token);$$;

revoke all on function roundy_private.admin_check_in_by_token(uuid)
from public,anon,authenticated,service_role;
grant execute on function roundy_private.admin_check_in_by_token(uuid)
to authenticated,service_role;

revoke all on function public.admin_check_in_by_token(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.admin_check_in_by_token(uuid)
to authenticated,service_role;

commit;
