begin;

create or replace function public.wis_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.wis_user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.wis_is_admin() from public, anon;
grant execute on function public.wis_is_admin() to authenticated;

drop policy wis_events_admin_read on public.wis_events;
drop policy wis_events_admin_insert on public.wis_events;
drop policy wis_events_admin_update on public.wis_events;
drop policy wis_events_admin_delete on public.wis_events;

create policy wis_events_admin_read on public.wis_events for select to authenticated
using ((select public.wis_is_admin()));
create policy wis_events_admin_insert on public.wis_events for insert to authenticated
with check ((select public.wis_is_admin()));
create policy wis_events_admin_update on public.wis_events for update to authenticated
using ((select public.wis_is_admin())) with check ((select public.wis_is_admin()));
create policy wis_events_admin_delete on public.wis_events for delete to authenticated
using ((select public.wis_is_admin()));

commit;
