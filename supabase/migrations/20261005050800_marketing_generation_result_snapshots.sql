alter table public.marketing_generation_jobs
  add column if not exists result_snapshot jsonb,
  add column if not exists result_revision integer;

alter table public.marketing_generation_jobs
  drop constraint if exists marketing_generation_jobs_result_snapshot_object_check;

alter table public.marketing_generation_jobs
  add constraint marketing_generation_jobs_result_snapshot_object_check
  check (result_snapshot is null or jsonb_typeof(result_snapshot)='object');

create or replace function public.restore_marketing_generation_snapshot(p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.marketing_generation_jobs; d public.instagram_post_drafts; s jsonb;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into j from public.marketing_generation_jobs where id=p_job_id for update;
 if not found or j.status<>'completed' then raise exception 'COMPLETED_GENERATION_REQUIRED'; end if;
 s:=j.result_snapshot;if s is null then raise exception 'RESULT_SNAPSHOT_UNAVAILABLE'; end if;
 select * into d from public.instagram_post_drafts where id=j.draft_id for update;
 if not found or d.status<>'needs_approval' then raise exception 'DRAFT_NOT_EDITABLE'; end if;
 if exists(select 1 from public.marketing_generation_jobs where draft_id=d.id and status='running' and created_at>now()-interval '5 minutes') then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 update public.instagram_post_drafts set
  caption=coalesce(s->>'caption',caption),cta=coalesce(s->>'cta',cta),destination_url=coalesce(s->>'destination_url',destination_url),
  images=case when jsonb_typeof(s->'images')='array' then array(select jsonb_array_elements_text(s->'images')) else images end,
  carousel_slides=case when jsonb_typeof(s->'carousel_slides')='array' then s->'carousel_slides' else carousel_slides end,
  research_sources=case when jsonb_typeof(s->'research_sources')='array' then s->'research_sources' else research_sources end,
  research_status=coalesce(s->>'research_status',research_status),content_language=coalesce(s->>'content_language',content_language),
  draft_kind=coalesce(s->>'draft_kind',draft_kind),growth_topic_type=case when s ? 'growth_topic_type' then s->>'growth_topic_type' else growth_topic_type end,
  content_mode=coalesce(s->>'content_mode',content_mode),content_pillar=coalesce(s->>'content_pillar',content_pillar),
  generation_reason=coalesce(s->>'generation_reason',generation_reason),
  event_id=case when s ? 'event_id' and nullif(s->>'event_id','') is not null then (s->>'event_id')::uuid when s ? 'event_id' then null else event_id end,
  revision=revision+1,regenerated_at=now(),updated_at=now()
 where id=d.id returning * into d;
 return to_jsonb(d);
end $$;
revoke all on function public.restore_marketing_generation_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.restore_marketing_generation_snapshot(uuid) to service_role;
