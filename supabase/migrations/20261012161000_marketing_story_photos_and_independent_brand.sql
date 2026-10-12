-- Server-owned brand outro, all-story licensed imagery. Legacy drafts unchanged.
begin;
alter table public.marketing_automation_settings add column if not exists carousel_brand_outro_enabled boolean not null default true;
comment on column public.marketing_automation_settings.carousel_brand_outro_enabled is 'New content adds a final brand card to an immutable 3/5-story reservation';
CREATE OR REPLACE FUNCTION public.assign_marketing_approved_photo(p_draft uuid, p_revision integer, p_slot integer, p_asset uuid)
 RETURNS instagram_post_drafts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 d public.instagram_post_drafts;
 a public.marketing_photo_assets;
 n integer;
 ai_slot integer;
 allowed integer[];
 old_asset uuid;
 linked_count integer;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_draft for update;
 if not found or d.draft_role<>'candidate' or d.status<>'needs_approval'
  or d.imported_at is null or d.visual_source not in ('stock','pexels')
 then raise exception 'STOCK_DRAFT_NOT_EDITABLE'; end if;
 if d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if exists(select 1 from public.marketing_generation_jobs where draft_id=p_draft
   and status='running' and created_at>now()-interval '5 minutes')
 then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 n:=jsonb_array_length(coalesce(d.carousel_slides,'[]'::jsonb));
 if n not in (3,4,5,6) or d.content_document->'photo_sourcing' is null
 then raise exception 'STOCK_PHOTO_POLICY_UNSUPPORTED'; end if;
 ai_slot:=case when d.content_document->'photo_sourcing' ? 'ai_image_slot'
  then (d.content_document->'photo_sourcing'->>'ai_image_slot')::integer
  when d.content_document->'photo_sourcing'->>'ai_thumbnail_enabled'='true' then 0
  else null end;
 allowed:=array(select slot from generate_series(0,n-2) as slot
   where slot is distinct from ai_slot order by slot limit (case when n in (4,6) then 5 else 3 end));
 if p_slot is null or p_slot<>all(allowed)
 then raise exception 'PHOTO_SLOT_NOT_AVAILABLE'; end if;
 select * into a from public.marketing_photo_assets where id=p_asset for share;
 if not found or a.review_status<>'approved' or a.reviewed_at is null
   or a.reviewed_by is null or a.license_checked_at is null
   or a.storage_path is null or a.content_sha256 !~ '^[a-f0-9]{64}$'
   or not roundy_private.marketing_photo_rights_valid(a)
 then raise exception 'PHOTO_ASSET_NOT_APPROVED_FOR_REUSE'; end if;
 select asset_id into old_asset from public.marketing_draft_photos
   where draft_id=p_draft and slot=p_slot;
 if old_asset=p_asset then return d; end if;
 if exists(select 1 from public.marketing_draft_photos
   where draft_id=p_draft and asset_id=p_asset and slot<>p_slot)
 then raise exception 'PHOTO_ALREADY_USED_IN_THIS_CAROUSEL'; end if;
 insert into public.marketing_draft_photos(draft_id,asset_id,slot)
  values(p_draft,p_asset,p_slot)
  on conflict(draft_id,slot) do update set asset_id=excluded.asset_id;
 select count(*) into linked_count from public.marketing_draft_photos where draft_id=p_draft;
 if linked_count>(case when n in (4,6) then n-1 else 3 end) then raise exception 'REVIEWED_PHOTO_LIMIT_EXCEEDED'; end if;
 update public.instagram_post_drafts set
   images='{}'::text[],revision=d.revision+1,updated_at=now()
 where id=p_draft and revision=p_revision returning * into d;
 if not found then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 return d;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_marketing_draft_ai_slot(p_draft uuid, p_revision integer, p_ai_slot integer)
 RETURNS instagram_post_drafts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 d public.instagram_post_drafts;
 n integer;
 policy jsonb;
 allowed integer[];
 current_assets uuid[];
 asset uuid;
 i integer:=1;
 v2 boolean;
 required_photos integer;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_draft for update;
 if not found or d.draft_role<>'candidate' or d.status<>'needs_approval'
   or d.imported_at is null or d.visual_source not in ('stock','pexels')
 then raise exception 'STOCK_DRAFT_NOT_EDITABLE'; end if;
 if d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if exists(select 1 from public.marketing_generation_jobs
    where draft_id=p_draft and status='running'
    and created_at>now()-interval '5 minutes')
 then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 n:=jsonb_array_length(coalesce(d.carousel_slides,'[]'::jsonb));
 policy:=d.content_document->'photo_sourcing';
 v2:=d.content_document->>'brand_outro_version'='1' AND n in (4,6);
 if n not in (3,4,5,6) or policy is null or
   (NOT v2 and coalesce((policy->>'min_real_photos')::integer,0)>3)
 then raise exception 'STOCK_PHOTO_POLICY_UNSUPPORTED'; end if;
 if p_ai_slot is not null and (
   n not in (5,6) or p_ai_slot<0 or p_ai_slot >= (case when v2 then n-2 else n-1 end)
   or (NOT v2 and coalesce((policy->>'min_real_photos')::integer,0)>3)
 ) then raise exception 'AI_IMAGE_SLOT_NOT_AVAILABLE'; end if;
 allowed:=array(select slot from generate_series(0,n-2) as slot
   where slot is distinct from p_ai_slot order by slot limit (case when v2 then 5 else 3 end));
 required_photos:=case when v2 then n-1-(case when p_ai_slot is not null then 1 else 0 end) else coalesce((policy->>'min_real_photos')::integer,2) end;
 if cardinality(allowed)<required_photos
 then raise exception 'STOCK_PHOTO_MINIMUM_CANNOT_BE_MET'; end if;
 current_assets:=array(select asset_id from public.marketing_draft_photos
   where draft_id=p_draft order by slot);
 -- Reposition the selected, already reviewed images without reselecting at random.
 delete from public.marketing_draft_photos where draft_id=p_draft;
 foreach asset in array current_assets loop
   if i>cardinality(allowed) then exit; end if;
   insert into public.marketing_draft_photos(draft_id,slot,asset_id)
    values(p_draft,allowed[i],asset);
   i:=i+1;
 end loop;
 policy:=jsonb_set(jsonb_set(jsonb_set(policy,'{ai_image_slot}',coalesce(to_jsonb(p_ai_slot),'null'::jsonb),true),
   '{ai_thumbnail_enabled}',to_jsonb(p_ai_slot is not distinct from 0),true),
   '{requested_ai_thumbnail}',to_jsonb(p_ai_slot is not distinct from 0),true);
 if v2 then policy:=jsonb_set(policy,'{min_real_photos}',to_jsonb(required_photos),true); end if;
 update public.instagram_post_drafts set
   content_document=jsonb_set(d.content_document,'{photo_sourcing}',policy,true),
   images='{}'::text[],revision=d.revision+1,updated_at=now()
 where id=p_draft and revision=p_revision returning * into d;
 if not found then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 return d;
