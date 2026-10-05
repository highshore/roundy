-- Conservative application reservations; provider billing and other projects remain separate.
create table if not exists public.marketing_ai_control (singleton boolean primary key default true check(singleton),enabled boolean not null default true,blocked_reason text,daily_budget_usd numeric(8,4) not null default 0.25 check(daily_budget_usd between 0 and 0.25),monthly_budget_usd numeric(8,4) not null default 3 check(monthly_budget_usd between 0 and 3),updated_at timestamptz not null default now());
insert into public.marketing_ai_control(singleton) values(true) on conflict do nothing;
create table if not exists public.marketing_generation_jobs (id uuid primary key default gen_random_uuid(),request_key text not null unique check(length(request_key) between 8 and 120),fingerprint text not null check(length(fingerprint)=64),draft_id uuid not null references public.instagram_post_drafts(id) on delete cascade,actor_id uuid references auth.users(id) on delete set null,automatic boolean not null default false,operation text not null check(operation in ('copy','research','photo','copy_photo','render')),status text not null default 'running' check(status in ('running','completed','failed','uncertain')),stage text not null default 'reserved',expected_revision integer not null,reserved_usd numeric(8,4) not null check(reserved_usd>=0),input_tokens integer not null default 0,output_tokens integer not null default 0,error_code text,error_message text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists marketing_generation_jobs_created on public.marketing_generation_jobs(created_at desc);
create index if not exists marketing_generation_jobs_draft on public.marketing_generation_jobs(draft_id,created_at desc);
create table if not exists public.marketing_generation_dispatches (dispatch_date date primary key,requested_at timestamptz not null default now(),http_request_id bigint);
alter table public.marketing_ai_control enable row level security;
alter table public.marketing_generation_jobs enable row level security;
alter table public.marketing_generation_dispatches enable row level security;
revoke all on public.marketing_ai_control,public.marketing_generation_jobs,public.marketing_generation_dispatches from public,anon,authenticated;
grant select on public.marketing_ai_control,public.marketing_generation_jobs,public.marketing_generation_dispatches to authenticated;
grant all on public.marketing_ai_control,public.marketing_generation_jobs,public.marketing_generation_dispatches to service_role;
create policy marketing_ai_control_admin_read on public.marketing_ai_control for select to authenticated using((select public.is_admin()));
create policy marketing_generation_jobs_admin_read on public.marketing_generation_jobs for select to authenticated using((select public.is_admin()));
create policy marketing_generation_dispatches_admin_read on public.marketing_generation_dispatches for select to authenticated using((select public.is_admin()));
create or replace function public.reserve_marketing_generation(p_key text,p_fingerprint text,p_draft uuid,p_revision integer,p_operation text,p_actor uuid default null,p_automatic boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.marketing_ai_control; d public.instagram_post_drafts; j public.marketing_generation_jobs; day_start timestamptz:=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'; month_start timestamptz:=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'; cost numeric; daily_count integer; monthly_count integer;
begin
 perform pg_advisory_xact_lock(70361005);
 if p_key is null or length(p_key) not between 8 and 120 or p_fingerprint is null or length(p_fingerprint)<>64 or p_revision is null then raise exception 'INVALID_GENERATION_REQUEST'; end if;
 select * into j from public.marketing_generation_jobs where request_key=p_key;
 if found then if j.fingerprint<>p_fingerprint or j.draft_id<>p_draft then raise exception 'IDEMPOTENCY_KEY_CONFLICT'; end if; return jsonb_build_object('accepted',false,'job',to_jsonb(j)); end if;
 select * into c from public.marketing_ai_control where singleton for update;
 if not found then raise exception 'AI_CONTROL_UNAVAILABLE'; end if;
 cost:=case p_operation when 'copy' then 0.02 when 'research' then 0.10 when 'photo' then 0.05 when 'copy_photo' then 0.07 when 'render' then 0 else null end;
 if cost is null then raise exception 'INVALID_GENERATION_OPERATION'; end if;
 if cost>0 and (not c.enabled or c.blocked_reason is not null) then raise exception 'AI_PAUSED: %',coalesce(c.blocked_reason,'Paused by administrator'); end if;
 select * into d from public.instagram_post_drafts where id=p_draft for update;
 if not found or d.status<>'needs_approval' then raise exception 'DRAFT_NOT_EDITABLE'; end if;
 if d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if d.revision>=99 then raise exception 'DRAFT_REVISION_LIMIT'; end if;
 update public.marketing_generation_jobs set status='uncertain',stage='stopped',error_code='TIMEOUT_UNKNOWN',error_message='Previous execution expired. It will never be retried automatically; its reservation is retained.',updated_at=now() where status='running' and created_at<now()-interval '5 minutes';
 if exists(select 1 from public.marketing_generation_jobs where status='running') then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 if exists(select 1 from public.marketing_generation_jobs where fingerprint=p_fingerprint and created_at>now()-interval '10 minutes') then raise exception 'DUPLICATE_GENERATION_BLOCKED'; end if;
 if exists(select 1 from public.marketing_generation_jobs where created_at>now()-interval '30 seconds') then raise exception 'GENERATION_COOLDOWN_30_SECONDS'; end if;
 if p_automatic and (p_key<>'auto:'||(now() at time zone 'Asia/Seoul')::date::text or d.draft_date<>(now() at time zone 'Asia/Seoul')::date or p_operation in ('photo','copy_photo')) then raise exception 'INVALID_AUTOMATIC_REQUEST'; end if;
 select count(*) filter(where created_at>=day_start),count(*) into daily_count,monthly_count from public.marketing_generation_jobs where created_at>=month_start and reserved_usd>0;
 if cost>0 and (daily_count>=5 or monthly_count>=90) then raise exception 'GENERATION_CALL_LIMIT'; end if;
 if cost=0 and (select count(*) from public.marketing_generation_jobs where created_at>=day_start and operation='render')>=10 then raise exception 'RENDER_DAILY_LIMIT'; end if;
 if cost>0 and ((select coalesce(sum(reserved_usd),0) from public.marketing_generation_jobs where created_at>=day_start)+cost>c.daily_budget_usd or (select coalesce(sum(reserved_usd),0) from public.marketing_generation_jobs where created_at>=month_start)+cost>c.monthly_budget_usd) then raise exception 'GENERATION_BUDGET_REACHED'; end if;
 if p_operation in ('photo','copy_photo') and (exists(select 1 from public.marketing_generation_jobs where operation in ('photo','copy_photo') and created_at>=day_start) or (select count(*) from public.marketing_generation_jobs where operation in ('photo','copy_photo') and created_at>=month_start)>=10) then raise exception 'PHOTO_LIMIT_1_PER_DAY_10_PER_MONTH'; end if;
 insert into public.marketing_generation_jobs(request_key,fingerprint,draft_id,actor_id,automatic,operation,expected_revision,reserved_usd) values(p_key,p_fingerprint,p_draft,p_actor,p_automatic,p_operation,p_revision,cost) returning * into j;
 return jsonb_build_object('accepted',true,'job',to_jsonb(j));
end $$;
revoke all on function public.reserve_marketing_generation(text,text,uuid,integer,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_marketing_generation(text,text,uuid,integer,text,uuid,boolean) to service_role;
create or replace function public.edit_marketing_draft(p_id uuid,p_revision integer,p_patch jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.instagram_post_drafts;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_id for update;
 if not found or d.status<>'needs_approval' or d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if exists(select 1 from public.marketing_generation_jobs where draft_id=p_id and status='running' and created_at>now()-interval '5 minutes') then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 update public.instagram_post_drafts set caption=coalesce(p_patch->>'caption',caption),cta=coalesce(p_patch->>'cta',cta),destination_url=coalesce(p_patch->>'destination_url',destination_url),revision=revision+1,updated_at=now() where id=p_id returning * into d;
 return to_jsonb(d);
end $$;
revoke all on function public.edit_marketing_draft(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.edit_marketing_draft(uuid,integer,jsonb) to service_role;
create or replace function public.approve_marketing_draft(p_id uuid,p_revision integer,p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.instagram_post_drafts; r public.marketing_runs; scheduled timestamptz; missed boolean;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_id for update;
 if not found or d.status<>'needs_approval' or d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if exists(select 1 from public.marketing_generation_jobs where draft_id=p_id and status='running' and created_at>now()-interval '5 minutes') then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 if trim(d.caption)='' or cardinality(d.images)=0 then raise exception 'COMPLETE_COPY_AND_IMAGES_FIRST'; end if;
 missed:=now()>((d.draft_date+d.window_end_kst) at time zone 'Asia/Seoul');
 scheduled:=case when d.scheduled_for>now()+interval '1 minute' then d.scheduled_for else now()+case when missed then interval '10 minutes' else interval '5 minutes' end end;
 insert into public.marketing_runs(channel,snapshot,request_key,scheduled_for) values('instagram',jsonb_build_object('channel','instagram','name','Daily Instagram - '||d.draft_date,'title','','caption',d.caption,'cta',d.cta,'destination_url',d.destination_url,'images',to_jsonb(d.images),'draft_id',d.id,'event_id',d.event_id,'content_mode',d.content_mode,'draft_kind',d.draft_kind,'growth_topic_type',d.growth_topic_type,'content_pillar',d.content_pillar,'eligible_for_optimization',not missed,'auto_generated',true),'draft:'||d.id||':'||d.revision,scheduled) returning * into r;
 update public.instagram_post_drafts set status='scheduled',approved_at=now(),approved_by=p_actor,marketing_run_id=r.id,scheduled_for=scheduled,eligible_for_optimization=not missed,updated_at=now() where id=p_id returning * into d;
 return jsonb_build_object('draft',to_jsonb(d),'run',to_jsonb(r),'missed_window',missed);
end $$;
revoke all on function public.approve_marketing_draft(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.approve_marketing_draft(uuid,integer,uuid) to service_role;
-- Enable the cron only after deploying the matching Vercel route.
create or replace function roundy_private.dispatch_marketing_generation() returns void language plpgsql security invoker set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Seoul')::date; secret_value text; req bigint; inserted date;
begin
 if not exists(select 1 from public.marketing_automation_settings where singleton and daily_instagram_enabled and (now() at time zone 'Asia/Seoul')::time>=draft_generation_time_kst) then return; end if;
 if not exists(select 1 from public.marketing_ai_control where singleton and enabled and blocked_reason is null) then return; end if;
 if exists(select 1 from public.marketing_generation_jobs where request_key='auto:'||today) then return; end if;
 select secret into secret_value from roundy_private.marketing_scheduler_config where singleton;
 if secret_value is null then return; end if;
 insert into public.marketing_generation_dispatches(dispatch_date) values(today) on conflict do nothing returning dispatch_date into inserted;
 if inserted is null then return; end if;
 select net.http_post(url:='https://roundy.team/api/internal/marketing-generation',headers:=jsonb_build_object('Content-Type','application/json','x-marketing-secret',secret_value),body:='{}'::jsonb,timeout_milliseconds:=240000) into req;
 update public.marketing_generation_dispatches set http_request_id=req where dispatch_date=today;
end $$;
revoke all on function roundy_private.dispatch_marketing_generation() from public,anon,authenticated,service_role;
