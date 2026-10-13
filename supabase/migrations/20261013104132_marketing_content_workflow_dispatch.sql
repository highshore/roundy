begin;
-- Transactional queue entries are the outbox. HTTP delivery is only a wake-up;
-- duplicate deliveries cannot acquire an already claimed task.
create function public.dispatch_marketing_content_workflows() returns bigint
language plpgsql security definer set search_path='' as $$
declare key text;request_id bigint;
begin
 if not exists(select 1 from public.marketing_content_workflow_control where singleton and enabled) then return null;end if;
 if not exists(select 1 from public.marketing_content_steps where status='queued' and available_at<=now())
  and not exists(select 1 from public.marketing_content_steps where status='running' and lease_expires_at<now()) then return null;end if;
 if not pg_try_advisory_xact_lock(20261013104132) then return null;end if;
 select secret into key from roundy_private.marketing_scheduler_config where singleton;
 if key is null then return null;end if;
 select net.http_post(url:='https://roundy.team/api/internal/marketing-content-workflows',
  headers:=jsonb_build_object('Content-Type','application/json','x-marketing-secret',key),
  body:='{}'::jsonb,timeout_milliseconds:=300000) into request_id;
 return request_id;
end;$$;
revoke all on function public.dispatch_marketing_content_workflows() from public,anon,authenticated;
grant execute on function public.dispatch_marketing_content_workflows() to service_role;
-- SECURITY DEFINER is narrowly required to read the private scheduler secret.
-- Only service_role and the owner/cron can execute; no secret is returned to a client.
select cron.schedule('roundy-content-workflow-dispatch','* * * * *','select public.dispatch_marketing_content_workflows()');
notify pgrst,'reload schema';
commit;
