begin;

create policy wis_user_roles_read_self on public.wis_user_roles for select to authenticated
using (user_id = (select auth.uid()));
grant select on public.wis_user_roles to authenticated;

create or replace function public.wis_is_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(
    select 1 from public.wis_user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.wis_is_admin() from public, anon;
grant execute on function public.wis_is_admin() to authenticated;

commit;
