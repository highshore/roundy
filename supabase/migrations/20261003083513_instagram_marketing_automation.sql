begin;

create table public.marketing_automation_settings(
  singleton boolean primary key default true check(singleton),
  daily_instagram_enabled boolean not null default true,
  daily_time_kst time not null default '20:00',
  auto_reply_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.marketing_automation_settings default values
on conflict(singleton) do nothing;

alter table public.marketing_automation_settings enable row level security;
revoke all on public.marketing_automation_settings from public,anon,authenticated;
grant select,update on public.marketing_automation_settings to authenticated;
grant all on public.marketing_automation_settings to service_role;

create policy marketing_automation_admin_read
on public.marketing_automation_settings for select to authenticated
using((select public.is_admin()));

create policy marketing_automation_admin_update
on public.marketing_automation_settings for update to authenticated
using((select public.is_admin()))
with check((select public.is_admin()));

create function roundy_private.touch_marketing_automation_settings()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function roundy_private.touch_marketing_automation_settings() from public,anon,authenticated;
create trigger touch_marketing_automation_settings
before update on public.marketing_automation_settings
for each row execute function roundy_private.touch_marketing_automation_settings();

create table public.instagram_inbox(
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique check(length(external_id) between 1 and 240),
  kind text not null check(kind in('comment','dm')),
  sender_id text not null check(length(sender_id) between 1 and 240),
  sender_username text not null default '' check(length(sender_username)<=120),
  media_id text not null default '' check(length(media_id)<=240),
  text text not null default '' check(length(text)<=4000),
  status text not null default 'new' check(status in('new','auto_replied','needs_review','replied','ignored','failed')),
  decision_reason text not null default '' check(length(decision_reason)<=500),
  suggested_reply text not null default '' check(length(suggested_reply)<=2000),
  reply_text text not null default '' check(length(reply_text)<=2000),
  external_reply_id text not null default '' check(length(external_reply_id)<=240),
  received_at timestamptz not null default now(),
  replied_at timestamptz,
  updated_at timestamptz not null default now()
);
create index instagram_inbox_review_idx on public.instagram_inbox(status,received_at desc);

alter table public.instagram_inbox enable row level security;
revoke all on public.instagram_inbox from public,anon,authenticated;
grant select,update on public.instagram_inbox to authenticated;
grant all on public.instagram_inbox to service_role;

create policy instagram_inbox_admin_read
on public.instagram_inbox for select to authenticated
using((select public.is_admin()));

create policy instagram_inbox_admin_update
on public.instagram_inbox for update to authenticated
using((select public.is_admin()))
with check((select public.is_admin()));

create function roundy_private.touch_instagram_inbox()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function roundy_private.touch_instagram_inbox() from public,anon,authenticated;
create trigger touch_instagram_inbox
before update on public.instagram_inbox
for each row execute function roundy_private.touch_instagram_inbox();

create table roundy_private.instagram_webhook_config(
  singleton boolean primary key default true check(singleton),
  callback_key text not null default (gen_random_uuid()::text||gen_random_uuid()::text),
  verify_token text not null default (gen_random_uuid()::text||gen_random_uuid()::text),
  verified_at timestamptz,
  last_received_at timestamptz
);
insert into roundy_private.instagram_webhook_config default values
on conflict(singleton) do nothing;
revoke all on roundy_private.instagram_webhook_config from public,anon,authenticated;
grant select,update on roundy_private.instagram_webhook_config to service_role;

create function public.instagram_webhook_callback_authorized(p_key text)
returns boolean
language sql
security definer
set search_path=''
as $$
  select p_key is not null and exists(
    select 1 from roundy_private.instagram_webhook_config
    where singleton and callback_key=p_key
  )
$$;
revoke all on function public.instagram_webhook_callback_authorized(text) from public,anon,authenticated;
grant execute on function public.instagram_webhook_callback_authorized(text) to service_role;

create function public.instagram_webhook_verify(p_key text,p_token text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  update roundy_private.instagram_webhook_config
  set verified_at=now()
  where singleton and callback_key=p_key and verify_token=p_token;
  return found;
end;
$$;
revoke all on function public.instagram_webhook_verify(text,text) from public,anon,authenticated;
grant execute on function public.instagram_webhook_verify(text,text) to service_role;

create function public.mark_instagram_webhook_received(p_key text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  update roundy_private.instagram_webhook_config
  set last_received_at=now()
  where singleton and callback_key=p_key;
  return found;
end;
$$;
revoke all on function public.mark_instagram_webhook_received(text) from public,anon,authenticated;
grant execute on function public.mark_instagram_webhook_received(text) to service_role;

create function public.admin_instagram_webhook_setup()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare c roundy_private.instagram_webhook_config;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into c from roundy_private.instagram_webhook_config where singleton;
  return jsonb_build_object(
    'callback_key',c.callback_key,
    'verify_token',c.verify_token,
    'verified_at',c.verified_at,
    'last_received_at',c.last_received_at
  );
end;
$$;
revoke all on function public.admin_instagram_webhook_setup() from public,anon;
grant execute on function public.admin_instagram_webhook_setup() to authenticated;

commit;
