-- Additive multi-provider photo sourcing. Keep previous approvals, archives and
-- scheduled/published Instagram runs untouched. New photos remain pending.
begin;
alter table public.instagram_post_drafts
 drop constraint if exists instagram_post_drafts_visual_source_check;
alter table public.instagram_post_drafts
 add constraint instagram_post_drafts_visual_source_check
 check (visual_source in ('auto_ai','uploaded','none','pexels','stock'));
alter table public.marketing_photo_assets
 drop constraint if exists marketing_photo_provider_check;
alter table public.marketing_photo_assets
 add constraint marketing_photo_provider_check
 check (provider in ('pexels','unsplash','pixabay','wikimedia','openverse'));
alter table public.marketing_photo_assets
 drop constraint if exists marketing_photo_provider_id_check;
alter table public.marketing_photo_assets
 add constraint marketing_photo_provider_id_check
 check (provider_photo_id ~ '^[a-zA-Z0-9_-]{1,100}$');

alter table public.marketing_photo_assets
 add column if not exists license_evidence_url text,
 add column if not exists commercial_use_allowed boolean not null default false,
 add column if not exists modifications_allowed boolean not null default false,
 add column if not exists attribution_required boolean not null default false,
 add column if not exists search_query text,
 add column if not exists download_tracking_url text;
-- Backfill historical Pexels provenance; never reset or re-approve an asset.
update public.marketing_photo_assets
 set license_evidence_url=source_url,
     commercial_use_allowed=true,
     modifications_allowed=true,
     attribution_required=false
 where provider='pexels' and license_name='Pexels License'
   and license_url='https://www.pexels.com/license/'
   and license_evidence_url is null;

create table if not exists public.marketing_photo_source_attempts (
 id uuid primary key default gen_random_uuid(),
 draft_id uuid not null references public.instagram_post_drafts(id) on delete cascade,
 provider text not null check (provider in ('pexels','unsplash','pixabay','wikimedia','openverse')),
 search_query text not null check (length(search_query) <= 200),
 status text not null check (status in ('skipped','found','empty','failed')),
 error_code text not null default '',
 result_count integer not null default 0 check (result_count between 0 and 50),
 created_at timestamptz not null default now()
);
create index if not exists marketing_photo_source_attempts_draft_idx
 on public.marketing_photo_source_attempts(draft_id,created_at desc);
create index if not exists marketing_photo_source_attempts_recent_idx
 on public.marketing_photo_source_attempts(created_at desc);
alter table public.marketing_photo_source_attempts enable row level security;
revoke all on public.marketing_photo_source_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_photo_source_attempts to service_role;

-- Never infer rights from an Openverse hit or any arbitrary image URL.
-- Source provenance and recognized grants must both match the provider.
create or replace function roundy_private.marketing_photo_rights_valid(p public.marketing_photo_assets)
returns boolean language sql stable security invoker set search_path='' as $$
 select p.id is not null
  and p.provider in ('pexels','unsplash','pixabay','wikimedia','openverse')
  and coalesce(p.commercial_use_allowed,false)
  and coalesce(p.modifications_allowed,false)
  and p.license_checked_at is not null
  and nullif(trim(p.photographer),'') is not null
  and p.license_evidence_url = p.source_url
  and p.source_url like 'https://%'
  and p.image_url like 'https://%'
  and (
   (p.provider='pexels'
    and p.source_url like 'https://www.pexels.com/photo/%'
    and p.image_url like 'https://images.pexels.com/photos/%'
    and p.photographer_url like 'https://www.pexels.com/%'
    and p.license_name='Pexels License'
    and p.license_url='https://www.pexels.com/license/'
    and p.attribution_required=false)
   or (p.provider='unsplash'
    and p.source_url like 'https://unsplash.com/photos/%'
    and p.image_url like 'https://images.unsplash.com/photo-%'
    and p.photographer_url like 'https://unsplash.com/%'
    and p.license_name='Unsplash License'
    and p.license_url='https://unsplash.com/license'
    and p.attribution_required=false)
   or (p.provider='pixabay'
    and p.source_url like 'https://pixabay.com/photos/%'
    and (p.image_url like 'https://cdn.pixabay.com/photo/%' or p.image_url like 'https://pixabay.com/get/%')
    and p.photographer_url like 'https://pixabay.com/users/%'
    and p.license_name='Pixabay Content License'
    and p.license_url='https://pixabay.com/service/license-summary/'
    and p.attribution_required=false)
   or (p.provider in ('wikimedia','openverse')
    and p.source_url like 'https://commons.wikimedia.org/wiki/File:%'
    and p.image_url like 'https://upload.wikimedia.org/wikipedia/%'
    and p.photographer_url like 'https://commons.wikimedia.org/wiki/File:%'
    and (
     (p.license_name='CC0 1.0'
      and p.license_url='https://creativecommons.org/publicdomain/zero/1.0/'
      and p.attribution_required=false)
     or (p.license_name='Public Domain Mark 1.0'
      and p.license_url='https://creativecommons.org/publicdomain/mark/1.0/'
      and p.attribution_required=false)
     or (p.license_name='CC BY 4.0'
      and p.license_url='https://creativecommons.org/licenses/by/4.0/'
      and p.attribution_required=true)
    ))
  );
$$;
revoke all on function roundy_private.marketing_photo_rights_valid(public.marketing_photo_assets)
 from public,anon,authenticated;
grant execute on function roundy_private.marketing_photo_rights_valid(public.marketing_photo_assets)
 to service_role;

create or replace function public.guard_marketing_stock_photo_publication()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 selected_count integer;
 invalid_count integer;
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
  if selected_count<2 or selected_count>3 or invalid_count<>0
   or coalesce(array_length(new.images,1),0)<2 then
   raise exception 'STOCK_PHOTOS_NOT_APPROVED_OR_RENDERED';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_marketing_stock_photo_publication()
 from public,anon,authenticated;

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
  or d.carousel_slides->(expected_count-1)->>'role' is distinct from 'cta'
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

comment on table public.marketing_photo_assets is
 'Roundy multi-provider photo evidence, human approval and immutable archives. Prior Pexels approvals preserved.';
comment on table public.marketing_photo_source_attempts is
 'Bounded source search diagnostics; admin service role access only.';
commit;
