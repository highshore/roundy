alter table public.marketing_generation_jobs
  add column if not exists request_payload jsonb,
  add column if not exists retry_of_job_id uuid references public.marketing_generation_jobs(id) on delete set null;

alter table public.marketing_generation_jobs
  drop constraint if exists marketing_generation_jobs_request_payload_object_check;

alter table public.marketing_generation_jobs
  add constraint marketing_generation_jobs_request_payload_object_check
  check (request_payload is null or jsonb_typeof(request_payload)='object');

create index if not exists marketing_generation_jobs_retry_of
  on public.marketing_generation_jobs(retry_of_job_id)
  where retry_of_job_id is not null;
