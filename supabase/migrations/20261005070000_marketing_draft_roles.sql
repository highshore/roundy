alter table public.instagram_post_drafts
  add column if not exists draft_role text not null default 'workspace',
  add column if not exists source_generation_job_id uuid references public.marketing_generation_jobs(id) on delete set null,
  add column if not exists imported_at timestamptz;

alter table public.instagram_post_drafts
  drop constraint if exists instagram_post_drafts_draft_role_check;

alter table public.instagram_post_drafts
  add constraint instagram_post_drafts_draft_role_check
  check (draft_role in ('workspace','candidate'));

update public.instagram_post_drafts
set draft_role='workspace'
where draft_role is distinct from 'workspace'
  and source_generation_job_id is null;

create index if not exists instagram_post_drafts_role_status_idx
  on public.instagram_post_drafts(draft_role,status,imported_at desc,updated_at desc);
