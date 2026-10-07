create or replace function roundy_private.dispatch_marketing_generation()
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  today date:=(now() at time zone 'Asia/Seoul')::date;
  local_time time:=(now() at time zone 'Asia/Seoul')::time;
  current_hour timestamptz:=date_trunc('hour',now());
  secret_value text;
  req bigint;
  daily_inserted date;
  event_inserted timestamptz;
begin
  if not exists(select 1 from public.marketing_ai_control where singleton and enabled and blocked_reason is null) then return; end if;
  select secret into secret_value from roundy_private.marketing_scheduler_config where singleton;
  if secret_value is null then return; end if;

  if exists(
    select 1 from public.marketing_automation_settings
    where singleton and event_campaign_enabled
  ) and local_time>=time '08:00' and local_time<=time '22:00'
    and exists(
      select 1 from public.events
      where status='live' and deleted_at is null and marketing_enabled and starts_at>now()
        and lower(coalesce(title,'')) not like '(test)%'
        and lower(coalesce(title_ko,'')) not like '(테스트)%'
    )
  then
    insert into public.marketing_event_generation_dispatches(dispatch_hour)
    values(current_hour)
    on conflict do nothing
    returning dispatch_hour into event_inserted;

    if event_inserted is not null then
      select net.http_post(
        url:='https://roundy.team/api/internal/marketing-generation',
        headers:=jsonb_build_object('Content-Type','application/json','x-marketing-secret',secret_value),
        body:=jsonb_build_object('mode','event'),
        timeout_milliseconds:=300000
      ) into req;
      update public.marketing_event_generation_dispatches set http_request_id=req where dispatch_hour=current_hour;
      return;
    end if;
  end if;

  if exists(
    select 1 from public.marketing_automation_settings
    where singleton and daily_instagram_enabled and local_time>=draft_generation_time_kst
  ) and not exists(select 1 from public.marketing_generation_jobs where request_key='auto:'||today)
  then
    insert into public.marketing_generation_dispatches(dispatch_date)
    values(today)
    on conflict do nothing
    returning dispatch_date into daily_inserted;

    if daily_inserted is not null then
      select net.http_post(
        url:='https://roundy.team/api/internal/marketing-generation',
        headers:=jsonb_build_object('Content-Type','application/json','x-marketing-secret',secret_value),
        body:=jsonb_build_object('mode','daily'),
        timeout_milliseconds:=300000
      ) into req;
      update public.marketing_generation_dispatches set http_request_id=req where dispatch_date=today;
    end if;
  end if;
end
$$;

revoke all on function roundy_private.dispatch_marketing_generation()
from public,anon,authenticated,service_role;
