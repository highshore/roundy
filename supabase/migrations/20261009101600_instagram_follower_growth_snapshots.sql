create table if not exists public.instagram_follower_snapshots (
 snapshot_date date primary key,
 followers_count integer not null check (followers_count >= 0),
 captured_at timestamptz not null default now(),
 source text not null default 'instagram_profile' check (source = 'instagram_profile')
);
alter table public.instagram_follower_snapshots enable row level security;
revoke all on public.instagram_follower_snapshots from public,anon,authenticated;
grant select on public.instagram_follower_snapshots to authenticated;
grant all on public.instagram_follower_snapshots to service_role;
drop policy if exists instagram_follower_snapshots_admin_read on public.instagram_follower_snapshots;
create policy instagram_follower_snapshots_admin_read on public.instagram_follower_snapshots
 for select to authenticated using ((select public.is_admin()));
