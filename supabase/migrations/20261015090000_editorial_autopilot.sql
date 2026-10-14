-- Editorial Autopilot: independent discovery schedule, no Instagram posting changes.
begin;
alter table public.marketing_editorial_sources
 add column if not exists origin text not null default 'manual'
  check (origin in ('manual','automated')),
 add column if not exists editorial_priority smallint
  check (editorial_priority between 0 and 100),
 add column if not exists discovery_evidence jsonb not null default '{}'::jsonb,
 add column if not exists discovered_at timestamptz;
alter table public.marketing_editorial_ideas
 add column if not exists origin text not null default 'manual'
  check (origin in ('manual','automated')),
 add column if not exists editorial_review text not null default 'pending'
  check (editorial_review in ('pending','approved','rejected')),
 add column if not exists review_by uuid references auth.users(id) on delete set null,
 add column if not exists reviewed_at timestamptz,
 add column if not exists editorial_rationale text not null default ''
  check (length(editorial_rationale)<=500);
create index if not exists marketing_editorial_review_inbox_idx
 on public.marketing_editorial_ideas(editorial_review,updated_at desc)
 where content_id is null;

create table public.marketing_editorial_autopilot_control (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default false,
 scan_hour_kst smallint not null default 8 check (scan_hour_kst between 0 and 23),
 max_sources_per_scan smallint not null default 4 check (max_sources_per_scan between 2 and 6),
 min_editorial_priority smallint not null default 60 check (min_editorial_priority between 40 and 90),
 reserved_per_scan_usd numeric(8,4) not null default 0.12
  check (reserved_per_scan_usd between 0.01 and 0.50),
 daily_budget_usd numeric(8,4) not null default 0.24
  check (daily_budget_usd between 0.02 and 3),
 monthly_budget_usd numeric(8,4) not null default 7.20
  check (monthly_budget_usd between 0.1 and 90),
 updated_at timestamptz not null default now()
);
insert into public.marketing_editorial_autopilot_control(singleton) values(true)
 on conflict do nothing;

