begin;
-- Hosted-only infrastructure; application queue behavior is tested in PGlite.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create table wis_private.reminder_scheduler_config (
 singleton boolean primary key default true check(singleton),
 project_url text not null check(project_url ~ '^https://[a-z0-9]+[.]supabase[.]co$'),
 anon_jwt text not null
);
revoke all on wis_private.reminder_scheduler_config from public,anon,authenticated;
-- The gateway credential is the project's public anon JWT, never a service-role secret.
-- This function and configuration are accessible only to the database owner.
create function wis_private.dispatch_due_reminders() returns void language plpgsql security definer set search_path='' as $$
declare config wis_private.reminder_scheduler_config;
begin
 select * into config from wis_private.reminder_scheduler_config where singleton;
 if config.project_url is null then return;end if;
 if exists(
  select 1 from public.wis_events e join public.wis_bookings b on b.event_id=e.id
  left join public.wis_reminder_deliveries d on d.event_id=e.id and d.user_id=b.user_id and d.starts_at=e.starts_at
  where e.status in('published','live') and e.reminder_minutes is not null
  and e.starts_at>now()-interval '10 minutes' and e.starts_at-make_interval(mins=>e.reminder_minutes)<=now()
  and (d.id is null or d.status='queued')
 ) then
  perform net.http_post(url:=config.project_url||'/functions/v1/roundy-reminders',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||config.anon_jwt),body:='{}'::jsonb,timeout_milliseconds:=140000);
 end if;
end;$$;
revoke all on function wis_private.dispatch_due_reminders() from public,anon,authenticated;
select cron.schedule('roundy-reminders','* * * * *','select wis_private.dispatch_due_reminders()');
commit;
