alter table public.events
  add column if not exists marketing_enabled boolean not null default true;

update public.events
set marketing_enabled=false
where lower(coalesce(title,'')) like '(test)%'
   or lower(coalesce(title_ko,'')) like '(테스트)%';

alter table public.instagram_post_drafts
  add column if not exists event_campaign_stage text,
  add column if not exists event_campaign_pattern text,
  add column if not exists event_campaign_version text,
  add column if not exists event_facts_snapshot jsonb;

alter table public.instagram_post_drafts
  drop constraint if exists instagram_post_drafts_event_campaign_stage_check,
  drop constraint if exists instagram_post_drafts_event_campaign_pattern_check;

alter table public.instagram_post_drafts
  add constraint instagram_post_drafts_event_campaign_stage_check
    check (event_campaign_stage is null or event_campaign_stage in ('launch','experience','venue','participants','momentum','imminent','last_call')),
  add constraint instagram_post_drafts_event_campaign_pattern_check
    check (event_campaign_pattern is null or event_campaign_pattern in ('event_poster','experience','social_proof','offer','last_call'));

alter table public.marketing_automation_settings
  add column if not exists event_campaign_enabled boolean not null default true,
  add column if not exists event_campaign_max_posts integer not null default 5;

alter table public.marketing_automation_settings
  drop constraint if exists marketing_automation_settings_event_campaign_max_posts_check;

alter table public.marketing_automation_settings
  add constraint marketing_automation_settings_event_campaign_max_posts_check
    check (event_campaign_max_posts between 1 and 5);

create table if not exists public.marketing_event_campaign_history(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  stage text not null check(stage in ('launch','experience','venue','participants','momentum','imminent','last_call')),
  pattern text not null check(pattern in ('event_poster','experience','social_proof','offer','last_call')),
  content_language text not null check(content_language in ('ko','en')),
  generation_job_id uuid references public.marketing_generation_jobs(id) on delete set null,
  draft_id uuid references public.instagram_post_drafts(id) on delete set null,
  trigger_key text not null check(length(trigger_key)=64),
  trigger_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'generated' check(status in ('generated','skipped')),
  generated_at timestamptz not null default now(),
  unique(event_id,stage)
);

create index if not exists marketing_event_campaign_history_event_time
  on public.marketing_event_campaign_history(event_id,generated_at desc);

alter table public.marketing_event_campaign_history enable row level security;
revoke all on public.marketing_event_campaign_history from public,anon,authenticated;
grant select on public.marketing_event_campaign_history to authenticated;
grant all on public.marketing_event_campaign_history to service_role;
drop policy if exists marketing_event_campaign_history_admin_read on public.marketing_event_campaign_history;
create policy marketing_event_campaign_history_admin_read
on public.marketing_event_campaign_history for select to authenticated
using((select public.is_admin()));

create table if not exists public.marketing_event_generation_dispatches(
  dispatch_hour timestamptz primary key,
  requested_at timestamptz not null default now(),
  http_request_id bigint
);
alter table public.marketing_event_generation_dispatches enable row level security;
revoke all on public.marketing_event_generation_dispatches from public,anon,authenticated;
grant select on public.marketing_event_generation_dispatches to authenticated;
grant all on public.marketing_event_generation_dispatches to service_role;
drop policy if exists marketing_event_generation_dispatches_admin_read on public.marketing_event_generation_dispatches;
create policy marketing_event_generation_dispatches_admin_read
on public.marketing_event_generation_dispatches for select to authenticated
using((select public.is_admin()));

create or replace function public.reserve_marketing_generation(
  p_key text,
  p_fingerprint text,
  p_draft uuid,
  p_revision integer,
  p_operation text,
  p_actor uuid default null,
  p_automatic boolean default false
) returns jsonb
language plpgsql
set search_path=''
as $$
declare
  c public.marketing_ai_control;
  d public.instagram_post_drafts;
  j public.marketing_generation_jobs;
  day_start timestamptz:=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  month_start timestamptz:=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  cost numeric;
  daily_count integer;
  monthly_count integer;
  effective_daily_budget numeric;
  today text:=(now() at time zone 'Asia/Seoul')::date::text;
