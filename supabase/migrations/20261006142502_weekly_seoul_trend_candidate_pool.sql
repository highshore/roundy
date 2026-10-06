begin;

alter table public.marketing_automation_settings
  drop constraint if exists marketing_automation_settings_trend_scan_interval_hours_check;

update public.marketing_automation_settings
set trend_scan_interval_hours=168
where singleton;

alter table public.marketing_automation_settings
  add constraint marketing_automation_settings_trend_scan_interval_hours_check
  check (trend_scan_interval_hours in (24,72,168));

create or replace function roundy_private.dispatch_marketing_trend_radar()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  settings public.marketing_automation_settings;
  secret_value text;
  bucket text;
  available_candidates integer:=0;
  last_auto_scan timestamptz;
begin
  select * into settings from public.marketing_automation_settings where singleton;
  if not found or not settings.daily_instagram_enabled or not settings.trend_radar_enabled then return; end if;

  if not exists(
    select 1
    from public.marketing_trend_control
    where singleton and enabled and blocked_reason is null
  ) then return; end if;

  select count(*)::integer
  into available_candidates
  from public.marketing_trends
  where last_seen_at>=now()-interval '7 days'
    and trend_score>=settings.trend_override_score
    and (
      status in ('emerging','rising')
      or (status='peak' and trend_score>=90)
    )
    and (
      cooldown_until is null
      or cooldown_until<=now()
      or (
        material_change
        and material_change_at is not null
        and (used_at is null or material_change_at>used_at)
      )
    );

  select max(created_at)
  into last_auto_scan
  from public.marketing_trend_scans
  where scan_key like 'radar:auto:%';

  -- Normal refresh: once per week. Low-pool refill: at most once per 24 hours.
  if available_candidates>=5
     and last_auto_scan is not null
     and last_auto_scan>now()-(settings.trend_scan_interval_hours||' hours')::interval
  then return; end if;

  if available_candidates<5
     and last_auto_scan is not null
     and last_auto_scan>now()-interval '24 hours'
  then return; end if;

  bucket:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD-HH24');
  select secret into secret_value from roundy_private.marketing_scheduler_config where singleton;
  if secret_value is null then return; end if;

  perform net.http_post(
    url:='https://roundy.team/api/internal/marketing-trend-radar',
    headers:=jsonb_build_object('Content-Type','application/json','x-marketing-secret',secret_value),
    body:=jsonb_build_object('scan_key','radar:auto:'||bucket),
    timeout_milliseconds:=180000
  );
end
$$;

revoke all on function roundy_private.dispatch_marketing_trend_radar() from public,anon,authenticated,service_role;

commit;
