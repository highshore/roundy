begin;

alter table public.marketing_automation_settings
  add column if not exists trend_radar_enabled boolean not null default true,
  add column if not exists trend_scan_interval_hours smallint not null default 6,
  add column if not exists trend_override_enabled boolean not null default true,
  add column if not exists trend_override_score smallint not null default 80;

alter table public.marketing_automation_settings
  drop constraint if exists marketing_automation_settings_trend_scan_interval_hours_check,
  drop constraint if exists marketing_automation_settings_trend_override_score_check;

alter table public.marketing_automation_settings
  add constraint marketing_automation_settings_trend_scan_interval_hours_check
    check (trend_scan_interval_hours in (6,12,24)),
  add constraint marketing_automation_settings_trend_override_score_check
    check (trend_override_score between 60 and 100);

create table if not exists public.marketing_trend_control(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true,
  blocked_reason text,
  scan_reservation_usd numeric(8,4) not null default 0.03 check(scan_reservation_usd between 0 and 0.10),
  daily_budget_usd numeric(8,4) not null default 0.12 check(daily_budget_usd between 0 and 1),
  monthly_budget_usd numeric(8,4) not null default 4.00 check(monthly_budget_usd between 0 and 20),
  updated_at timestamptz not null default now()
);
insert into public.marketing_trend_control(singleton) values(true) on conflict do nothing;

