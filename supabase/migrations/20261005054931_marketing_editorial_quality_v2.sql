alter table public.instagram_post_drafts add column if not exists content_document jsonb, add column if not exists quality_report jsonb not null default '{"version":2,"status":"unchecked","issues":[]}'::jsonb, add column if not exists quality_revision integer;
alter table public.marketing_generation_jobs add column if not exists quality_report jsonb, add column if not exists research_cache jsonb;
alter table public.instagram_post_drafts add constraint instagram_quality_report_object check(jsonb_typeof(quality_report)='object');
alter table public.marketing_generation_jobs add constraint marketing_quality_report_object check(quality_report is null or jsonb_typeof(quality_report)='object');

create or replace function roundy_private.invalidate_marketing_quality() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('service_role','postgres','supabase_admin') and (new.quality_report is distinct from old.quality_report or new.quality_revision is distinct from old.quality_revision or new.content_document is distinct from old.content_document) then raise exception 'QUALITY_SERVER_ONLY'; end if;
 if (new.caption,new.cta,new.images,new.carousel_slides,new.research_sources,new.research_status,new.content_language,new.draft_kind,new.growth_topic_type,new.content_mode,new.event_id,new.destination_url,new.content_document,new.revision) is distinct from (old.caption,old.cta,old.images,old.carousel_slides,old.research_sources,old.research_status,old.content_language,old.draft_kind,old.growth_topic_type,old.content_mode,old.event_id,old.destination_url,old.content_document,old.revision) then
  new.quality_report:=jsonb_build_object('version',2,'status','unchecked','issues',jsonb_build_array('내용이 변경됐습니다. 게시 전에 무료 품질 검사를 실행하세요.'));
  new.quality_revision:=null;
 end if;
 return new;
end $$;
revoke all on function roundy_private.invalidate_marketing_quality() from public,anon,authenticated;
create trigger invalidate_marketing_quality before update on public.instagram_post_drafts for each row execute function roundy_private.invalidate_marketing_quality();

create or replace function public.set_marketing_quality(p_draft uuid,p_revision integer,p_report jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.instagram_post_drafts;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_draft for update;
 if not found or d.status<>'needs_approval' or d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if p_report->>'version'<>'2' or p_report->>'status' not in ('passed','rejected') or jsonb_typeof(p_report->'issues')<>'array' then raise exception 'INVALID_QUALITY_REPORT'; end if;
 if p_report->>'status'='passed' and (d.content_document is null or d.content_document->>'schema_version'<>'2') then raise exception 'CONTENT_DOCUMENT_REQUIRED'; end if;
 update public.instagram_post_drafts set quality_report=p_report,quality_revision=p_revision where id=p_draft returning * into d;
 return to_jsonb(d);
end $$;
revoke all on function public.set_marketing_quality(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.set_marketing_quality(uuid,integer,jsonb) to service_role;

create or replace function roundy_private.guard_marketing_publication() returns trigger language plpgsql security invoker set search_path='' as $$
declare d public.instagram_post_drafts; did uuid;
begin
 if new.channel<>'instagram' or new.status not in ('queued','publishing') then return new; end if;
 perform pg_advisory_xact_lock(70361005);
 begin did:=(new.snapshot->>'draft_id')::uuid; exception when others then raise exception '검토된 초안에서만 Instagram에 게시할 수 있습니다.'; end;
 select * into d from public.instagram_post_drafts where id=did for update;
 if not found or d.quality_report->>'status' is distinct from 'passed' or d.quality_report->>'version' is distinct from '2' or d.quality_revision is distinct from d.revision then raise exception '품질 검사 미통과: 초안의 오류와 출처를 확인하세요. 자동 게시하거나 재생성하지 않았습니다.'; end if;
 if d.caption is distinct from new.snapshot->>'caption' or d.cta is distinct from new.snapshot->>'cta' or to_jsonb(d.images) is distinct from new.snapshot->'images' or d.destination_url is distinct from new.snapshot->>'destination_url' then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if coalesce(cardinality(d.images),0)=0 or length(trim(d.caption))=0 then raise exception 'COMPLETE_COPY_AND_IMAGES_FIRST'; end if;
 if d.growth_topic_type in ('book_insight','trend_research','dating_myth') and (d.research_status<>'generated' or jsonb_array_length(coalesce(d.research_sources,'[]'))=0) then raise exception '근거가 필요한 콘텐츠는 출처 없이 게시할 수 없습니다.'; end if;
 return new;
end $$;
revoke all on function roundy_private.guard_marketing_publication() from public,anon,authenticated;
create trigger guard_marketing_publication before insert or update of status,snapshot on public.marketing_runs for each row execute function roundy_private.guard_marketing_publication();

-- Preserve the live lock, cooldown, monthly/daily budgets and unknown-outcome protections.
do $$ declare definition text; begin
 select pg_get_functiondef('public.reserve_marketing_generation(text,text,uuid,integer,text,uuid,boolean)'::regprocedure) into definition;
 if position('when ''research'' then 0.02' in definition)=0 then raise exception 'UNEXPECTED_RESERVATION_DEFINITION'; end if;
 execute replace(definition,'when ''research'' then 0.02','when ''research'' then 0.05');
end $$;
