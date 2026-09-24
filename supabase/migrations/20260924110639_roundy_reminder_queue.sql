begin;
create table public.wis_reminder_deliveries (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.wis_events on delete cascade,
 user_id uuid not null references auth.users on delete cascade,starts_at timestamptz not null,
 status text not null default 'queued' check(status in('queued','processing','sent','failed','cancelled')),
 provider_reference text,last_error text,updated_at timestamptz not null default now(),unique(event_id,user_id,starts_at)
);
alter table public.wis_reminder_deliveries enable row level security;
revoke all on public.wis_reminder_deliveries from public,anon,authenticated;
grant select on public.wis_reminder_deliveries to authenticated;
create policy wis_reminders_admin_read on public.wis_reminder_deliveries for select to authenticated using((select public.wis_is_admin()));
grant select,update on public.wis_reminder_deliveries to service_role;
create function wis_private.claim_reminders() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 insert into public.wis_reminder_deliveries(event_id,user_id,starts_at)
 select e.id,b.user_id,e.starts_at from public.wis_events e join public.wis_bookings b on b.event_id=e.id
 where e.status in('published','live') and e.reminder_minutes is not null and e.starts_at>now()-interval '10 minutes' and e.starts_at-make_interval(mins=>e.reminder_minutes)<=now()
 on conflict(event_id,user_id,starts_at) do nothing;
 update public.wis_reminder_deliveries d set status='cancelled',updated_at=now() where d.status='queued' and not exists(select 1 from public.wis_events e join public.wis_bookings b on b.event_id=e.id and b.user_id=d.user_id where e.id=d.event_id and e.starts_at=d.starts_at and e.starts_at>now()-interval '10 minutes' and e.status in('published','live') and e.reminder_minutes is not null and e.starts_at-make_interval(mins=>e.reminder_minutes)<=now());
 with claimed as (
 update public.wis_reminder_deliveries set status='processing',updated_at=now() where id in(select id from public.wis_reminder_deliveries where status='queued' order by starts_at limit 10 for update skip locked) returning *
 ) select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'phone',p.profile->>'phone','title',e.title,'starts_at',e.starts_at,'venue',e.venue,'address',e.address,'slug',e.slug)),'[]'::jsonb) into result from claimed d join public.wis_events e on e.id=d.event_id join public.wis_profiles p on p.user_id=d.user_id;
 return result;
end;$$;
create function public.wis_claim_reminders() returns jsonb language sql security invoker set search_path='' as $$select wis_private.claim_reminders();$$;
revoke all on function public.wis_claim_reminders(),wis_private.claim_reminders() from public,anon,authenticated;
grant usage on schema wis_private to service_role;
grant execute on function public.wis_claim_reminders(),wis_private.claim_reminders() to service_role;
commit;
