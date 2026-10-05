alter table public.marketing_generation_jobs
  add column if not exists generation_thread_id uuid references public.marketing_generation_jobs(id) on delete set null,
  add column if not exists attempt_number integer;

alter table public.marketing_generation_jobs
  drop constraint if exists marketing_generation_jobs_attempt_number_check;

alter table public.marketing_generation_jobs
  add constraint marketing_generation_jobs_attempt_number_check
  check (attempt_number is null or attempt_number >= 1);

with ranked as (
  select
    id,
    first_value(id) over (partition by draft_id,fingerprint order by created_at asc,id asc) as root_id,
    row_number() over (partition by draft_id,fingerprint order by created_at asc,id asc)::integer as attempt_no
  from public.marketing_generation_jobs
)
update public.marketing_generation_jobs j
set generation_thread_id=r.root_id,
    attempt_number=r.attempt_no
from ranked r
where j.id=r.id
  and (j.generation_thread_id is null or j.attempt_number is null);

create index if not exists marketing_generation_jobs_thread_created
  on public.marketing_generation_jobs(generation_thread_id,created_at);

create unique index if not exists marketing_generation_jobs_thread_attempt_unique
  on public.marketing_generation_jobs(generation_thread_id,attempt_number)
  where generation_thread_id is not null and attempt_number is not null;
