begin;
-- Forward-only. Legacy drafts, jobs, schedules and publication records are not backfilled.
create table public.marketing_content_workflow_control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.marketing_content_workflow_control values(true,false,now());
create table public.marketing_contents (
 id uuid primary key references public.instagram_post_drafts(id) on delete restrict,
 request_key text not null unique check(length(request_key) between 8 and 120),
 request_signature text not null,
 origin text not null check(origin in ('manual','automatic','adopted')),
 request_payload jsonb not null check(jsonb_typeof(request_payload)='object'),
 version integer not null default 1 check(version>0),
 state_version bigint not null default 1,
 stage text not null check(stage in ('discovery','copy','media','render','review','publish','complete')),
 status text not null check(status in ('queued','running','blocked','failed','uncertain','scheduled','published','archived')),
 required_action text,
 active_step_id uuid,
 root_job_id uuid references public.marketing_generation_jobs(id) on delete restrict,
 approved_version integer,
 publishing_run_id uuid references public.marketing_runs(id) on delete restrict,
 error_code text,error_message text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.marketing_content_versions (
 content_id uuid not null references public.marketing_contents(id) on delete restrict,
 version integer not null check(version>0),
 request_payload jsonb not null check(jsonb_typeof(request_payload)='object'),
 snapshot jsonb check(snapshot is null or jsonb_typeof(snapshot)='object'),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 primary key(content_id,version)
);
create table public.marketing_content_steps (
 id uuid primary key default gen_random_uuid(),
 content_id uuid not null,
 version integer not null,
 step text not null check(step in ('discovery','copy','media','render','review')),
 attempt integer not null check(attempt>0),
 status text not null default 'queued' check(status in ('queued','running','succeeded','blocked','failed','uncertain','cancelled')),
 available_at timestamptz not null default now(),
 lease_id uuid,lease_expires_at timestamptz,
 generation_job_id uuid references public.marketing_generation_jobs(id) on delete restrict,
 external_started_at timestamptz,
 checkpoint jsonb not null default '{}'::jsonb check(jsonb_typeof(checkpoint)='object'),
 output jsonb check(output is null or jsonb_typeof(output)='object'),
 error_code text,error_message text,retry_note text,
 created_at timestamptz not null default now(),started_at timestamptz,finished_at timestamptz,
 foreign key(content_id,version) references public.marketing_content_versions(content_id,version) on delete restrict,
 unique(content_id,version,step,attempt)
);
create unique index marketing_content_one_active_step on public.marketing_content_steps(content_id) where status in ('queued','running');
create index marketing_content_step_queue on public.marketing_content_steps(available_at,created_at) where status='queued';
create index marketing_content_step_lease on public.marketing_content_steps(lease_expires_at) where status='running';
create index marketing_content_step_job on public.marketing_content_steps(generation_job_id) where generation_job_id is not null;
create index marketing_contents_updated on public.marketing_contents(updated_at desc,id);
create index marketing_contents_publishing_run on public.marketing_contents(publishing_run_id) where publishing_run_id is not null;
create index marketing_contents_root_job on public.marketing_contents(root_job_id) where root_job_id is not null;
create index marketing_contents_creator on public.marketing_contents(created_by) where created_by is not null;
create index marketing_contents_active_step on public.marketing_contents(active_step_id) where active_step_id is not null;
create index marketing_content_versions_creator on public.marketing_content_versions(created_by) where created_by is not null;
alter table public.marketing_contents add constraint marketing_content_active_step_fk foreign key(active_step_id) references public.marketing_content_steps(id) deferrable initially deferred;
alter table public.marketing_generation_jobs add column content_id uuid references public.marketing_contents(id) on delete restrict;
create index marketing_generation_content on public.marketing_generation_jobs(content_id) where content_id is not null;

alter table public.marketing_content_workflow_control enable row level security;
alter table public.marketing_contents enable row level security;
alter table public.marketing_content_versions enable row level security;
alter table public.marketing_content_steps enable row level security;
revoke all on public.marketing_content_workflow_control,public.marketing_contents,public.marketing_content_versions,public.marketing_content_steps from public,anon,authenticated;
grant select on public.marketing_content_workflow_control,public.marketing_contents,public.marketing_content_versions,public.marketing_content_steps to authenticated;
grant all on public.marketing_content_workflow_control,public.marketing_contents,public.marketing_content_versions,public.marketing_content_steps to service_role;
create policy content_control_admin_read on public.marketing_content_workflow_control for select to authenticated using((select public.is_admin()));
create policy contents_admin_read on public.marketing_contents for select to authenticated using((select public.is_admin()));
create policy content_versions_admin_read on public.marketing_content_versions for select to authenticated using((select public.is_admin()));
create policy content_steps_admin_read on public.marketing_content_steps for select to authenticated using((select public.is_admin()));

-- Only controller transactions may modify a managed compatibility draft.
-- The established publisher is allowed to project the outcome of the exact approved run.
create function roundy_private.guard_managed_marketing_draft() returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.marketing_contents; r public.marketing_runs;
begin
 select * into c from public.marketing_contents where id=old.id;
 if not found then return new;end if;
 if current_setting('roundy.content_write',true)=old.id::text then return new;end if;
 if (to_jsonb(new)-array['status','marketing_run_id','published_at','updated_at']) is distinct from
    (to_jsonb(old)-array['status','marketing_run_id','published_at','updated_at']) then
  raise exception 'USE_CONTENT_WORKFLOW';
 end if;
 select * into r from public.marketing_runs where id=c.publishing_run_id;
 if not found or new.marketing_run_id is distinct from r.id or
   not ((r.status='sent' and new.status='published') or (r.status='failed' and new.status='failed') or new.status=old.status)
 then raise exception 'USE_CONTENT_WORKFLOW';end if;
 return new;
end;$$;
create trigger a_guard_managed_marketing_draft before update on public.instagram_post_drafts for each row execute function roundy_private.guard_managed_marketing_draft();
create function roundy_private.guard_marketing_content_version() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 -- Account erasure may null the actor FK without changing immutable content or its provenance.
 if tg_op='UPDATE' and old.created_by is not null and new.created_by is null
  and (to_jsonb(new)-'created_by')=(to_jsonb(old)-'created_by') then return new;end if;
 if tg_op='DELETE' or old.snapshot is not null or new.content_id<>old.content_id or new.version<>old.version
  or new.request_payload is distinct from old.request_payload then raise exception 'CONTENT_VERSION_IMMUTABLE';end if;
 return new;
end;$$;
create trigger guard_marketing_content_version before update or delete on public.marketing_content_versions for each row execute function roundy_private.guard_marketing_content_version();

create function roundy_private.queue_marketing_content_step(p_content uuid,p_step text,p_note text default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare c public.marketing_contents; task uuid; n integer; cached jsonb;
begin
 select * into strict c from public.marketing_contents where id=p_content for update;
 select coalesce(max(attempt),0)+1 into n from public.marketing_content_steps where content_id=c.id and version=c.version and step=p_step;
 select checkpoint into cached from public.marketing_content_steps where content_id=c.id and version=c.version and step=p_step order by attempt desc limit 1;
 insert into public.marketing_content_steps(content_id,version,step,attempt,checkpoint,retry_note)
 values(c.id,c.version,p_step,n,coalesce(cached,'{}'::jsonb),left(p_note,500)) returning id into task;
 update public.marketing_contents set stage=p_step,status='queued',required_action=null,error_code=null,error_message=null,
  active_step_id=task,state_version=state_version+1,updated_at=now() where id=c.id;
 return task;
end;$$;

create function public.start_marketing_content(p_key text,p_input jsonb,p_origin text,p_actor uuid default null,p_existing uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.marketing_contents;d public.instagram_post_drafts; first_step text;today date:=(now() at time zone 'Asia/Seoul')::date;lang text;signature text:=md5(p_input::text);ordinal bigint;
begin
 perform pg_advisory_xact_lock(70361005);
 if not exists(select 1 from public.marketing_content_workflow_control where singleton and enabled) then raise exception 'CONTENT_WORKFLOW_PAUSED';end if;
 if p_origin is null or p_key is null or length(p_key) not between 8 and 120 or jsonb_typeof(p_input) is distinct from 'object' or p_origin not in ('manual','automatic','adopted') then raise exception 'INVALID_CONTENT_REQUEST';end if;
 if p_origin in ('manual','adopted') and p_actor is null then raise exception 'CONTENT_ACTOR_REQUIRED';end if;
 if p_origin='automatic' and exists(select 1 from public.marketing_generation_jobs where request_key=p_key) then raise exception 'AUTOMATIC_CONTENT_ALREADY_EXISTS';end if;
 if p_origin='automatic' and not(p_key='auto:'||today::text or p_key~'^auto:event:[0-9a-f-]{36}:(launch|experience|venue|participants|momentum|imminent|last_call)$') then raise exception 'INVALID_AUTOMATIC_REQUEST';end if;
 select * into c from public.marketing_contents where request_key=p_key;
 if found then
  if c.request_signature<>signature then raise exception 'IDEMPOTENCY_KEY_CONFLICT';end if;
  return to_jsonb(c);
 end if;
 lang:=p_input->>'language';if lang is null or lang not in ('ko','en') then raise exception 'CONTENT_LANGUAGE_REQUIRED';end if;
 if p_existing is not null then
  select * into d from public.instagram_post_drafts where id=p_existing for update;
  if not found or d.status<>'needs_approval' or coalesce(jsonb_array_length(d.carousel_slides),0)=0 or d.content_document is null then raise exception 'EDITABLE_COPY_REQUIRED';end if;
  if exists(select 1 from public.marketing_contents where id=d.id) then return (select to_jsonb(x) from public.marketing_contents x where x.id=d.id);end if;
  if exists(select 1 from public.marketing_generation_jobs where draft_id=d.id and status='running') then raise exception 'GENERATION_ALREADY_RUNNING';end if;
  if (p_input->>'adopted_revision')::integer is distinct from d.revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST';end if;
  first_step:='media';
 else
  insert into public.instagram_post_drafts(draft_date,draft_role,status,generation_source,visual_source,content_language,
   content_mode,draft_kind,growth_topic_type,content_pillar,caption,cta,destination_url,images,carousel_slides,research_sources,research_status,
   revision,imported_at,recommended_time_kst,window_start_kst,window_end_kst,scheduled_for,event_id,trend_id,generation_reason)
  values(today,'candidate','needs_approval',case when p_origin='automatic' then 'automation' else 'manual' end,'stock',lang,
   case when p_input->>'content_mode'='live_event' then 'live_event' else 'prelaunch' end,
   case when p_input->>'content_mode'='growth_carousel' then 'growth_carousel' else 'brand' end,
   case when p_input->>'content_mode'='growth_carousel' then p_input->>'topic_type' else null end,'concept','', 'Follow @roundy.meet',
   'https://roundy.team','{}'::text[],'[]'::jsonb,'[]'::jsonb,'pending',1,now(),'21:00','20:30','21:30',null,
   nullif(p_input->>'event_id','')::uuid,nullif(p_input->>'trend_id','')::uuid,'Central content workflow') returning * into d;
  first_step:=case when p_input->>'topic_type' in ('book_insight','trend_research','dating_myth','seoul_dating','seoul_trend') then 'discovery' else 'copy' end;
 end if;
 if p_existing is null and p_input->'carousel_plan'->>'mode'='alternating' then
  ordinal:=public.reserve_marketing_carousel_slot(d.id);
  p_input:=jsonb_set(jsonb_set(p_input,'{carousel_plan,reservation_number}',to_jsonb(ordinal)),'{carousel_plan,slide_count}',to_jsonb(case when mod(ordinal,2)=1 then 3 else 5 end));
  p_input:=jsonb_set(p_input,'{story_card_count}',p_input->'carousel_plan'->'slide_count');
  if mod(ordinal,2)=1 then p_input:=jsonb_set(p_input,'{ai_image_slot}','null'::jsonb);end if;
 end if;
 insert into public.marketing_contents(id,request_key,request_signature,origin,request_payload,stage,status,created_by)
 values(d.id,p_key,signature,p_origin,p_input,first_step,'queued',p_actor) returning * into c;
 insert into public.marketing_content_versions(content_id,version,request_payload,snapshot,created_by)
 values(c.id,1,p_input,case when p_existing is null then null else to_jsonb(d) end,p_actor);
 perform roundy_private.queue_marketing_content_step(c.id,first_step);
 return (select to_jsonb(x) from public.marketing_contents x where id=c.id);
end;$$;

create function public.claim_marketing_content_step(p_content uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.marketing_content_steps;c public.marketing_contents;d public.instagram_post_drafts;j jsonb;operation text;message text;n integer;root uuid;expired record;recovery_lease uuid;
begin
 perform pg_advisory_xact_lock(70361005);
 -- A lease is fencing, not permission to replay an unknown paid request.
 for expired in select * from public.marketing_content_steps where status='running' and lease_expires_at<now() for update loop
  -- A fully checkpointed result can be committed without repeating an external request.
  if jsonb_typeof(expired.checkpoint->'completion')='object' then
   begin
    recovery_lease:=gen_random_uuid();
    update public.marketing_content_steps set lease_id=recovery_lease,lease_expires_at=now()+interval '1 minute' where id=expired.id;
    perform public.finish_marketing_content_step(expired.id,recovery_lease,
     expired.checkpoint->'completion'->>'outcome',expired.checkpoint->'completion'->'result',
     expired.checkpoint->'completion'->>'code',expired.checkpoint->'completion'->>'message');
    continue;
   exception when others then null;end;
  end if;
  update public.marketing_content_steps set status=case when external_started_at is null then 'failed' else 'uncertain' end,
   error_code='WORKER_LEASE_EXPIRED',finished_at=now() where id=expired.id;
  update public.marketing_generation_jobs set status=case when expired.external_started_at is null then 'failed' else 'uncertain' end,
   stage='stopped',error_code='WORKER_LEASE_EXPIRED',updated_at=now() where id=expired.generation_job_id and status='running';
  update public.marketing_contents set status=case when expired.external_started_at is null then 'failed' else 'uncertain' end,
   required_action=case when expired.external_started_at is null then 'retry_step' else 'reconcile_request' end,
   error_code='WORKER_LEASE_EXPIRED',state_version=state_version+1,updated_at=now() where active_step_id=expired.id and status='running';
 end loop;
 if not exists(select 1 from public.marketing_content_workflow_control where singleton and enabled) then return null;end if;
 select * into t from public.marketing_content_steps where status='queued' and available_at<=now() and (p_content is null or content_id=p_content)
  order by available_at,created_at for update skip locked limit 1;
 if not found then return null;end if;
 select * into strict c from public.marketing_contents where id=t.content_id for update;
 if c.version<>t.version or c.active_step_id<>t.id or c.status<>'queued' then
  update public.marketing_content_steps set status='cancelled',finished_at=now() where id=t.id;return null;
 end if;
 select * into strict d from public.instagram_post_drafts where id=c.id for update;
 if d.status<>'needs_approval' then raise exception 'CONTENT_PROJECTION_LOCKED';end if;
 operation:=case t.step when 'discovery' then 'research' when 'copy' then 'copy'
  when 'render' then case when nullif(c.request_payload->>'ai_image_slot','') is not null and not(coalesce(jsonb_typeof(t.checkpoint->'generated_ai_assets')='object' and t.checkpoint->'generated_ai_assets'<>'{}'::jsonb,false)) then 'photo' else 'render' end else null end;
 if operation is not null then
  begin
   -- Content creation validates automatic deduplication. Per-step jobs still use every existing budget and global concurrency guard.
   j:=public.reserve_marketing_generation('content:'||t.id::text,repeat(md5(t.id::text),2),c.id,d.revision,operation,c.created_by,false);
  exception when others then
   message:=sqlerrm;
   if message like '%GENERATION_ALREADY_RUNNING%' or message like '%GENERATION_COOLDOWN_30_SECONDS%' then
    update public.marketing_content_steps set available_at=now()+interval '35 seconds' where id=t.id;return null;
   end if;
   update public.marketing_content_steps set status='blocked',error_code=left(split_part(message,':',1),120),error_message=left(message,500),finished_at=now() where id=t.id;
   update public.marketing_contents set status='blocked',required_action='retry_step',error_code=left(split_part(message,':',1),120),error_message=left(message,500),state_version=state_version+1,updated_at=now() where id=c.id;
   return null;
  end;
  root:=coalesce(c.root_job_id,(j->'job'->>'id')::uuid);
  select count(*)+1 into n from public.marketing_generation_jobs where content_id=c.id;
  update public.marketing_generation_jobs set content_id=c.id,content_workflow_id=root,generation_thread_id=root,attempt_number=n,
   automatic=(c.origin='automatic'),request_payload=c.request_payload||jsonb_build_object('central_content_id',c.id,'central_version',c.version,'central_step',t.step),updated_at=now()
   where id=(j->'job'->>'id')::uuid;
  update public.marketing_contents set root_job_id=root where id=c.id;
 end if;
 update public.marketing_content_steps set status='running',lease_id=gen_random_uuid(),lease_expires_at=now()+interval '6 minutes',
  started_at=now(),generation_job_id=(j->'job'->>'id')::uuid where id=t.id returning * into t;
 update public.marketing_contents set status='running',required_action=null,state_version=state_version+1,updated_at=now() where id=c.id returning * into c;
 return jsonb_build_object('task',to_jsonb(t),'content',to_jsonb(c),'draft',to_jsonb(d),'job',j->'job');
end;$$;

create function public.checkpoint_marketing_content_step(p_task uuid,p_lease uuid,p_checkpoint jsonb default '{}'::jsonb,p_external boolean default false) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_checkpoint) is distinct from 'object' or octet_length(p_checkpoint::text)>262144 then raise exception 'INVALID_STEP_CHECKPOINT';end if;
 update public.marketing_content_steps t set checkpoint=t.checkpoint||p_checkpoint,
  external_started_at=case when p_external then coalesce(t.external_started_at,now()) else t.external_started_at end
 where t.id=p_task and t.lease_id=p_lease and t.status='running' and t.lease_expires_at>now()
  and exists(select 1 from public.marketing_contents c where c.id=t.content_id and c.version=t.version and c.active_step_id=t.id and c.status='running');
 if not found then raise exception 'STALE_CONTENT_WORKER';end if;
end;$$;

-- A compatibility projection for the existing licensed-photo/publishing machinery.
-- This helper and the content state transition are called inside one transaction.
create function roundy_private.project_marketing_content(p_id uuid,p_patch jsonb,p_copy boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform set_config('roundy.content_write',p_id::text,true);
 if p_copy then
  if jsonb_typeof(p_patch->'content_document') is distinct from 'object' or jsonb_typeof(p_patch->'carousel_slides') is distinct from 'array'
   or coalesce(length(p_patch->>'caption'),0)=0 then raise exception 'INVALID_CONTENT_COPY';end if;
  update public.instagram_post_drafts set content_document=p_patch->'content_document',carousel_slides=p_patch->'carousel_slides',
   caption=p_patch->>'caption',cta=coalesce(p_patch->>'cta',''),research_sources=coalesce(p_patch->'research_sources','[]'::jsonb),
   research_status=coalesce(p_patch->>'research_status','generated'),content_language=p_patch->>'content_language',
   draft_kind=coalesce(p_patch->>'draft_kind',draft_kind),growth_topic_type=coalesce(p_patch->>'growth_topic_type',growth_topic_type),
   content_mode=coalesce(p_patch->>'content_mode',content_mode),destination_url=coalesce(p_patch->>'destination_url',destination_url),
   render_style=case when p_patch->'content_document'->>'design_preset'='roundy_magazine_editorial_v2' then 'editorial' else render_style end,
   images='{}'::text[],revision=revision+1,regenerated_at=now(),quality_revision=null,approved_at=null,approved_by=null where id=p_id;
 else
  if jsonb_typeof(p_patch->'images') is distinct from 'array' then raise exception 'INVALID_RENDER_RESULT';end if;
  update public.instagram_post_drafts set images=array(select jsonb_array_elements_text(p_patch->'images')),
   caption=coalesce(p_patch->>'caption',caption),content_document=coalesce(p_patch->'content_document',content_document),
   revision=revision+1,regenerated_at=now(),quality_revision=null where id=p_id;
 end if;
end;$$;

create function public.finish_marketing_content_step(p_task uuid,p_lease uuid,p_outcome text,p_result jsonb default '{}'::jsonb,p_code text default null,p_message text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.marketing_content_steps;c public.marketing_contents;next_step text;copy jsonb;report jsonb;rev integer;action text;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into t from public.marketing_content_steps where id=p_task for update;
 if not found then raise exception 'CONTENT_STEP_NOT_FOUND';end if;
 select * into strict c from public.marketing_contents where id=t.content_id for update;
 if t.lease_id is distinct from p_lease or t.status<>'running' or t.lease_expires_at<=now() or c.active_step_id<>t.id or c.version<>t.version then raise exception 'STALE_CONTENT_WORKER';end if;
 if p_outcome not in ('succeeded','blocked','failed','uncertain') or jsonb_typeof(p_result) is distinct from 'object' then raise exception 'INVALID_STEP_RESULT';end if;
 copy:=p_result->'copy';
 if t.step='copy' and jsonb_typeof(copy)='object' then
  if exists(select 1 from public.marketing_content_versions where content_id=c.id and version=c.version and snapshot is not null) then raise exception 'CONTENT_VERSION_IMMUTABLE';end if;
  perform roundy_private.project_marketing_content(c.id,copy,true);
  update public.marketing_content_versions set snapshot=copy where content_id=c.id and version=c.version;
 end if;
 if p_outcome='succeeded' then
  case t.step
   when 'discovery' then next_step:='copy';
   when 'copy' then
    if jsonb_typeof(copy) is distinct from 'object' then raise exception 'COPY_RESULT_REQUIRED';end if;
    -- Material consumption is recorded only after copy commits successfully.
    if nullif(c.request_payload->>'trend_id','') is not null then
     update public.marketing_trends set used_at=now(),cooldown_until=now()+interval '60 days',material_change=false,updated_at=now()
      where id=(c.request_payload->>'trend_id')::uuid;
    end if;
    if c.origin='automatic' and c.request_payload->>'content_mode'='live_event' then
     insert into public.marketing_event_campaign_history(event_id,stage,pattern,content_language,generation_job_id,draft_id,trigger_key,trigger_snapshot)
     values((c.request_payload->>'event_id')::uuid,c.request_payload->>'event_campaign_stage',
      coalesce(nullif(c.request_payload->>'event_campaign_pattern','auto'),'event_poster'),c.request_payload->>'language',t.generation_job_id,c.id,
      repeat(md5(c.id::text||':'||c.version::text),2),jsonb_build_object('content_id',c.id,'version',c.version,'copy_snapshot',copy))
     on conflict(event_id,stage) do nothing;
    end if;
    next_step:='media';
   when 'media' then
    if (p_result->>'ready')::boolean is distinct from true then raise exception 'APPROVED_MEDIA_REQUIRED';end if;
    next_step:='render';
   when 'render' then
    if jsonb_array_length(p_result->'render'->'images') is distinct from (select jsonb_array_length(carousel_slides) from public.instagram_post_drafts where id=c.id) then raise exception 'RENDER_COUNT_MISMATCH';end if;
    perform roundy_private.project_marketing_content(c.id,p_result->'render',false);next_step:='review';
   when 'review' then
    report:=p_result->'report';
    if report->>'status' is distinct from 'passed' or report->'preflight'->>'status' is distinct from 'passed' then raise exception 'PREFLIGHT_REQUIRED';end if;
    select revision into rev from public.instagram_post_drafts where id=c.id;
    perform set_config('roundy.content_write',c.id::text,true);
    perform public.set_marketing_quality(c.id,rev,report);
    action:='final_approval_required';
  end case;
 end if;
 update public.marketing_content_steps set status=p_outcome,output=p_result,error_code=left(p_code,120),error_message=left(p_message,500),finished_at=now(),checkpoint=checkpoint-'completion' where id=t.id;
 update public.marketing_generation_jobs set status=case when p_outcome='uncertain' then 'uncertain' when p_outcome='failed' then 'failed' else 'completed' end,
  stage='content_'||t.step||'_'||p_outcome,result_snapshot=p_result,error_code=left(p_code,120),error_message=left(p_message,500),updated_at=now()
 where id=t.generation_job_id and status='running';
 if next_step is not null then
  perform roundy_private.queue_marketing_content_step(c.id,next_step);
 else
  action:=coalesce(action,case when p_outcome='uncertain' then 'reconcile_request' when p_outcome='failed' then 'retry_step'
   when t.step='discovery' then 'source_review_required' when t.step='copy' then 'copy_review_required'
   when t.step='media' then 'photo_approval_required' else 'preflight_required' end);
  update public.marketing_contents set stage=case when p_code='DISCOVERY_REFRESH_REQUIRED' then 'discovery' when p_code='PHOTO_APPROVAL_REQUIRED' then 'media' else stage end,
   status=case when p_outcome='succeeded' then 'blocked' else p_outcome end,
   required_action=case when p_code='DISCOVERY_REFRESH_REQUIRED' then 'source_review_required' when p_code='COPY_REVIEW_REQUIRED' then 'copy_review_required' when p_code='PHOTO_APPROVAL_REQUIRED' then 'photo_approval_required' else action end,error_code=left(p_code,120),error_message=left(p_message,500),state_version=state_version+1,updated_at=now() where id=c.id;
 end if;
 return (select to_jsonb(x) from public.marketing_contents x where id=c.id);
end;$$;

create function public.resume_marketing_content(p_content uuid,p_state bigint,p_confirm_paid boolean default false,p_note text default null,p_confirm_unknown boolean default false,p_step text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.marketing_contents;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into c from public.marketing_contents where id=p_content for update;
 if not found or c.state_version<>p_state then raise exception 'CONTENT_CHANGED_REFRESH';end if;
 if c.status not in ('blocked','failed','uncertain') or c.stage in ('publish','complete') or (c.required_action='final_approval_required' and p_step is null) then raise exception 'CONTENT_NOT_RETRYABLE';end if;
 if c.status='uncertain' and (not p_confirm_unknown or coalesce(length(trim(p_note)),0)<12) then raise exception 'CONFIRM_UNKNOWN_EXTERNAL_RESULT';end if;
 if p_step is not null then
  if not(p_step=c.stage or (p_step='media' and c.stage in ('render','review')) or (p_step='render' and c.stage='review')) then raise exception 'INVALID_STEP_RESTART';end if;
  c.stage:=p_step;
 end if;
 if (c.stage in ('copy','discovery') or (c.stage='render' and nullif(c.request_payload->>'ai_image_slot','') is not null)) and not p_confirm_paid then raise exception 'CONFIRM_PAID_STEP';end if;
 if c.stage='copy' and exists(select 1 from public.marketing_content_versions where content_id=c.id and version=c.version and snapshot is not null) then raise exception 'EDIT_SAVED_COPY_INSTEAD';end if;
 perform roundy_private.queue_marketing_content_step(c.id,c.stage,p_note);
 return (select to_jsonb(x) from public.marketing_contents x where id=c.id);
end;$$;

create function public.edit_marketing_content_copy(p_content uuid,p_state bigint,p_snapshot jsonb,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.marketing_contents;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into c from public.marketing_contents where id=p_content for update;
 if not found or c.state_version<>p_state then raise exception 'CONTENT_CHANGED_REFRESH';end if;
 if c.status not in ('blocked','failed') or c.stage in ('publish','complete') or p_actor is null then raise exception 'CONTENT_NOT_EDITABLE';end if;
 if not exists(select 1 from public.marketing_content_versions where content_id=c.id and version=c.version and snapshot is not null) then raise exception 'SAVED_COPY_REQUIRED';end if;
 perform roundy_private.project_marketing_content(c.id,p_snapshot,true);
 insert into public.marketing_content_versions(content_id,version,request_payload,snapshot,created_by) values(c.id,c.version+1,c.request_payload,p_snapshot,p_actor);
 update public.marketing_contents set version=version+1,status='blocked',stage='media',required_action='review_changed_content',
  active_step_id=null,approved_version=null,error_code=null,error_message=null,state_version=state_version+1,updated_at=now() where id=c.id;
 return (select to_jsonb(x) from public.marketing_contents x where id=c.id);
end;$$;

create function public.assign_marketing_content_photo(p_content uuid,p_state bigint,p_slot integer,p_asset uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.marketing_contents;rev integer;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into c from public.marketing_contents where id=p_content for update;
 if not found or c.state_version<>p_state then raise exception 'CONTENT_CHANGED_REFRESH';end if;
 if c.status not in ('blocked','failed') or c.stage in ('discovery','copy','publish','complete') then raise exception 'CONTENT_NOT_EDITABLE';end if;
 select revision into rev from public.instagram_post_drafts where id=c.id;
 perform set_config('roundy.content_write',c.id::text,true);
 perform public.assign_marketing_approved_photo(c.id,rev,p_slot,p_asset);
 update public.marketing_contents set stage='media',status='blocked',required_action='review_changed_content',approved_version=null,
  state_version=state_version+1,updated_at=now(),error_code=null,error_message=null where id=c.id;
 return (select to_jsonb(x) from public.marketing_contents x where id=c.id);
end;$$;

create function public.approve_marketing_content(p_content uuid,p_state bigint,p_actor uuid,p_report jsonb,p_immediate boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.marketing_contents;rev integer;r jsonb;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into c from public.marketing_contents where id=p_content for update;
 if not found or c.state_version<>p_state then raise exception 'CONTENT_CHANGED_REFRESH';end if;
 if c.stage<>'review' or c.status<>'blocked' or c.required_action<>'final_approval_required' or p_actor is null then raise exception 'CONTENT_APPROVAL_REQUIRED';end if;
 if p_report->>'status' is distinct from 'passed' or p_report->'preflight'->>'status' is distinct from 'passed' then raise exception 'PREFLIGHT_REQUIRED';end if;
 select revision into rev from public.instagram_post_drafts where id=c.id for update;
 if (p_report->'preflight'->>'revision')::integer is distinct from rev then raise exception 'PREFLIGHT_VERSION_CHANGED';end if;
 if p_report->'preflight'->'photo_manifest' is distinct from (select output->'manifest' from public.marketing_content_steps where content_id=c.id and version=c.version and step='render' and status='succeeded' order by attempt desc limit 1) then raise exception 'RENDERED_PHOTOS_CHANGED';end if;
 perform set_config('roundy.content_write',c.id::text,true);
 perform public.set_marketing_quality(c.id,rev,p_report);
 if p_immediate then r:=public.publish_marketing_draft_now(c.id,rev,p_actor);else r:=public.approve_marketing_draft(c.id,rev,p_actor);end if;
 update public.marketing_contents set status='scheduled',stage='publish',required_action=null,approved_version=version,
  publishing_run_id=(r->'run'->>'id')::uuid,state_version=state_version+1,updated_at=now() where id=c.id;
 return jsonb_build_object('content',(select to_jsonb(x) from public.marketing_contents x where id=c.id),'publication',r);
end;$$;

create function public.archive_marketing_content(p_content uuid,p_state bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.marketing_contents;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into c from public.marketing_contents where id=p_content for update;
 if not found or c.state_version<>p_state then raise exception 'CONTENT_CHANGED_REFRESH';end if;
 if c.status in ('running','scheduled','published','uncertain') then raise exception 'CONTENT_NOT_ARCHIVABLE';end if;
 update public.marketing_content_steps set status='cancelled',finished_at=now() where content_id=c.id and status='queued';
 perform set_config('roundy.content_write',c.id::text,true);
 update public.instagram_post_drafts set status='skipped' where id=c.id;
 update public.marketing_contents set status='archived',required_action=null,state_version=state_version+1,updated_at=now() where id=c.id;
 return (select to_jsonb(x) from public.marketing_contents x where id=c.id);
end;$$;

create function roundy_private.sync_marketing_content_publication() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status is not distinct from old.status then return new;end if;
 update public.marketing_contents set stage=case when new.status='sent' then 'complete' else 'publish' end,
  status=case new.status when 'sent' then 'published' when 'publishing' then 'running' when 'failed' then 'failed'
   when 'needs_review' then 'uncertain' when 'skipped' then 'archived' else 'scheduled' end,
  required_action=case when new.status='needs_review' then 'reconcile_request' when new.status='failed' then 'retry_step' else null end,
  error_message=case when new.status in ('failed','needs_review') then left(new.message,500) else null end,
  state_version=state_version+1,updated_at=now()
 where publishing_run_id=new.id and approved_version=version;
 return new;
end;$$;
create trigger sync_marketing_content_publication after update of status on public.marketing_runs for each row execute function roundy_private.sync_marketing_content_publication();

-- Every mutating RPC is service-only; browser authorization remains the existing admin gate.
revoke all on function public.start_marketing_content(text,jsonb,text,uuid,uuid),public.claim_marketing_content_step(uuid),
 public.checkpoint_marketing_content_step(uuid,uuid,jsonb,boolean),public.finish_marketing_content_step(uuid,uuid,text,jsonb,text,text),
 public.resume_marketing_content(uuid,bigint,boolean,text,boolean,text),public.edit_marketing_content_copy(uuid,bigint,jsonb,uuid),
 public.assign_marketing_content_photo(uuid,bigint,integer,uuid),public.approve_marketing_content(uuid,bigint,uuid,jsonb,boolean),
 public.archive_marketing_content(uuid,bigint) from public,anon,authenticated;
grant execute on function public.start_marketing_content(text,jsonb,text,uuid,uuid),public.claim_marketing_content_step(uuid),
 public.checkpoint_marketing_content_step(uuid,uuid,jsonb,boolean),public.finish_marketing_content_step(uuid,uuid,text,jsonb,text,text),
 public.resume_marketing_content(uuid,bigint,boolean,text,boolean,text),public.edit_marketing_content_copy(uuid,bigint,jsonb,uuid),
 public.assign_marketing_content_photo(uuid,bigint,integer,uuid),public.approve_marketing_content(uuid,bigint,uuid,jsonb,boolean),
 public.archive_marketing_content(uuid,bigint) to service_role;
revoke all on function roundy_private.queue_marketing_content_step(uuid,text,text),roundy_private.project_marketing_content(uuid,jsonb,boolean),
 roundy_private.guard_managed_marketing_draft(),roundy_private.guard_marketing_content_version(),roundy_private.sync_marketing_content_publication() from public,anon,authenticated;
grant execute on function roundy_private.queue_marketing_content_step(uuid,text,text),roundy_private.project_marketing_content(uuid,jsonb,boolean),
 roundy_private.guard_managed_marketing_draft(),roundy_private.guard_marketing_content_version(),roundy_private.sync_marketing_content_publication() to service_role;

create function public.refine_marketing_content_subject(p_content uuid,p_state bigint,p_instruction text,p_actor uuid,p_confirm_paid boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.marketing_contents;request jsonb;first_step text;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into c from public.marketing_contents where id=p_content for update;
 if not found or c.state_version<>p_state then raise exception 'CONTENT_CHANGED_REFRESH';end if;
 if c.status not in ('blocked','failed') or c.stage in ('publish','complete') or p_actor is null then raise exception 'CONTENT_NOT_EDITABLE';end if;
 if not p_confirm_paid then raise exception 'CONFIRM_PAID_STEP';end if;
 if p_instruction is null or length(trim(p_instruction)) not between 1 and 500 then raise exception 'INSTRUCTION_LIMIT_500';end if;
 request:=jsonb_set(c.request_payload,'{instruction}',to_jsonb(trim(p_instruction)));
 first_step:=case when request->>'topic_type' in ('book_insight','trend_research','dating_myth','seoul_dating','seoul_trend') then 'discovery' else 'copy' end;
 perform set_config('roundy.content_write',c.id::text,true);
 update public.instagram_post_drafts set caption='',carousel_slides='[]'::jsonb,images='{}'::text[],content_document=null,
  research_sources='[]'::jsonb,quality_revision=null,approved_at=null,approved_by=null,revision=revision+1 where id=c.id;
 insert into public.marketing_content_versions(content_id,version,request_payload,created_by) values(c.id,c.version+1,request,p_actor);
 update public.marketing_contents set version=version+1,request_payload=request,approved_version=null,active_step_id=null where id=c.id;
 perform roundy_private.queue_marketing_content_step(c.id,first_step,'Administrator refined the subject');
 return (select to_jsonb(x) from public.marketing_contents x where id=c.id);
end;$$;
revoke all on function public.refine_marketing_content_subject(uuid,bigint,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.refine_marketing_content_subject(uuid,bigint,text,uuid,boolean) to service_role;

-- Photo status changes notify the central controller even when made through the shared library.
-- Never overwrite content versions or grant publication approval here.
create function roundy_private.invalidate_managed_photo_content() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.review_status,new.content_sha256,new.storage_path,new.reviewed_at,new.license_checked_at) is not distinct from
    (old.review_status,old.content_sha256,old.storage_path,old.reviewed_at,old.license_checked_at) then return new;end if;
 update public.marketing_contents c set
  state_version=state_version+1,updated_at=now(),approved_version=null,
  stage=case when c.status in ('blocked','failed') then 'media' else c.stage end,
  status=case when c.status in ('blocked','failed') then 'blocked' else c.status end,
  required_action=case when c.status in ('blocked','failed') then 'review_changed_content' else c.required_action end
 where c.status not in ('scheduled','published','archived') and c.stage not in ('publish','complete')
  and exists(select 1 from public.marketing_draft_photos p where p.draft_id=c.id and p.asset_id=new.id);
 return new;
end;$$;
create trigger invalidate_managed_photo_content after update on public.marketing_photo_assets for each row execute function roundy_private.invalidate_managed_photo_content();
revoke all on function roundy_private.invalidate_managed_photo_content() from public,anon,authenticated;
grant execute on function roundy_private.invalidate_managed_photo_content() to service_role;

do $compat$
declare definition text;
begin
 definition:=pg_get_functiondef('roundy_private.reserve_marketing_feed_slot(uuid,boolean)'::regprocedure);
 if position('editorial_workflow_version''=''1''' in definition)>0 then
  definition:=replace(definition,'editorial_workflow_version''=''1''','editorial_workflow_version'' in (''1'',''2'')');
  execute definition;
 elsif position('editorial_workflow_version'' in (''1'',''2'')' in definition)=0 then
  raise exception 'FEED_SLOT_COMPATIBILITY_REVIEW_REQUIRED';
 end if;
end;$compat$;
notify pgrst,'reload schema';
commit;
