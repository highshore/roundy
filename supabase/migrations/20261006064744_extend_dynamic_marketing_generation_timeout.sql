create or replace function roundy_private.dispatch_marketing_generation() returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  today date:=(now() at time zone 'Asia/Seoul')::date;
  secret_value text;
  req bigint;
  inserted date;
begin
  if not exists(
    select 1 from public.marketing_automation_settings
    where singleton
      and daily_instagram_enabled
      and (now() at time zone 'Asia/Seoul')::time>=draft_generation_time_kst
  ) then return; end if;

  if not exists(
    select 1 from public.marketing_ai_control
    where singleton and enabled and blocked_reason is null
  ) then return; end if;

  if exists(
    select 1 from public.marketing_generation_jobs
    where request_key='auto:'||today
  ) then return; end if;

  select secret into secret_value
  from roundy_private.marketing_scheduler_config
  where singleton;

  if secret_value is null then return; end if;

  insert into public.marketing_generation_dispatches(dispatch_date)
  values(today)
  on conflict do nothing
  returning dispatch_date into inserted;

  if inserted is null then return; end if;

  select net.http_post(
    url:='https://roundy.team/api/internal/marketing-generation',
    headers:=jsonb_build_object('Content-Type','application/json','x-marketing-secret',secret_value),
    body:='{}'::jsonb,
    timeout_milliseconds:=300000
  ) into req;

  update public.marketing_generation_dispatches
  set http_request_id=req
  where dispatch_date=today;
end
$$;

revoke all on function roundy_private.dispatch_marketing_generation()
from public,anon,authenticated,service_role;