create table public.marketing_editorial_autopilot_scans (
 id uuid primary key default gen_random_uuid(),
 scan_key text not null unique check (length(scan_key) between 16 and 120),
 status text not null default 'running'
  check (status in ('running','completed','failed','uncertain')),
 stage text not null default 'reserved'
  check (stage in ('reserved','research','planning','saving','finished')),
 reserved_usd numeric(8,4) not null default 0.12 check (reserved_usd between 0 and 0.50),
 external_started_at timestamptz,
 research_notes text,
 verified_urls jsonb not null default '[]'::jsonb,
 result jsonb,
 candidate_count smallint not null default 0 check (candidate_count between 0 and 20),
 error_code text,
 error_message text,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create index marketing_editorial_autopilot_scans_recent
 on public.marketing_editorial_autopilot_scans(created_at desc);

alter table public.marketing_editorial_autopilot_control enable row level security;
alter table public.marketing_editorial_autopilot_scans enable row level security;
revoke all on public.marketing_editorial_autopilot_control,
 public.marketing_editorial_autopilot_scans from public,anon,authenticated;
grant select on public.marketing_editorial_autopilot_control,
 public.marketing_editorial_autopilot_scans to authenticated;
grant all on public.marketing_editorial_autopilot_control,
 public.marketing_editorial_autopilot_scans to service_role;
create policy editorial_autopilot_control_admin_read
 on public.marketing_editorial_autopilot_control for select to authenticated
 using ((select public.is_admin()));
create policy editorial_autopilot_scans_admin_read
 on public.marketing_editorial_autopilot_scans for select to authenticated
 using ((select public.is_admin()));

-- The URL consumer never automatically retries unknown external outcomes.
-- Reserve budget before the first search; share the global AI control lock.
create function public.reserve_marketing_editorial_autopilot_scan(p_key text,p_manual boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.marketing_editorial_autopilot_control;
 c public.marketing_ai_control;
 existing public.marketing_editorial_autopilot_scans;
 day_start timestamptz:=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 month_start timestamptz:=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 spent_day numeric;spent_month numeric;global_day numeric;global_month numeric;
 today text:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
begin
 perform pg_advisory_xact_lock(70361005);
 if p_key is null or not (
   (not p_manual and p_key='editorial:auto:'||today)
   or (p_manual and p_key ~ '^editorial:manual:[a-f0-9-]{36}$')
 ) then raise exception 'EDITORIAL_SCAN_KEY_INVALID';end if;
 select * into existing from public.marketing_editorial_autopilot_scans where scan_key=p_key;
 if found then return jsonb_build_object('accepted',false,'scan',to_jsonb(existing));end if;
 select * into a from public.marketing_editorial_autopilot_control where singleton for update;
 select * into c from public.marketing_ai_control where singleton for update;
 if not found or not c.enabled or c.blocked_reason is not null then raise exception 'AI_PAUSED';end if;
 if a.singleton is null or (not a.enabled and not p_manual) then raise exception 'EDITORIAL_AUTOPILOT_PAUSED';end if;
 update public.marketing_editorial_autopilot_scans
   set status='uncertain',stage='finished',completed_at=now(),
   error_code='STALE_SCAN_REQUIRES_RECONCILIATION',
   error_message='Previous run lost its outcome. Never replay an external request automatically.'
 where status='running' and created_at<now()-interval '8 minutes';
 if exists(select 1 from public.marketing_editorial_autopilot_scans where status='running')
 then raise exception 'EDITORIAL_SCAN_ALREADY_RUNNING';end if;
 if (select count(*) from public.marketing_editorial_autopilot_scans where created_at>=day_start)>=2
 then raise exception 'EDITORIAL_SCAN_DAILY_LIMIT';end if;
 select coalesce(sum(reserved_usd),0) into spent_day
 from public.marketing_editorial_autopilot_scans where created_at>=day_start;
 select coalesce(sum(reserved_usd),0) into spent_month
 from public.marketing_editorial_autopilot_scans where created_at>=month_start;
 if spent_day+a.reserved_per_scan_usd>a.daily_budget_usd
   or spent_month+a.reserved_per_scan_usd>a.monthly_budget_usd
 then raise exception 'EDITORIAL_SCAN_BUDGET_REACHED';end if;
 select coalesce(sum(reserved_usd),0) into global_day
 from public.marketing_generation_jobs where created_at>=day_start;
 select coalesce(sum(reserved_usd),0) into global_month
 from public.marketing_generation_jobs where created_at>=month_start;
 if global_day+spent_day+a.reserved_per_scan_usd
   +coalesce((select sum(reserved_usd) from public.marketing_editorial_suggestion_runs
     where requested_at>=day_start),0)>c.daily_budget_usd
 or global_month+spent_month+a.reserved_per_scan_usd
   +coalesce((select sum(reserved_usd) from public.marketing_editorial_suggestion_runs
     where requested_at>=month_start),0)>c.monthly_budget_usd
 then raise exception 'GENERATION_BUDGET_REACHED';end if;
 insert into public.marketing_editorial_autopilot_scans(scan_key,reserved_usd)
 values(p_key,a.reserved_per_scan_usd) returning * into existing;
 return jsonb_build_object('accepted',true,'scan',to_jsonb(existing));
end;$$;
revoke all on function public.reserve_marketing_editorial_autopilot_scan(text,boolean)
 from public,anon,authenticated;
grant execute on function public.reserve_marketing_editorial_autopilot_scan(text,boolean)
 to service_role;

-- The dispatcher never creates scheduled Instagram posts or bypasses human approval.
create function public.dispatch_marketing_editorial_autopilot()
returns bigint language plpgsql security definer set search_path='' as $$
declare cfg public.marketing_editorial_autopilot_control;
 secret_value text;request_id bigint;today text;
begin
 select * into cfg from public.marketing_editorial_autopilot_control where singleton;
 if not found or not cfg.enabled
 or extract(hour from now() at time zone 'Asia/Seoul')::int<>cfg.scan_hour_kst
 then return null;end if;
 if not pg_try_advisory_xact_lock(20261015090001) then return null;end if;
 today:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
 if exists(select 1 from public.marketing_editorial_autopilot_scans
  where scan_key='editorial:auto:'||today) then return null;end if;
 select secret into secret_value from roundy_private.marketing_scheduler_config where singleton;
 if secret_value is null then return null;end if;
 select net.http_post(
  url:='https://roundy.team/api/internal/marketing-editorial-autopilot',
  headers:=jsonb_build_object('Content-Type','application/json','x-marketing-secret',secret_value),
  body:=jsonb_build_object('scan_key','editorial:auto:'||today),
  timeout_milliseconds:=180000
 ) into request_id;
 return request_id;
end;$$;
revoke all on function public.dispatch_marketing_editorial_autopilot()
 from public,anon,authenticated;
grant execute on function public.dispatch_marketing_editorial_autopilot() to service_role;
notify pgrst,'reload schema';
commit;