create table if not exists public.marketing_trends(
  id uuid primary key default gen_random_uuid(),
  trend_key text not null unique check(length(trend_key) between 2 and 120),
  display_name text not null check(length(display_name) between 1 and 120),
  aliases text[] not null default '{}'::text[],
  category text not null check(category in ('food','activity','place','event','meme','lifestyle','research','other')),
  scope text not null check(scope in ('seoul','korea')),
  status text not null check(status in ('emerging','rising','peak','cooling','dead')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  observed_at timestamptz not null default now(),
  momentum_score numeric(5,2) not null check(momentum_score between 0 and 100),
  roundy_relevance_score numeric(5,2) not null check(roundy_relevance_score between 0 and 100),
  target_relevance_score numeric(5,2) not null check(target_relevance_score between 0 and 100),
  seoul_relevance_score numeric(5,2) not null check(seoul_relevance_score between 0 and 100),
  visual_potential_score numeric(5,2) not null check(visual_potential_score between 0 and 100),
  source_confidence_score numeric(5,2) not null check(source_confidence_score between 0 and 100),
  trend_score numeric(5,2) not null check(trend_score between 0 and 100),
  signal_types text[] not null default '{}'::text[],
  source_urls jsonb not null default '[]'::jsonb,
  summary text not null default '' check(length(summary)<=2000),
  content_angle text not null default '' check(length(content_angle)<=1000),
  angle_key text not null default '' check(length(angle_key)<=120),
  route_type text not null check(route_type in ('seoul_trend','seoul_dating','meme_remix','trend_research')),
  material_change boolean not null default false,
  material_change_at timestamptz,
  used_at timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_trends_status_score_idx on public.marketing_trends(status,trend_score desc,last_seen_at desc);
create index if not exists marketing_trends_category_used_idx on public.marketing_trends(category,used_at desc);
create index if not exists marketing_trends_angle_used_idx on public.marketing_trends(angle_key,used_at desc) where angle_key<>'';

create table if not exists public.marketing_trend_scans(
  id uuid primary key default gen_random_uuid(),
  scan_key text not null unique check(length(scan_key) between 8 and 120),
  status text not null default 'running' check(status in ('running','completed','failed','uncertain','skipped')),
  reserved_usd numeric(8,4) not null default 0 check(reserved_usd>=0),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  web_search_calls smallint not null default 0 check(web_search_calls between 0 and 3),
  candidate_count smallint not null default 0 check(candidate_count between 0 and 50),
  selected_trend_id uuid references public.marketing_trends(id) on delete set null,
  error_message text,
  raw_result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists marketing_trend_scans_created_idx on public.marketing_trend_scans(created_at desc);

alter table public.instagram_post_drafts
  add column if not exists trend_id uuid references public.marketing_trends(id) on delete set null;

alter table public.instagram_post_drafts
  drop constraint if exists instagram_post_drafts_growth_topic_type_check;
alter table public.instagram_post_drafts
  add constraint instagram_post_drafts_growth_topic_type_check
  check (growth_topic_type is null or growth_topic_type in (
    'mbti','dating_archetype','book_insight','trend_research','meme_remix','dating_myth',
    'conversation_prompt','seoul_dating','seoul_trend','mini_quiz'
  ));
create index if not exists instagram_post_drafts_trend_idx on public.instagram_post_drafts(trend_id) where trend_id is not null;

alter table public.marketing_trend_control enable row level security;
alter table public.marketing_trends enable row level security;
alter table public.marketing_trend_scans enable row level security;

revoke all on public.marketing_trend_control,public.marketing_trends,public.marketing_trend_scans from public,anon,authenticated;
grant select on public.marketing_trend_control,public.marketing_trends,public.marketing_trend_scans to authenticated;
grant all on public.marketing_trend_control,public.marketing_trends,public.marketing_trend_scans to service_role;

drop policy if exists marketing_trend_control_admin_read on public.marketing_trend_control;
create policy marketing_trend_control_admin_read on public.marketing_trend_control
for select to authenticated using((select public.is_admin()));

drop policy if exists marketing_trends_admin_read on public.marketing_trends;
create policy marketing_trends_admin_read on public.marketing_trends
for select to authenticated using((select public.is_admin()));

drop policy if exists marketing_trend_scans_admin_read on public.marketing_trend_scans;
create policy marketing_trend_scans_admin_read on public.marketing_trend_scans
for select to authenticated using((select public.is_admin()));

create or replace function public.reserve_marketing_trend_scan(p_key text)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  c public.marketing_trend_control;
  s public.marketing_trend_scans;
  day_start timestamptz:=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  month_start timestamptz:=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  day_reserved numeric;
  month_reserved numeric;
begin
  perform pg_advisory_xact_lock(70361006);
  if p_key is null or length(p_key) not between 8 and 120 then raise exception 'INVALID_TREND_SCAN_REQUEST'; end if;

  select * into s from public.marketing_trend_scans where scan_key=p_key;
  if found then return jsonb_build_object('accepted',false,'scan',to_jsonb(s)); end if;

  select * into c from public.marketing_trend_control where singleton for update;
  if not found then raise exception 'TREND_CONTROL_UNAVAILABLE'; end if;
  if not c.enabled or c.blocked_reason is not null then raise exception 'TREND_RADAR_PAUSED: %',coalesce(c.blocked_reason,'Paused by administrator'); end if;

  update public.marketing_trend_scans
  set status='uncertain',error_message='Previous radar execution expired; it will not be retried automatically.',updated_at=now(),completed_at=now()
  where status='running' and created_at<now()-interval '4 minutes';

  if exists(select 1 from public.marketing_trend_scans where status='running') then raise exception 'TREND_SCAN_ALREADY_RUNNING'; end if;

  select coalesce(sum(reserved_usd),0) into day_reserved
  from public.marketing_trend_scans where created_at>=day_start and status in ('running','completed','uncertain');
  select coalesce(sum(reserved_usd),0) into month_reserved
  from public.marketing_trend_scans where created_at>=month_start and status in ('running','completed','uncertain');

  if day_reserved+c.scan_reservation_usd>c.daily_budget_usd
     or month_reserved+c.scan_reservation_usd>c.monthly_budget_usd
  then raise exception 'TREND_RADAR_BUDGET_REACHED'; end if;

  insert into public.marketing_trend_scans(scan_key,reserved_usd)
  values(p_key,c.scan_reservation_usd)
  returning * into s;
  return jsonb_build_object('accepted',true,'scan',to_jsonb(s));
end
$$;
revoke all on function public.reserve_marketing_trend_scan(text) from public,anon,authenticated;
grant execute on function public.reserve_marketing_trend_scan(text) to service_role;

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
begin
  select * into settings from public.marketing_automation_settings where singleton;
  if not found or not settings.daily_instagram_enabled or not settings.trend_radar_enabled then return; end if;

  if not exists(select 1 from public.marketing_trend_control where singleton and enabled and blocked_reason is null) then return; end if;

  bucket:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD-HH24');
  if exists(
    select 1 from public.marketing_trend_scans
    where scan_key like 'radar:auto:%'
      and created_at>now()-(settings.trend_scan_interval_hours||' hours')::interval+interval '5 minutes'
  ) then return; end if;

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

do $trend_scheduler$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='roundy-marketing-trend-radar' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'roundy-marketing-trend-radar',
    '0 * * * *',
    'select roundy_private.dispatch_marketing_trend_radar()'
  );
end
$trend_scheduler$;

commit;
