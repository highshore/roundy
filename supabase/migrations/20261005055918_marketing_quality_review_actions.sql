create or replace function public.reject_marketing_content(p_job uuid,p_reason text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.marketing_generation_jobs; d public.instagram_post_drafts; latest uuid; report jsonb;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into j from public.marketing_generation_jobs where id=p_job for update;
 if not found or j.status not in ('completed','failed') or j.result_snapshot is null then raise exception '검토할 생성 결과가 없습니다.'; end if;
 select id into latest from public.marketing_generation_jobs where generation_thread_id=coalesce(j.generation_thread_id,j.id) order by attempt_number desc nulls last,created_at desc limit 1;
 if latest is not null and latest<>j.id then raise exception 'GENERATION_THREAD_NOT_RETRYABLE'; end if;
 report:=jsonb_build_object('version',2,'status','rejected','review_required',true,'issues',jsonb_build_array(left(coalesce(nullif(trim(p_reason),''),'관리자 품질 검토에서 재작업 요청'),500)));
 update public.marketing_generation_jobs set status='failed',quality_report=report,error_code='CONTENT_QUALITY_REJECTED',error_message='관리자 품질 검토에서 재작업을 요청했습니다. 같은 스레드에서 재시도하세요.',updated_at=now() where id=p_job;
 select * into d from public.instagram_post_drafts where id=j.draft_id for update;
 if d.status='needs_approval' and d.revision=j.result_revision then update public.instagram_post_drafts set quality_report=report,quality_revision=d.revision where id=d.id; end if;
 return jsonb_build_object('job_id',p_job,'quality_report',report);
end $$;
revoke all on function public.reject_marketing_content(uuid,text) from public,anon,authenticated;
grant execute on function public.reject_marketing_content(uuid,text) to service_role;

create or replace function public.restore_marketing_generation_snapshot(p_job_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.marketing_generation_jobs; d public.instagram_post_drafts; s jsonb;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into j from public.marketing_generation_jobs where id=p_job_id for update;
 if not found or j.status<>'completed' or j.quality_report->>'status'='rejected' then raise exception 'COMPLETED_GENERATION_REQUIRED'; end if;
 s:=j.result_snapshot;if s is null then raise exception 'RESULT_SNAPSHOT_UNAVAILABLE'; end if;
 select * into d from public.instagram_post_drafts where id=j.draft_id for update;
 if not found or d.status<>'needs_approval' then raise exception 'DRAFT_NOT_EDITABLE'; end if;
 if exists(select 1 from public.marketing_generation_jobs where draft_id=d.id and status='running' and created_at>now()-interval '5 minutes') then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 update public.instagram_post_drafts set
 content_document=s->'content_document',caption=coalesce(s->>'caption',caption),cta=coalesce(s->>'cta',cta),destination_url=coalesce(s->>'destination_url',destination_url),
 images=case when jsonb_typeof(s->'images')='array' then array(select jsonb_array_elements_text(s->'images')) else images end,
 carousel_slides=case when jsonb_typeof(s->'carousel_slides')='array' then s->'carousel_slides' else carousel_slides end,
 research_sources=case when jsonb_typeof(s->'research_sources')='array' then s->'research_sources' else research_sources end,
 research_status=coalesce(s->>'research_status',research_status),content_language=coalesce(s->>'content_language',content_language),draft_kind=coalesce(s->>'draft_kind',draft_kind),growth_topic_type=case when s ? 'growth_topic_type' then s->>'growth_topic_type' else growth_topic_type end,
 content_mode=coalesce(s->>'content_mode',content_mode),content_pillar=coalesce(s->>'content_pillar',content_pillar),generation_reason=coalesce(s->>'generation_reason',generation_reason),
 event_id=case when s ? 'event_id' and nullif(s->>'event_id','') is not null then (s->>'event_id')::uuid when s ? 'event_id' then null else event_id end,
 revision=revision+1,regenerated_at=now(),updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d);
end $$;
revoke all on function public.restore_marketing_generation_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.restore_marketing_generation_snapshot(uuid) to service_role;

create or replace function public.set_marketing_quality(p_draft uuid,p_revision integer,p_report jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.instagram_post_drafts;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_draft for update;
 if not found or d.status<>'needs_approval' or d.revision is distinct from p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if p_report->>'version' is distinct from '2' or coalesce(p_report->>'status','') not in ('passed','rejected') or jsonb_typeof(p_report->'issues') is distinct from 'array' then raise exception 'INVALID_QUALITY_REPORT'; end if;
 if p_report->>'status'='passed' and (d.content_document is null or d.content_document->>'schema_version' is distinct from '2' or jsonb_array_length(p_report->'issues')<>0) then raise exception 'CONTENT_DOCUMENT_REQUIRED'; end if;
 update public.instagram_post_drafts set quality_report=p_report,quality_revision=p_revision where id=p_draft returning * into d;
 return to_jsonb(d);
end $$;
revoke all on function public.set_marketing_quality(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.set_marketing_quality(uuid,integer,jsonb) to service_role;
