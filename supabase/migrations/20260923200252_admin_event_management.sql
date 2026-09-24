begin;

create table public.wis_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'host', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wis_user_roles enable row level security;
revoke all on table public.wis_user_roles from public, anon, authenticated;

create function wis_private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.wis_user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create function public.wis_is_admin()
returns boolean language sql security invoker set search_path = '' as $$
  select wis_private.is_admin();
$$;

revoke all on function wis_private.is_admin() from public, anon, authenticated;
revoke all on function public.wis_is_admin() from public, anon;
grant execute on function public.wis_is_admin() to authenticated;

alter table public.wis_events
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

create function wis_private.touch_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger wis_events_touch_updated_at
before update on public.wis_events
for each row execute function wis_private.touch_event();

create policy wis_events_admin_read on public.wis_events for select to authenticated
using ((select wis_private.is_admin()));
create policy wis_events_admin_insert on public.wis_events for insert to authenticated
with check ((select wis_private.is_admin()));
create policy wis_events_admin_update on public.wis_events for update to authenticated
using ((select wis_private.is_admin())) with check ((select wis_private.is_admin()));
create policy wis_events_admin_delete on public.wis_events for delete to authenticated
using ((select wis_private.is_admin()));

insert into public.wis_user_roles(user_id, role)
select u.id, 'admin' from auth.users u
where lower(to_jsonb(u)->>'email') = lower('highshore2378skk@gmail.com')
on conflict (user_id) do update
set role = excluded.role, updated_at = now();

commit;
