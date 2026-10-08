begin;

-- Retain the absolute 72-hour lifetime and the independent, earlier reply deadline.
create or replace function roundy_private.expire_match_chat_locked(p_match uuid)
returns void language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype; now_at timestamptz:=now();
begin
  select * into m from public.matches where id=p_match for update;
  if m.id is null or m.chat_state='expired' then return; end if;

  if m.opening_expires_at<=now_at
     or (m.chat_state='awaiting_reply' and m.reply_expires_at<=now_at) then
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


-- The expiry worker must handle active chats even when nobody opens the inbox.
create or replace function roundy_private.claim_match_chat_cleanup(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; result jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Invalid cleanup limit'; end if;
  for r in
    select id from public.matches
    where (chat_state<>'expired' and opening_expires_at<=now())
       or (chat_state='awaiting_reply' and reply_expires_at<=now())
    order by case when chat_state='awaiting_reply' then least(opening_expires_at,coalesce(reply_expires_at,opening_expires_at)) else opening_expires_at end,id
    limit p_limit
    for update skip locked
  loop
    perform roundy_private.expire_match_chat_locked(r.id);
  end loop;

  with candidates as (
    select id from public.matches
    where chat_state='expired' and stream_channel_created_at is not null
      and (stream_cleanup_status='pending' or (stream_cleanup_status='failed' and stream_cleanup_requested_at<=now()-interval '5 minutes'))
    order by expired_at,id
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.matches m set stream_cleanup_status='processing',stream_cleanup_attempts=m.stream_cleanup_attempts+1,stream_cleanup_requested_at=now(),stream_cleanup_error=null
    from candidates c where m.id=c.id
    returning m.id,'match_'||replace(m.id::text,'-','') as channel_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'channel_id',channel_id)),'[]'::jsonb) into result from claimed;
  return result;
end;
$$;


-- Notify the cleanup worker whenever either deadline has elapsed.
create or replace function roundy_private.dispatch_match_chat_expiry()
returns void language plpgsql security definer set search_path='' as $$
declare config roundy_private.reminder_scheduler_config;
begin
  select * into config from roundy_private.reminder_scheduler_config where singleton;
  if config.project_url is null then return; end if;
  if exists(
    select 1 from public.matches
    where (chat_state<>'expired' and opening_expires_at<=now())
       or (chat_state='awaiting_reply' and reply_expires_at<=now())
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
