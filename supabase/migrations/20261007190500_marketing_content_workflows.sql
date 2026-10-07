alter table public.marketing_generation_jobs
  add column if not exists content_workflow_id uuid
  references public.marketing_generation_jobs(id) on delete set null;

create index if not exists marketing_generation_jobs_content_workflow_created
  on public.marketing_generation_jobs(content_workflow_id,created_at);

update public.marketing_generation_jobs
set content_workflow_id=coalesce(content_workflow_id,generation_thread_id,id)
where content_workflow_id is null;

with imported_candidates as (
  select
    d.id as draft_id,
    coalesce(source.content_workflow_id,source.generation_thread_id,source.id) as workflow_id
  from public.instagram_post_drafts d
  join public.marketing_generation_jobs source
    on source.id=d.source_generation_job_id
  where d.source_generation_job_id is not null
)
update public.marketing_generation_jobs j
set content_workflow_id=i.workflow_id
from imported_candidates i
where j.draft_id=i.draft_id
  and j.content_workflow_id is distinct from i.workflow_id;

comment on column public.marketing_generation_jobs.content_workflow_id is
  'Groups copy/research, image generation/rendering, and retries that belong to one user-facing content creation workflow.';
