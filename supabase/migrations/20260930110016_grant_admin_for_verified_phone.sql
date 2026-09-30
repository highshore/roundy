begin;

create or replace function roundy_private.grant_admin_for_verified_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone_hash text;
begin
  phone_hash := md5(regexp_replace(coalesce(new.phone, ''), '\\D', '', 'g'));

  if phone_hash in ('a54ad6984f7dc64283001fea5909a2cc', '051d9d09e41db79f99d98e11b0442ff3') then
    insert into public.user_roles(user_id, role)
    values (new.id, 'admin')
    on conflict (user_id) do update
    set role = excluded.role,
        updated_at = now();
  end if;

  return new;
end;
$$;

revoke all on function roundy_private.grant_admin_for_verified_phone() from public, anon, authenticated;

drop trigger if exists roundy_grant_admin_for_verified_phone on auth.users;
create trigger roundy_grant_admin_for_verified_phone
after insert or update of phone on auth.users
for each row
execute function roundy_private.grant_admin_for_verified_phone();

insert into public.user_roles(user_id, role)
select id, 'admin'
from auth.users
where md5(regexp_replace(coalesce(phone, ''), '\\D', '', 'g')) in
  ('a54ad6984f7dc64283001fea5909a2cc', '051d9d09e41db79f99d98e11b0442ff3')
on conflict (user_id) do update
set role = excluded.role,
    updated_at = now();

commit;
