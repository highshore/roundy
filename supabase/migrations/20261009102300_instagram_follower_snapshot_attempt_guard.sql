create table if not exists public.instagram_follower_snapshot_attempts (
 snapshot_date date primary key,
 status text not null default 'started' check (status in ('started','captured','unavailable')),
 attempted_at timestamptz not null default now(),
 error_code text check (length(error_code) <= 100)
);
alter table public.instagram_follower_snapshot_attempts enable row level security;
revoke all on public.instagram_follower_snapshot_attempts from public,anon,authenticated;
grant all on public.instagram_follower_snapshot_attempts to service_role;
