create role anon;create role authenticated;create role service_role;
create schema auth;create schema roundy_private;
create table auth.users(id uuid primary key);
create function public.is_admin() returns boolean language sql set search_path=public as $$select coalesce(current_setting('fixture.is_admin',true),'false')='true'$$;
create table public.instagram_post_drafts (
 id uuid primary key default gen_random_uuid(),draft_date date not null,draft_role text default 'candidate',status text default 'needs_approval',
 generation_source text,visual_source text,content_language text,content_mode text,draft_kind text,growth_topic_type text,content_pillar text,
 caption text default '',cta text default '',destination_url text,images text[] default '{}',carousel_slides jsonb default '[]',research_sources jsonb default '[]',research_status text,
 revision integer default 1 check(revision between 1 and 99),imported_at timestamptz,recommended_time_kst time,window_start_kst time,window_end_kst time,scheduled_for timestamptz,
 event_id uuid,trend_id uuid,generation_reason text,content_document jsonb,quality_revision integer,quality_report jsonb,approved_at timestamptz,approved_by uuid,
 regenerated_at timestamptz,updated_at timestamptz default now(),render_style text,marketing_run_id uuid,published_at timestamptz
);
create table public.marketing_runs(id uuid primary key default gen_random_uuid(),channel text default 'instagram',snapshot jsonb,status text default 'queued',message text,scheduled_for timestamptz);
create table public.marketing_generation_jobs(id uuid primary key default gen_random_uuid(),request_key text unique,fingerprint text,draft_id uuid,
 status text default 'running',operation text,reserved_usd numeric default 0,automatic boolean,stage text,expected_revision integer,actor_id uuid,
 generation_thread_id uuid references public.marketing_generation_jobs(id),content_workflow_id uuid references public.marketing_generation_jobs(id),
 attempt_number int,request_payload jsonb,result_snapshot jsonb,error_code text,error_message text,created_at timestamptz default now(),updated_at timestamptz default now(),
 unique(generation_thread_id,attempt_number));
create function public.reserve_marketing_generation(p_key text,p_fingerprint text,p_draft uuid,p_revision integer,p_operation text,p_actor uuid default null,p_automatic boolean default false) returns jsonb language plpgsql set search_path=public as $$
declare j marketing_generation_jobs;
begin
 if current_setting('fixture.budget_blocked',true)='true' then raise exception 'GENERATION_BUDGET_REACHED';end if;
 if exists(select 1 from marketing_generation_jobs where status='running') then raise exception 'GENERATION_ALREADY_RUNNING';end if;
 insert into marketing_generation_jobs(request_key,fingerprint,draft_id,operation,expected_revision,actor_id,automatic,reserved_usd)
 values(p_key,p_fingerprint,p_draft,p_operation,p_revision,p_actor,p_automatic,case when p_operation='render' then 0 else .02 end) returning * into j;
 return jsonb_build_object('accepted',true,'job',to_jsonb(j));end;$$;
create function public.set_marketing_quality(p_draft uuid,p_revision integer,p_report jsonb) returns jsonb language plpgsql set search_path=public as $$
begin update instagram_post_drafts set quality_report=p_report,quality_revision=p_revision where id=p_draft and revision=p_revision;
 if not found then raise exception 'DRAFT_CHANGED_REFRESH_FIRST';end if;
 return (select to_jsonb(d) from instagram_post_drafts d where id=p_draft);end;$$;
create function public.approve_marketing_draft(p_id uuid,p_revision integer,p_actor uuid) returns jsonb language plpgsql set search_path=public as $$
declare d instagram_post_drafts;r marketing_runs;
begin
 select * into strict d from instagram_post_drafts where id=p_id and revision=p_revision and status='needs_approval';
 if d.quality_report->>'status'<>'passed' then raise exception 'QUALITY_REQUIRED';end if;
 insert into marketing_runs(snapshot) values(jsonb_build_object('draft_id',p_id)) returning * into r;
 update instagram_post_drafts set status='scheduled',marketing_run_id=r.id,approved_by=p_actor,approved_at=now() where id=p_id returning * into d;
 return jsonb_build_object('draft',to_jsonb(d),'run',to_jsonb(r));end;$$;
create function public.publish_marketing_draft_now(p_id uuid,p_revision int,p_actor uuid) returns jsonb language sql set search_path=public as $$select approve_marketing_draft(p_id,p_revision,p_actor)$$;
create function public.assign_marketing_approved_photo(p_draft uuid,p_revision int,p_slot int,p_asset uuid) returns jsonb language sql set search_path=public as $$select '{}'::jsonb$$;
create function public.reserve_marketing_carousel_slot(p_draft uuid) returns bigint language sql set search_path=public as $$select 1::bigint$$;
create function roundy_private.reserve_marketing_feed_slot(p_draft uuid,p_immediate boolean default false) returns jsonb language sql set search_path=public as $$select jsonb_build_object('manual',d.content_document->>'editorial_workflow_version'='1') from public.instagram_post_drafts d where id=p_draft$$;

create table public.marketing_photo_assets(id uuid primary key,review_status text,content_sha256 text,storage_path text,reviewed_at timestamptz,license_checked_at timestamptz);
create table public.marketing_draft_photos(draft_id uuid,asset_id uuid,slot integer);
