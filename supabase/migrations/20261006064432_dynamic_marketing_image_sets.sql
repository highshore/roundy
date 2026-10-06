alter table public.marketing_ai_control
  drop constraint if exists marketing_ai_control_monthly_budget_usd_check;

alter table public.marketing_ai_control
  add constraint marketing_ai_control_monthly_budget_usd_check
  check (monthly_budget_usd between 0 and 6);

update public.marketing_ai_control
set monthly_budget_usd=6,
    updated_at=now()
where singleton and monthly_budget_usd<6;

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
  if p_automatic and (p_key<>'auto:'||(now() at time zone 'Asia/Seoul')::date::text or d.draft_date<>(now() at time zone 'Asia/Seoul')::date or p_operation='photo') then raise exception 'INVALID_AUTOMATIC_REQUEST'; end if;
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
