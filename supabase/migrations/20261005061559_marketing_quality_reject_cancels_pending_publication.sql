create or replace function public.reject_marketing_content(p_job uuid,p_reason text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.marketing_generation_jobs; d public.instagram_post_drafts; latest uuid; report jsonb; run_status text; matches_current boolean;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into j from public.marketing_generation_jobs where id=p_job for update;
 if not found or j.status not in ('completed','failed') or j.result_snapshot is null then raise exception '검토할 생성 결과가 없습니다.'; end if;
 select id into latest from public.marketing_generation_jobs where generation_thread_id=coalesce(j.generation_thread_id,j.id) order by attempt_number desc nulls last,created_at desc limit 1;
 if latest is not null and latest<>j.id then raise exception 'GENERATION_THREAD_NOT_RETRYABLE'; end if;
 select * into d from public.instagram_post_drafts where id=j.draft_id for update;
 matches_current:=d.revision=j.result_revision or (d.caption is not distinct from j.result_snapshot->>'caption' and to_jsonb(d.images) is not distinct from j.result_snapshot->'images');
 if matches_current and d.marketing_run_id is not null and d.status in ('approved','scheduled') then
  begin select status into run_status from public.marketing_runs where id=d.marketing_run_id for update nowait;
  exception when lock_not_available then raise exception '게시 작업이 상태를 변경 중입니다. 실제 게시 여부를 확인하고 다시 검토하세요.';end;
  if run_status in ('publishing','sent','needs_review') then raise exception '게시가 이미 시작됐거나 결과 확인이 필요합니다. 실제 Instagram 게시 상태부터 확인하세요.';end if;
  update public.marketing_runs set status='skipped',message='관리자 품질 검토로 게시 예약이 취소되었습니다.' where id=d.marketing_run_id and status='queued';
  update public.instagram_post_drafts set status='needs_approval',marketing_run_id=null,approved_at=null,approved_by=null where id=d.id;
 end if;
 report:=jsonb_build_object('version',2,'status','rejected','review_required',true,'issues',jsonb_build_array(left(coalesce(nullif(trim(p_reason),''),'관리자 품질 검토에서 재작업 요청'),500)));
 update public.marketing_generation_jobs set status='failed',quality_report=report,error_code='CONTENT_QUALITY_REJECTED',error_message='관리자 품질 검토에서 재작업을 요청했습니다. 같은 스레드에서 재시도하세요.',updated_at=now() where id=p_job;
 if matches_current and d.status in ('needs_approval','approved','scheduled') then update public.instagram_post_drafts set quality_report=report,quality_revision=d.revision where id=d.id;end if;
 return jsonb_build_object('job_id',p_job,'quality_report',report,'published_content_removed',false);
end $$;
revoke all on function public.reject_marketing_content(uuid,text) from public,anon,authenticated;
grant execute on function public.reject_marketing_content(uuid,text) to service_role;
