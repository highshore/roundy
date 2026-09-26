begin;
create or replace function roundy_private.dispatch_marketing() returns void language plpgsql security definer set search_path='' as $$
declare config roundy_private.reminder_scheduler_config; scheduler_secret text;
begin
 if not exists(select 1 from public.marketing_templates where enabled) and not exists(select 1 from public.marketing_runs where status='queued') then return;end if;
 select * into config from roundy_private.reminder_scheduler_config where singleton;
 select secret into scheduler_secret from roundy_private.marketing_scheduler_config where singleton;
 if config.project_url is null or scheduler_secret is null then return;end if;
 perform net.http_post(url:=config.project_url||'/functions/v1/roundy-marketing',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||config.anon_jwt,'x-marketing-secret',scheduler_secret),body:='{}'::jsonb,timeout_milliseconds:=140000);
end;$$;
revoke all on function roundy_private.dispatch_marketing() from public,anon,authenticated;
select cron.schedule('roundy-marketing','* * * * *','select roundy_private.dispatch_marketing()');
commit;
