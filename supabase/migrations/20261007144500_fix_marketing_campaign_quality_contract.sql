-- Align pre-launch and live-event campaign payloads with the marketing quality-v2 database contract.
-- Existing v1 campaign documents contain the same fields; only the contract marker changes.

update public.marketing_generation_jobs
set quality_report = jsonb_set(quality_report,'{version}','2'::jsonb,true)
where quality_report->>'version'='1'
  and quality_report->>'status' in ('passed','rejected')
  and jsonb_typeof(quality_report->'issues')='array';

update public.marketing_generation_jobs
set result_snapshot = jsonb_set(
  jsonb_set(result_snapshot,'{content_document,schema_version}','2'::jsonb,true),
  '{quality_report,version}','2'::jsonb,true
)
where jsonb_typeof(result_snapshot)='object'
  and result_snapshot->'content_document'->>'schema_version'='1'
  and result_snapshot->'content_document'->>'design_preset' in ('roundy_prelaunch_campaign_v1','roundy_live_event_campaign_v1');

update public.instagram_post_drafts
set content_document = jsonb_set(content_document,'{schema_version}','2'::jsonb,true)
where content_document->>'schema_version'='1'
  and content_document->>'design_preset' in ('roundy_prelaunch_campaign_v1','roundy_live_event_campaign_v1');

-- Recover only the deterministic failures caused by the v1/v2 mismatch when the just-generated
-- draft is still current and the saved quality report already passed with zero issues.
with recoverable as (
  select distinct on (j.draft_id)
    j.id as job_id,
    j.draft_id,
    j.quality_report
  from public.marketing_generation_jobs j
  join public.instagram_post_drafts d on d.id=j.draft_id
  where j.status='failed'
    and j.error_message='INVALID_QUALITY_REPORT'
    and j.quality_report->>'status'='passed'
    and jsonb_typeof(j.quality_report->'issues')='array'
    and jsonb_array_length(j.quality_report->'issues')=0
    and d.status='needs_approval'
    and d.regenerated_at is not null
    and d.regenerated_at between j.created_at and j.updated_at + interval '5 seconds'
    and not exists (
      select 1 from public.marketing_generation_jobs newer
      where newer.draft_id=j.draft_id and newer.created_at>j.created_at
    )
  order by j.draft_id,j.updated_at desc
)
update public.instagram_post_drafts d
set quality_report=r.quality_report,
    quality_revision=d.revision
from recoverable r
where d.id=r.draft_id;

with recoverable as (
  select j.id as job_id,d.*
  from public.marketing_generation_jobs j
  join public.instagram_post_drafts d on d.id=j.draft_id
  where j.status='failed'
    and j.error_message='INVALID_QUALITY_REPORT'
    and d.quality_report->>'status'='passed'
    and d.quality_report->>'version'='2'
    and d.quality_revision=d.revision
    and d.regenerated_at is not null
    and d.regenerated_at between j.created_at and j.updated_at + interval '5 seconds'
    and not exists (
      select 1 from public.marketing_generation_jobs newer
      where newer.draft_id=j.draft_id and newer.created_at>j.created_at
    )
)
update public.marketing_generation_jobs j
set status='completed',
    stage='complete',
    error_code=null,
    error_message=null,
    result_revision=r.revision,
    result_snapshot=(to_jsonb(r)-'job_id') || jsonb_build_object('saved_at',now(),'quality_revision',r.revision),
    updated_at=now()
from recoverable r
where j.id=r.job_id;
