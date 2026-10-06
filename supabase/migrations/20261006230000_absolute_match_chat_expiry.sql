begin;

-- A Roundy match chat has one absolute lifetime: 72 hours from match creation.
-- Opening/reply state still controls who may send during that lifetime, but a
-- successful reply no longer turns the room into an indefinitely active chat.
create or replace function roundy_private.expire_match_chat_locked(p_match uuid)
returns void language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype; now_at timestamptz:=now();
begin
  select * into m from public.matches where id=p_match for update;
  if m.id is null or m.chat_state='expired' then return; end if;

  if m.opening_expires_at<=now_at then
    update public.matches set
      chat_state='expired',
      expired_at=now_at,
      expiry_reason=case
        when m.chat_state='awaiting_reply' then 'reply_timeout'
        else 'opening_timeout'
      end,
      chat_pending_message_id=null,
      chat_pending_from_state=null,
      stream_cleanup_status=case when stream_channel_created_at is null then 'not_required' else 'pending' end,
      stream_cleanup_requested_at=case when stream_channel_created_at is null then stream_cleanup_requested_at else now_at end,
      stream_cleanup_error=null
    where id=m.id;
  end if;
end;
$$;

-- Keep the reply deadline inside the match's absolute 72-hour lifetime.
create or replace function roundy_private.reserve_match_chat_message(p_match uuid,p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); match_row public.matches%rowtype; session jsonb; previous_state text;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if p_message_id is null then raise exception 'Message ID is required'; end if;
  select m.* into match_row from public.matches m
  join public.events e on e.id=m.event_id
  left join public.event_sessions s on s.event_id=e.id
  join public.members viewer on viewer.id=u and viewer.deleted_at is null
  join public.members other_member on other_member.id=case when m.user_a=u then m.user_b else m.user_a end and other_member.deleted_at is null
  where m.id=p_match and (m.user_a=u or m.user_b=u)
    and (s.state='finished' or e.ends_at<=now())
  for update of m;
  if match_row.id is null then raise exception 'Match unavailable'; end if;
  perform roundy_private.expire_match_chat_locked(match_row.id);
  select * into match_row from public.matches where id=p_match;
  if match_row.chat_state='expired' then raise exception 'Match chat has expired'; end if;
  if match_row.chat_pending_message_id is not null and match_row.chat_pending_message_id<>p_message_id then raise exception 'Another message is being sent'; end if;

  if match_row.chat_pending_message_id=p_message_id then
    session:=roundy_private.match_chat_session(p_match);
    return session||jsonb_build_object('message_id',p_message_id,'already_reserved',true);
  end if;

  previous_state:=match_row.chat_state;
  if match_row.chat_state='awaiting_opening' then
    update public.matches set
      chat_state='awaiting_reply',first_message_at=now(),first_message_by_user_id=u,first_message_id=p_message_id,
      reply_expires_at=least(now()+interval '72 hours',match_row.opening_expires_at),
      chat_pending_message_id=p_message_id,chat_pending_from_state=previous_state
    where id=match_row.id;
  elsif match_row.chat_state='awaiting_reply' then
    if match_row.first_message_by_user_id=u then raise exception 'Waiting for your match to reply'; end if;
    update public.matches set
      chat_state='active',reply_message_at=now(),reply_message_id=p_message_id,
      chat_pending_message_id=p_message_id,chat_pending_from_state=previous_state
    where id=match_row.id;
  elsif match_row.chat_state='active' then
    update public.matches set chat_pending_message_id=p_message_id,chat_pending_from_state=previous_state where id=match_row.id;
  else
    raise exception 'Match chat is unavailable';
  end if;
  session:=roundy_private.match_chat_session(p_match);
  return session||jsonb_build_object('message_id',p_message_id,'already_reserved',false);
end;
$$;

-- Existing active rooms that are already older than 72 hours must be picked up
-- immediately, rather than waiting for a user request.
update public.matches
set
  chat_state='expired',
  expired_at=now(),
  expiry_reason='opening_timeout',
  chat_pending_message_id=null,
  chat_pending_from_state=null,
  stream_cleanup_status=case when stream_channel_created_at is null then 'not_required' else 'pending' end,
  stream_cleanup_requested_at=case when stream_channel_created_at is null then stream_cleanup_requested_at else now() end,
  stream_cleanup_error=null
where chat_state<>'expired' and opening_expires_at<=now();

create index if not exists matches_absolute_chat_expiry_idx
  on public.matches(opening_expires_at)
  where chat_state<>'expired';

-- Replace the scheduler dispatcher so active rooms are also cleaned up at the
-- absolute deadline.
create or replace function roundy_private.dispatch_match_chat_expiry()
returns void language plpgsql security definer set search_path='' as $$
declare config roundy_private.reminder_scheduler_config;
begin
  select * into config from roundy_private.reminder_scheduler_config where singleton;
  if config.project_url is null then return; end if;
  if exists(
    select 1 from public.matches
    where (chat_state<>'expired' and opening_expires_at<=now())
       or (chat_state='expired' and stream_channel_created_at is not null and (stream_cleanup_status='pending' or (stream_cleanup_status='failed' and stream_cleanup_requested_at<=now()-interval '5 minutes')))
  ) then
    perform net.http_post(
      url:=config.project_url||'/functions/v1/roundy-match-chat-expiry',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||config.anon_jwt),
      body:='{}'::jsonb,timeout_milliseconds:=140000
    );
  end if;
end;
$$;

commit;
