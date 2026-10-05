create or replace function roundy_private.dispatch_marketing()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  config roundy_private.reminder_scheduler_config;
  scheduler_secret text;
begin
  if not exists(select 1 from public.marketing_templates where enabled)
     and not exists(select 1 from public.marketing_runs where status='queued' and scheduled_for<=now())
     and not exists(
       select 1
       from public.marketing_runs r
       where r.channel='instagram'
         and r.status='sent'
         and r.external_id is not null
         and r.finished_at is not null
         and r.finished_at>now()-interval '4 days'
         and (
           (r.finished_at<=now()-interval '24 hours' and not exists(select 1 from public.instagram_post_insights i where i.run_id=r.id and i.horizon_hours=24))
           or
           (r.finished_at<=now()-interval '72 hours' and not exists(select 1 from public.instagram_post_insights i where i.run_id=r.id and i.horizon_hours=72))
         )
     )
  then return; end if;
  select * into config from roundy_private.reminder_scheduler_config where singleton;
  select secret into scheduler_secret from roundy_private.marketing_scheduler_config where singleton;
  if config.project_url is null or scheduler_secret is null then return; end if;
  perform net.http_post(
    url:=config.project_url||'/functions/v1/roundy-marketing',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||config.anon_jwt,'x-marketing-secret',scheduler_secret),
    body:='{}'::jsonb,
    timeout_milliseconds:=140000
  );
end;
$$;

revoke all on function roundy_private.dispatch_marketing() from public,anon,authenticated,service_role;
