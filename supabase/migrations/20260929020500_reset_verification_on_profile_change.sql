begin;

create or replace function roundy_private.reset_verification_on_profile_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.profile is distinct from old.profile then
    update public.verifications
    set status='Reviewing',
        rejection_reason='',
        updated_at=now()
    where user_id=new.user_id
      and status='Verified';
  end if;
  return new;
end;
$$;

revoke all on function roundy_private.reset_verification_on_profile_change() from public,anon,authenticated;

drop trigger if exists reset_verification_on_profile_change on public.profiles;
create trigger reset_verification_on_profile_change
after update of profile on public.profiles
for each row
when (old.profile is distinct from new.profile)
execute function roundy_private.reset_verification_on_profile_change();

commit;
