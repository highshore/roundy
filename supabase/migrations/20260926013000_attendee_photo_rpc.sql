begin;

create or replace function public.can_view_attendee_photo(p_member uuid)
returns boolean
language sql
security invoker
set search_path=''
as $$
  select roundy_private.can_view_attendee_photo(p_member);
$$;

revoke all on function public.can_view_attendee_photo(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.can_view_attendee_photo(uuid)
to authenticated,service_role;

commit;
