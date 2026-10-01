begin;

-- Older accounts predate the insert trigger above. Queue their welcome lazily
-- when they first open the inbox, rather than turning a deployment into a bulk
-- marketing send.
create or replace function roundy_private.ensure_roundy_welcome_notification(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from public.members where id=p_user and deleted_at is null) then
    return false;
  end if;

  insert into public.roundy_notification_deliveries(user_id,kind)
  values(p_user,'welcome')
  on conflict(user_id,kind) do nothing;
  return true;
end;
$$;

create or replace function public.service_ensure_roundy_welcome_notification(p_user uuid)
returns boolean
language sql
security definer
set search_path=''
as $$
  select roundy_private.ensure_roundy_welcome_notification(p_user);
$$;

revoke all on function roundy_private.ensure_roundy_welcome_notification(uuid),
  public.service_ensure_roundy_welcome_notification(uuid)
  from public,anon,authenticated;

grant execute on function public.service_ensure_roundy_welcome_notification(uuid) to service_role;

commit;
