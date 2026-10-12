-- Stage 5. Additive observed-metric metadata and account-scoped audience breakdown.
-- No historical measurement, approved content or publishing record is rewritten.
begin;
alter table public.instagram_post_insights
  add column if not exists media_follows integer check (media_follows is null or media_follows>=0),
  add column if not exists media_profile_visits integer check (media_profile_visits is null or media_profile_visits>=0),
  add column if not exists metric_availability jsonb not null default '{}'::jsonb
   check (jsonb_typeof(metric_availability)='object');

create table if not exists public.instagram_audience_reach_snapshots (
 snapshot_date date primary key,
 status text not null check(status in ('captured','unavailable')),
 reached_followers integer check(reached_followers is null or reached_followers>=0),
 reached_nonfollowers integer check(reached_nonfollowers is null or reached_nonfollowers>=0),
 total_reach integer check(total_reach is null or total_reach>=0),
 source text not null default 'instagram_account_insights' check (source='instagram_account_insights'),
 error_code text check(error_code is null or length(error_code)<=100),
 attempted_at timestamptz not null default now(),
 captured_at timestamptz,
 constraint instagram_audience_complete check (
  (status='captured' and reached_followers is not null and reached_nonfollowers is not null
   and total_reach is not null and captured_at is not null and error_code is null)
  or
  (status='unavailable' and reached_followers is null and reached_nonfollowers is null
   and total_reach is null and captured_at is null)
 )
);
create index if not exists instagram_audience_reach_date_idx
 on public.instagram_audience_reach_snapshots(snapshot_date desc);
alter table public.instagram_audience_reach_snapshots enable row level security;
revoke all on public.instagram_audience_reach_snapshots from public,anon,authenticated;
grant select,insert,update,delete on public.instagram_audience_reach_snapshots to service_role;
grant select on public.instagram_audience_reach_snapshots to authenticated;
drop policy if exists instagram_audience_reach_admin_read on public.instagram_audience_reach_snapshots;
create policy instagram_audience_reach_admin_read
 on public.instagram_audience_reach_snapshots for select to authenticated
 using ((select public.is_admin()));
comment on table public.instagram_audience_reach_snapshots is
 'Account-level daily audience reach by follow_type when Meta makes this breakdown available; NEVER per-post non-follower reach.';
comment on column public.instagram_post_insights.media_follows is
 'Optional Meta media-level follows, only populated when official media insights API responds. Not inferred from account snapshots.';
comment on column public.instagram_post_insights.metric_availability is
 'Flags for actually observed official Meta metrics. Historical rows default to {}, so absence is never silently treated as zero.';
commit;
