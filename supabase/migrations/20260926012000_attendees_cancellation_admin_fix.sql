begin;

-- Restore the clean public admin RPC after the namespace cleanup. The private
-- function is intentionally not directly executable by normal clients.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select roundy_private.is_admin();
$$;

revoke all on function public.is_admin() from public,anon,authenticated,service_role;
grant execute on function public.is_admin() to authenticated,service_role;

-- Authenticated members can see only the first photo and gender grouping for
-- confirmed attendees. Names/contact/profile details remain private.
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

  select * into e
  from public.events
  where id=p_event;

  if e.id is null or (e.status<>'live' and not roundy_private.is_admin()) then
    raise exception 'Event unavailable';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object('photo',p.profile->'photos'->>0)
        order by b.created_at,b.id
      ) filter (where p.profile->>'gender'='female'),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object('photo',p.profile->'photos'->>0)
        order by b.created_at,b.id
      ) filter (where p.profile->>'gender'='male'),
      '[]'::jsonb
    ),
    count(*) filter (where p.profile->>'gender'='female')::int,
    count(*) filter (where p.profile->>'gender'='male')::int
  into women,men,women_count,men_count
  from public.bookings b
  left join public.profiles p on p.user_id=b.user_id
  where b.event_id=p_event;

  return jsonb_build_object(
    'women',women,
    'men',men,
    'women_count',women_count,
    'men_count',men_count,
    'total',women_count+men_count
  );
end;
$$;

create or replace function public.event_attendees(p_event uuid)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select roundy_private.event_attendees(p_event);
$$;

-- Photo bytes remain in the private profile-photo bucket. This predicate lets
-- signed-in members load only the avatar of someone currently attending a live
-- Roundy event (plus their own photo / admin review access).
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
    where b.user_id=p_member
      and e.status='live'
      and e.starts_at>now()-interval '6 hours'
  );
end;
$$;

drop policy if exists attendee_photo_read on storage.objects;
create policy attendee_photo_read
on storage.objects
for select
to authenticated
using(
  bucket_id='wis-profile-photos'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and roundy_private.can_view_attendee_photo(((storage.foldername(name))[1])::uuid)
);

-- A confirmed booking can be cancelled until the same lockdown boundary used
-- for registration. The consumed credit is restored to its original lot.
create or replace function roundy_private.cancel_booking(p_event uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  e public.events;
  b public.bookings;
begin
  if u is null then raise exception 'Sign in required'; end if;

  select * into e
  from public.events
  where id=p_event
  for update;

  if e.id is null then raise exception 'Event unavailable'; end if;

  select * into b
  from public.bookings
  where event_id=p_event and user_id=u
  for update;

  if b.id is null then raise exception 'Booking not found'; end if;
  if b.checked_in_at is not null then raise exception 'Checked-in bookings cannot be cancelled'; end if;
  if now()>=e.starts_at-make_interval(mins=>e.lockdown_minutes) then
    raise exception 'Event cancellation is locked';
  end if;

  delete from public.bookings
  where id=b.id;

  if b.credit_lot_id is not null then
    update public.credit_lots
    set remaining=least(quantity,remaining+1)
    where id=b.credit_lot_id and user_id=u;
  end if;

  update public.reminder_deliveries
  set status='cancelled',updated_at=now()
  where event_id=p_event
    and user_id=u
    and status in('queued','processing');

  return true;
end;
$$;

create or replace function public.cancel_booking(p_event uuid)
returns boolean
language sql
security invoker
set search_path=''
as $$
  select roundy_private.cancel_booking(p_event);
$$;

revoke all on function roundy_private.event_attendees(uuid),
  roundy_private.can_view_attendee_photo(uuid),
  roundy_private.cancel_booking(uuid)
from public,anon,authenticated,service_role;
grant execute on function roundy_private.event_attendees(uuid),
  roundy_private.can_view_attendee_photo(uuid),
  roundy_private.cancel_booking(uuid)
to authenticated,service_role;

revoke all on function public.event_attendees(uuid),public.cancel_booking(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.event_attendees(uuid),public.cancel_booking(uuid)
to authenticated,service_role;

commit;