end;
$function$

CREATE OR REPLACE FUNCTION public.guard_marketing_stock_photo_publication()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 selected_count integer;
 invalid_count integer;
 story_count integer;
 ai_slot integer;
 expected_photos integer;
begin
 if new.visual_source in ('pexels','stock')
  and new.status in ('approved','scheduled','publishing','published')
  and (tg_op='INSERT' or new.status is distinct from old.status) then
  select count(*), count(*) filter (
   where a.id is null or a.review_status is distinct from 'approved'
    or a.reviewed_by is null or a.reviewed_at is null
    or a.storage_path is null or a.content_sha256 is null
    or not roundy_private.marketing_photo_rights_valid(a)
  ) into selected_count, invalid_count
  from public.marketing_draft_photos p
  left join public.marketing_photo_assets a on a.id=p.asset_id
  where p.draft_id=new.id;
  if new.content_document->>'brand_outro_version'='1' then
    story_count:=jsonb_array_length(coalesce(new.carousel_slides,'[]'::jsonb))-1;
    ai_slot:=nullif(new.content_document->'photo_sourcing'->>'ai_image_slot','')::integer;
    expected_photos:=story_count-(case when ai_slot is null then 0 else 1 end);
    if story_count not in (3,5) or coalesce(array_length(new.images,1),0)<>story_count+1
      or new.carousel_slides->story_count->>'role' is distinct from 'brand_outro'
      or selected_count<>expected_photos or invalid_count<>0
      or exists(
        select 1 from generate_series(0,story_count-1) s
        where (ai_slot is null or s<>ai_slot) and not exists(
          select 1 from public.marketing_draft_photos p
          where p.draft_id=new.id and p.slot=s
        )
      ) or exists(
        select 1 from public.marketing_draft_photos p
        where p.draft_id=new.id and (p.slot>=story_count or p.slot=ai_slot)
      )
    then raise exception 'STOCK_PHOTOS_NOT_APPROVED_OR_RENDERED'; end if;
  elsif selected_count<2 or selected_count>3 or invalid_count<>0
   or coalesce(array_length(new.images,1),0)<2 then
   raise exception 'STOCK_PHOTOS_NOT_APPROVED_OR_RENDERED';
  end if;
 end if;
 return new;