begin
  perform pg_advisory_xact_lock(70361005);
  if p_key is null or length(p_key) not between 8 and 120 or p_fingerprint is null or length(p_fingerprint)<>64 or p_revision is null then raise exception 'INVALID_GENERATION_REQUEST'; end if;
  select * into j from public.marketing_generation_jobs where request_key=p_key;
  if found then
    if j.fingerprint<>p_fingerprint or j.draft_id<>p_draft then raise exception 'IDEMPOTENCY_KEY_CONFLICT'; end if;
    return jsonb_build_object('accepted',false,'job',to_jsonb(j));
  end if;
  select * into c from public.marketing_ai_control where singleton for update;
  if not found then raise exception 'AI_CONTROL_UNAVAILABLE'; end if;
  effective_daily_budget:=case
    when c.temporary_daily_budget_usd is not null
      and c.temporary_daily_budget_expires_at is not null
      and c.temporary_daily_budget_expires_at>now()
    then c.temporary_daily_budget_usd
    else c.daily_budget_usd
  end;
  cost:=case p_operation
    when 'copy' then 0.02
    when 'research' then 0.05
    when 'photo' then 0.15
    when 'copy_photo' then 0.20
    when 'render' then 0
    else null
  end;
  if cost is null then raise exception 'INVALID_GENERATION_OPERATION'; end if;
  if cost>0 and (not c.enabled or c.blocked_reason is not null) then raise exception 'AI_PAUSED: %',coalesce(c.blocked_reason,'Paused by administrator'); end if;
  select * into d from public.instagram_post_drafts where id=p_draft for update;
  if not found or d.status<>'needs_approval' then raise exception 'DRAFT_NOT_EDITABLE'; end if;
  if d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
  if d.revision>=99 then raise exception 'DRAFT_REVISION_LIMIT'; end if;
  update public.marketing_generation_jobs
  set status='uncertain',stage='stopped',error_code='TIMEOUT_UNKNOWN',
      error_message='Previous execution expired. It will never be retried automatically; its reservation is retained.',
      updated_at=now()
  where status='running' and created_at<now()-interval '5 minutes';
  if exists(select 1 from public.marketing_generation_jobs where status='running') then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
  if exists(select 1 from public.marketing_generation_jobs where fingerprint=p_fingerprint and status in ('running','completed','uncertain') and created_at>now()-interval '10 minutes') then raise exception 'DUPLICATE_GENERATION_BLOCKED'; end if;
  if exists(select 1 from public.marketing_generation_jobs where created_at>now()-interval '30 seconds') then raise exception 'GENERATION_COOLDOWN_30_SECONDS'; end if;
  if p_automatic and (
    d.draft_date<>(now() at time zone 'Asia/Seoul')::date
    or p_operation='photo'
    or not (
      p_key='auto:'||today
      or p_key ~ '^auto:event:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(launch|experience|venue|participants|momentum|imminent|last_call)$'
    )
  ) then raise exception 'INVALID_AUTOMATIC_REQUEST'; end if;
  select count(*) filter(where created_at>=day_start),count(*) into daily_count,monthly_count
  from public.marketing_generation_jobs
  where created_at>=month_start and reserved_usd>0 and status in ('running','completed','uncertain');
  if cost>0 and (daily_count>=5 or monthly_count>=90) then raise exception 'GENERATION_CALL_LIMIT'; end if;
  if cost=0 and (select count(*) from public.marketing_generation_jobs where created_at>=day_start and operation='render')>=10 then raise exception 'RENDER_DAILY_LIMIT'; end if;
  if cost>0 and (
    (select coalesce(sum(reserved_usd),0) from public.marketing_generation_jobs where created_at>=day_start)+cost>effective_daily_budget
    or
    (select coalesce(sum(reserved_usd),0) from public.marketing_generation_jobs where created_at>=month_start)+cost>c.monthly_budget_usd
  ) then raise exception 'GENERATION_BUDGET_REACHED'; end if;
  insert into public.marketing_generation_jobs(request_key,fingerprint,draft_id,actor_id,automatic,operation,expected_revision,reserved_usd)
  values(p_key,p_fingerprint,p_draft,p_actor,p_automatic,p_operation,p_revision,cost)
  returning * into j;
  return jsonb_build_object('accepted',true,'job',to_jsonb(j));
end
$$;

revoke all on function public.reserve_marketing_generation(text,text,uuid,integer,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_marketing_generation(text,text,uuid,integer,text,uuid,boolean) to service_role;

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
