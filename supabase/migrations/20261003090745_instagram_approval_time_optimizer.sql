begin;

alter table public.marketing_automation_settings
  add column if not exists draft_generation_time_kst time not null default '10:00',
  add column if not exists optimization_enabled boolean not null default true;

create table if not exists public.instagram_post_drafts(
  id uuid primary key default gen_random_uuid(),
  draft_date date not null unique,
  event_id uuid references public.events(id) on delete set null,
  content_pillar text not null check(content_pillar in('event','urgency','problem','concept','seoul','trust')),
  caption text not null default '' check(length(caption)<=2000),
  cta text not null default 'See event details' check(length(cta)<=80),
  destination_url text not null default '' check(destination_url='' or destination_url ~ '^https://'),
  images text[] not null default '{}' check(cardinality(images)<=10),
  status text not null default 'needs_approval'
    check(status in('needs_approval','approved','scheduled','published','skipped','rejected','failed')),
  generation_reason text not null default '' check(length(generation_reason)<=1000),
  recommended_time_kst time not null,
  window_start_kst time not null,
  window_end_kst time not null,
  scheduled_for timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  marketing_run_id uuid references public.marketing_runs(id) on delete set null,
  eligible_for_optimization boolean not null default true,
  revision integer not null default 1 check(revision between 1 and 100),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists instagram_post_drafts_status_idx
  on public.instagram_post_drafts(status,draft_date desc);

create table if not exists public.instagram_post_insights(
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.marketing_runs(id) on delete cascade,
  horizon_hours smallint not null check(horizon_hours in(24,72)),
  source text not null check(source in('insights','basic')),
  published_dow smallint not null check(published_dow between 0 and 6),
  published_minute integer not null check(published_minute between 0 and 1439),
  views integer,
  reach integer,
  likes integer not null default 0 check(likes>=0),
  comments integer not null default 0 check(comments>=0),
  saves integer not null default 0 check(saves>=0),
  shares integer not null default 0 check(shares>=0),
  total_interactions integer not null default 0 check(total_interactions>=0),
  performance_score numeric not null default 0,
  captured_at timestamptz not null default now(),
  unique(run_id,horizon_hours)
);
create index if not exists instagram_post_insights_time_idx
  on public.instagram_post_insights(published_dow,published_minute,horizon_hours);

create table if not exists public.instagram_posting_time_recommendations(
  dow smallint primary key check(dow between 0 and 6),
  recommended_time_kst time not null,
  window_start_kst time not null,
  window_end_kst time not null,
  sample_size integer not null default 0 check(sample_size>=0),
  score numeric not null default 0,
  source text not null default 'benchmark' check(source in('benchmark','benchmark+learning','learned')),
  rationale text not null default '' check(length(rationale)<=1000),
  updated_at timestamptz not null default now()
);

insert into public.instagram_posting_time_recommendations
  (dow,recommended_time_kst,window_start_kst,window_end_kst,source,rationale)
values
  (0,'21:00','20:30','21:30','benchmark','Initial Sunday benchmark; will adapt using Roundy post performance.'),
  (1,'19:00','18:30','19:30','benchmark','Initial Monday benchmark; will adapt using Roundy post performance.'),
  (2,'19:00','18:30','19:30','benchmark','Initial Tuesday benchmark; will adapt using Roundy post performance.'),
  (3,'18:00','17:30','18:30','benchmark','Initial Wednesday benchmark; will adapt using Roundy post performance.'),
  (4,'12:30','12:00','13:00','benchmark','Initial Thursday benchmark; will adapt using Roundy post performance.'),
  (5,'21:00','20:30','21:30','benchmark','Initial Friday benchmark; will adapt using Roundy post performance.'),
  (6,'21:00','20:30','21:30','benchmark','Initial Saturday benchmark; will adapt using Roundy post performance.')
on conflict(dow) do nothing;

alter table public.instagram_post_drafts enable row level security;
alter table public.instagram_post_insights enable row level security;
alter table public.instagram_posting_time_recommendations enable row level security;

revoke all on public.instagram_post_drafts,public.instagram_post_insights,public.instagram_posting_time_recommendations
from public,anon,authenticated;

grant select,update on public.instagram_post_drafts to authenticated;
grant select on public.instagram_post_insights,public.instagram_posting_time_recommendations to authenticated;
grant all on public.instagram_post_drafts,public.instagram_post_insights,public.instagram_posting_time_recommendations to service_role;

create policy instagram_post_drafts_admin_read
on public.instagram_post_drafts for select to authenticated
using((select public.is_admin()));

create policy instagram_post_drafts_admin_update
on public.instagram_post_drafts for update to authenticated
using((select public.is_admin()))
with check((select public.is_admin()));

create policy instagram_post_insights_admin_read
on public.instagram_post_insights for select to authenticated
using((select public.is_admin()));

create policy instagram_time_recommendations_admin_read
on public.instagram_posting_time_recommendations for select to authenticated
using((select public.is_admin()));

create or replace function roundy_private.touch_instagram_post_draft()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function roundy_private.touch_instagram_post_draft() from public,anon,authenticated;

drop trigger if exists touch_instagram_post_draft on public.instagram_post_drafts;
create trigger touch_instagram_post_draft
before update on public.instagram_post_drafts
for each row execute function roundy_private.touch_instagram_post_draft();

create or replace function roundy_private.dispatch_marketing()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  config roundy_private.reminder_scheduler_config;
  scheduler_secret text;
  local_now timestamp:=now() at time zone 'Asia/Seoul';
begin
  if not exists(select 1 from public.marketing_templates where enabled)
     and not exists(select 1 from public.marketing_runs where status='queued' and scheduled_for<=now())
     and not exists(
       select 1
       from public.marketing_automation_settings s
       where s.singleton
         and s.daily_instagram_enabled
         and local_now::time>=s.draft_generation_time_kst
         and not exists(
           select 1 from public.instagram_post_drafts d
           where d.draft_date=local_now::date
         )
     )
     and not exists(
       select 1
       from public.marketing_runs r
       where r.channel='instagram'
         and r.status='sent'
         and r.external_id is not null
         and r.finished_at is not null
         and r.finished_at>now()-interval '4 days'
         and (
           (r.finished_at<=now()-interval '24 hours' and not exists(
             select 1 from public.instagram_post_insights i where i.run_id=r.id and i.horizon_hours=24
           ))
           or
           (r.finished_at<=now()-interval '72 hours' and not exists(
             select 1 from public.instagram_post_insights i where i.run_id=r.id and i.horizon_hours=72
           ))
         )
     )
  then return; end if;

  select * into config from roundy_private.reminder_scheduler_config where singleton;
  select secret into scheduler_secret from roundy_private.marketing_scheduler_config where singleton;
  if config.project_url is null or scheduler_secret is null then return; end if;

  perform net.http_post(
    url:=config.project_url||'/functions/v1/roundy-marketing',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||config.anon_jwt,
      'x-marketing-secret',scheduler_secret
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=140000
  );
end;
$$;
revoke all on function roundy_private.dispatch_marketing() from public,anon,authenticated;

commit;
