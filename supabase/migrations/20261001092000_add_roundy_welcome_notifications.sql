begin;

-- New accounts receive one read-only Roundy Team welcome chat. There is no
-- backfill: existing accounts are deliberately excluded from this onboarding
-- send so deploying chat never turns into an accidental bulk campaign.
create table if not exists public.roundy_notification_deliveries(
  user_id uuid not null references public.members(id) on delete cascade,
  kind text not null check(kind in ('welcome')),
  status text not null default 'pending' check(status in ('pending','processing','sent')),
  attempts integer not null default 0 check(attempts>=0),
  stream_message_id text,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,kind)
);

alter table public.roundy_notification_deliveries enable row level security;
revoke all on public.roundy_notification_deliveries from public,anon,authenticated;

create or replace function roundy_private.queue_roundy_welcome_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.deleted_at is null then
    insert into public.roundy_notification_deliveries(user_id,kind)
    values(new.id,'welcome')
    on conflict(user_id,kind) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists roundy_queue_welcome_notification on public.members;
create trigger roundy_queue_welcome_notification
after insert on public.members
for each row execute function roundy_private.queue_roundy_welcome_notification();

-- A short lease prevents concurrent auth callback retries from sending the
-- message twice. The Stream message itself also has a deterministic ID.
create or replace function roundy_private.claim_roundy_welcome_notification(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  delivery public.roundy_notification_deliveries;
begin
  if not exists(select 1 from public.members where id=p_user and deleted_at is null) then
    return false;
  end if;

  select * into delivery
  from public.roundy_notification_deliveries
  where user_id=p_user and kind='welcome'
  for update;

  if delivery.user_id is null or delivery.status='sent' then return false; end if;
  if delivery.status='processing' and delivery.claimed_at>now()-interval '5 minutes' then return false; end if;

  update public.roundy_notification_deliveries
  set status='processing',attempts=attempts+1,claimed_at=now(),last_error=null,updated_at=now()
  where user_id=p_user and kind='welcome';
  return true;
end;
$$;

create or replace function roundy_private.complete_roundy_welcome_notification(p_user uuid,p_stream_message_id text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.roundy_notification_deliveries
  set status='sent',stream_message_id=p_stream_message_id,claimed_at=null,sent_at=coalesce(sent_at,now()),last_error=null,updated_at=now()
  where user_id=p_user and kind='welcome' and status in ('pending','processing');
  return found;
end;
$$;

create or replace function roundy_private.release_roundy_welcome_notification(p_user uuid,p_error text default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.roundy_notification_deliveries
  set status='pending',claimed_at=null,last_error=nullif(left(coalesce(p_error,''),500),''),updated_at=now()
  where user_id=p_user and kind='welcome' and status='processing';
  return found;
end;
$$;

create or replace function public.service_claim_roundy_welcome_notification(p_user uuid)
returns boolean language sql security definer set search_path='' as $$
  select roundy_private.claim_roundy_welcome_notification(p_user);
$$;

create or replace function public.service_complete_roundy_welcome_notification(p_user uuid,p_stream_message_id text)
returns boolean language sql security definer set search_path='' as $$
  select roundy_private.complete_roundy_welcome_notification(p_user,p_stream_message_id);
$$;

create or replace function public.service_release_roundy_welcome_notification(p_user uuid,p_error text default null)
returns boolean language sql security definer set search_path='' as $$
  select roundy_private.release_roundy_welcome_notification(p_user,p_error);
$$;

revoke all on function roundy_private.queue_roundy_welcome_notification(),
  roundy_private.claim_roundy_welcome_notification(uuid),
  roundy_private.complete_roundy_welcome_notification(uuid,text),
  roundy_private.release_roundy_welcome_notification(uuid,text),
  public.service_claim_roundy_welcome_notification(uuid),
  public.service_complete_roundy_welcome_notification(uuid,text),
  public.service_release_roundy_welcome_notification(uuid,text)
  from public,anon,authenticated;

grant execute on function public.service_claim_roundy_welcome_notification(uuid),
  public.service_complete_roundy_welcome_notification(uuid,text),
  public.service_release_roundy_welcome_notification(uuid,text)
  to service_role;

commit;