end $function$

CREATE OR REPLACE FUNCTION roundy_private.guard_marketing_preflight_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 d public.instagram_post_drafts;
 did uuid;
 pf jsonb;
 actual_manifest jsonb;
 config public.marketing_automation_settings;
 expected_count integer;
 minimum_photos integer;
 invalid_photos integer;
 branded boolean;
 story_count integer;
 ai_slot integer;
 expected_photos integer;
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
 branded:=d.content_document->>'brand_outro_version'='1';
 story_count:=expected_count-(case when branded then 1 else 0 end);
 ai_slot:=nullif(d.content_document->'photo_sourcing'->>'ai_image_slot','')::integer;
 expected_photos:=story_count-(case when branded and ai_slot is not null then 1 else 0 end);
 if story_count not in (3,5)
  or coalesce(jsonb_array_length(d.carousel_slides),0)<>expected_count
  or coalesce(cardinality(d.images),0)<>expected_count
  or d.content_document->'carousel_template' is null
  or (d.content_document->'carousel_template'->>'slide_count')::integer<>story_count
  or d.content_document->>'answer_first' is distinct from 'true'
  or d.content_document->>'thumbnail_render_pending' is distinct from 'false'
  or (
    case when branded then
      d.content_document->>'design_preset' is distinct from 'roundy_magazine_editorial_v2'
      or d.carousel_slides->(expected_count-1)->>'role' is distinct from 'brand_outro'
      or d.carousel_slides->(expected_count-2)->>'role' is distinct from 'editorial_closing'
      or not coalesce((d.carousel_slides->(expected_count-2)->>'closing_type') in ('summary','insight','brand_outro'),false)
      or coalesce(d.cta,'') <> ''
      or not (pf->'checks' @> '[{"id":"editorial_closing","passed":true}]'::jsonb)
      or (pf->'checks' @> '[{"id":"final_cta"}]'::jsonb)
      or d.carousel_slides->0->>'role' is distinct from 'cover'
      or (story_count=3 and d.carousel_slides->1->>'role' is distinct from 'key_insight')
      or (story_count=5 and (
        d.carousel_slides->1->>'role' is distinct from 'context'
        or d.carousel_slides->2->>'role' is distinct from 'insight'
        or d.carousel_slides->3->>'role' is distinct from 'insight'
      ))
    when d.content_document->>'design_preset'='roundy_magazine_editorial_v2' then
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
  coalesce(case when story_count=3 then config.carousel_min_real_photos_3 else config.carousel_min_real_photos_5 end,3),
  coalesce((pf->>'min_real_photos')::integer,0),
  case when branded then expected_photos else 0 end
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
  or (branded and (
    jsonb_array_length(actual_manifest)<>expected_photos
    or exists(select 1 from generate_series(0,story_count-1) s
      where (ai_slot is null or s<>ai_slot) and not exists(
        select 1 from public.marketing_draft_photos p where p.draft_id=d.id and p.slot=s
      ))
    or exists(select 1 from public.marketing_draft_photos p
      where p.draft_id=d.id and (p.slot>=story_count or p.slot=ai_slot))
  ))
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
end $function$

commit;
