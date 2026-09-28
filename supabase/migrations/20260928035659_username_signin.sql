-- Login aliases contain no email addresses and are never exposed to clients.
create table public.account_usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_][a-z0-9_-]{2,29}$'),
  created_at timestamptz not null default now()
);
alter table public.account_usernames enable row level security;
revoke all on public.account_usernames from public, anon, authenticated;
grant select, insert, update, delete on public.account_usernames to service_role;

create or replace function roundy_private.register_username()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_username text := lower(trim(new.raw_user_meta_data->>'username'));
begin
  if v_username is null or v_username = '' then return new; end if;
  if v_username !~ '^[a-z0-9_][a-z0-9_-]{2,29}$' then
    raise exception 'Invalid username';
  end if;
  insert into public.account_usernames(user_id,username) values(new.id,v_username);
  return new;
end;
$$;
revoke all on function roundy_private.register_username() from public,anon,authenticated;
create trigger roundy_register_username after insert on auth.users
for each row execute function roundy_private.register_username();

-- Only the login edge function can consume this atomic rate-limit budget.
create table public.username_login_attempts (
  key_hash text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
alter table public.username_login_attempts enable row level security;
revoke all on public.username_login_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.username_login_attempts to service_role;
create or replace function public.consume_username_login_attempt(p_key text,p_limit integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_attempts integer;
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 30 then return false; end if;
  delete from public.username_login_attempts where expires_at < now() - interval '1 day';
  insert into public.username_login_attempts(key_hash,attempts,expires_at)
  values(p_key,1,now()+interval '1 minute')
  on conflict(key_hash) do update set
    attempts = case when public.username_login_attempts.expires_at <= now() then 1 else public.username_login_attempts.attempts+1 end,
    expires_at = case when public.username_login_attempts.expires_at <= now() then now()+interval '1 minute' else public.username_login_attempts.expires_at end
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end;
$$;
revoke all on function public.consume_username_login_attempt(text,integer) from public,anon,authenticated;
grant execute on function public.consume_username_login_attempt(text,integer) to service_role;
