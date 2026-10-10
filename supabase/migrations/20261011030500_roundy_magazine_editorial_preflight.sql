-- Versioned feed editorial pre-publication gate. No draft or published assets are rewritten.
-- Pexels/multi-provider source rights, review hashes, approved-by and locked
-- seven-step quality manifest remain fail-closed and identical to v1.
begin;
create or replace function roundy_private.guard_marketing_preflight_transition()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
 d public.instagram_post_drafts;
 did uuid;
 pf jsonb;
 actual_manifest jsonb;
 config public.marketing_automation_settings;
 expected_count integer;
 minimum_photos integer;
 invalid_photos integer;
begin
 if TG_TABLE_NAME='marketing_runs' then
  if new.channel<>'instagram' or new.status not in ('queued','publishing') then return new; end if;
  begin did:=(new.snapshot->>'draft_id')::uuid;
  exception when others then raise exception 'MARKETING_PREFLIGHT_DRAFT_REQUIRED'; end;
  if did is null then raise exception 'MARKETING_PREFLIGHT_DRAFT_REQUIRED'; end if;
 elsif TG_TABLE_NAME='instagram_post_drafts' then
  if TG_OP<>'UPDATE' or old.status is distinct from 'needs_approval'
      or new.status not in ('approved','scheduled','publishing','published') then return new; end if;
  did:=new.id;
 else
  return new;
 end if;
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=did for update;
 if not found then raise exception 'MARKETING_PREFLIGHT_DRAFT_NOT_FOUND'; end if;
 pf:=d.quality_report->'preflight';
 if d.quality_report->>'version' is distinct from '2'
   or d.quality_report->>'status' is distinct from 'passed'
   or d.quality_revision is distinct from d.revision
   or pf->>'version' is distinct from '1'
   or pf->>'status' is distinct from 'passed'
   or pf->>'revision' is distinct from d.revision::text
   or jsonb_typeof(pf->'checks') is distinct from 'array'
   or jsonb_array_length(pf->'checks')<>7
   or jsonb_typeof(pf->'issues') is distinct from 'array'
   or jsonb_array_length(pf->'issues')<>0
   or exists(select 1 from jsonb_array_elements(coalesce(pf->'checks','[]'::jsonb)) c where c->>'passed' is distinct from 'true')
 then
  raise exception 'MARKETING_PREFLIGHT_NOT_PASSED: 검증 항목을 모두 통과하고 무료 재검사를 저장해야 합니다.';
 end if;
 expected_count:=(pf->>'slide_count')::integer;
 if expected_count not in (3,5)
  or coalesce(jsonb_array_length(d.carousel_slides),0)<>expected_count
  or coalesce(cardinality(d.images),0)<>expected_count
  or d.content_document->'carousel_template' is null
  or (d.content_document->'carousel_template'->>'slide_count')::integer<>expected_count
  or d.content_document->>'answer_first' is distinct from 'true'
  or d.content_document->>'thumbnail_render_pending' is distinct from 'false'
  or (
    case when d.content_document->>'design_preset'='roundy_magazine_editorial_v2' then
      d.carousel_slides->(expected_count-1)->>'role' is distinct from 'editorial_closing'
      or not coalesce((d.carousel_slides->(expected_count-1)->>'closing_type') in ('summary','insight','brand_outro'),false)
      or coalesce(d.cta,'') <> ''
      or not (pf->'checks' @> '[{"id":"editorial_closing","passed":true}]'::jsonb)
      or (pf->'checks' @> '[{"id":"final_cta"}]'::jsonb)
      or (
        expected_count=3 and (
          d.carousel_slides->0->>'role' is distinct from 'cover'
          or d.carousel_slides->1->>'role' is distinct from 'key_insight'
        )
      )
      or (
        expected_count=5 and (
          d.carousel_slides->0->>'role' is distinct from 'cover'
          or d.carousel_slides->1->>'role' is distinct from 'context'
          or d.carousel_slides->2->>'role' is distinct from 'insight'
          or d.carousel_slides->3->>'role' is distinct from 'insight'
        )
      )
    else d.carousel_slides->(expected_count-1)->>'role' is distinct from 'cta'
    end
  )
 then
  raise exception 'MARKETING_PREFLIGHT_CAROUSEL_CHANGED';
 end if;
 select * into config from public.marketing_automation_settings where singleton=true;
 minimum_photos:=greatest(
  2,
  coalesce(case when expected_count=3 then config.carousel_min_real_photos_3 else config.carousel_min_real_photos_5 end,3),
  coalesce((pf->>'min_real_photos')::integer,0)
 );
 if d.visual_source not in ('pexels','stock') then
  raise exception 'MARKETING_PREFLIGHT_VERIFIED_PHOTOS_REQUIRED';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'slot',p.slot,'asset_id',p.asset_id::text,
   'source_url',coalesce(a.source_url,''),'license_url',coalesce(a.license_url,''),
   'review_status',coalesce(a.review_status,''),'reviewed_by',coalesce(a.reviewed_by::text,''),
   'reviewed',a.reviewed_at is not null,'license_checked',a.license_checked_at is not null,
   'sha256',coalesce(a.content_sha256,''),'storage_path',coalesce(a.storage_path,'')
 ) order by p.slot),'[]'::jsonb),
 count(*) filter (
  where a.review_status is distinct from 'approved'
     or a.reviewed_by is null or a.reviewed_at is null or a.license_checked_at is null
     or not roundy_private.marketing_photo_rights_valid(a)
     or a.storage_path is null or a.content_sha256 !~ '^[0-9a-f]{64}$'
 ) into actual_manifest,invalid_photos
 from public.marketing_draft_photos p
 left join public.marketing_photo_assets a on a.id=p.asset_id
 where p.draft_id=d.id;
 if jsonb_typeof(pf->'photo_manifest') is distinct from 'array'
  or actual_manifest is distinct from pf->'photo_manifest'
  or jsonb_array_length(actual_manifest)<minimum_photos or invalid_photos<>0
 then
  raise exception 'MARKETING_PREFLIGHT_PHOTO_APPROVAL_CHANGED: 사진 출처, 승인 및 최소 개수를 다시 검증해야 합니다.';
 end if;
 if TG_TABLE_NAME='marketing_runs' and TG_OP='UPDATE'
   and (d.status not in ('scheduled','approved','publishing','published')
       or d.approved_by is null or d.approved_at is null)
 then raise exception 'MARKETING_PREFLIGHT_MANUAL_APPROVAL_REQUIRED'; end if;
 if TG_TABLE_NAME='instagram_post_drafts' then
  if new.approved_by is null or new.approved_at is null then
   raise exception 'MARKETING_PREFLIGHT_MANUAL_APPROVAL_REQUIRED';
  end if;
 end if;
 return new;
end $$;
revoke all on function roundy_private.guard_marketing_preflight_transition() from public,anon,authenticated;
comment on function roundy_private.guard_marketing_preflight_transition() is
 'Version-aware feed gate: v1 CTA and v2 non-promotional editorial closings, with identical independent photo-rights and admin-approval checks.';
commit;
