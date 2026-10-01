begin;

-- Match conversation state lives with the match rather than in Stream. Stream is
-- used for realtime delivery, while these columns remain the source of truth for
-- the opening/reply windows and for cleanup when a match expires.
alter table public.matches
  add column chat_state text,
  add column opening_expires_at timestamptz,
  add column reply_expires_at timestamptz,
  add column first_message_at timestamptz,
  add column first_message_by_user_id uuid,
  add column first_message_id uuid,
  add column reply_message_at timestamptz,
  add column reply_message_id uuid,
  add column chat_pending_message_id uuid,
  add column chat_pending_from_state text,
  add column stream_channel_created_at timestamptz,
  add column stream_cleanup_status text,
  add column stream_cleanup_attempts integer not null default 0,
  add column stream_cleanup_requested_at timestamptz,
  add column stream_cleanup_error text,
  add column stream_cleanup_task_id text,
  add column expired_at timestamptz,
  add column expiry_reason text;

-- Existing matches are conservatively treated as though their initial window
-- began when the match was created. New matches receive the same window through
-- the default below.
update public.matches
set
  opening_expires_at=created_at+interval '72 hours',
  chat_state=case when created_at+interval '72 hours'<=now() then 'expired' else 'awaiting_opening' end,
  expired_at=case when created_at+interval '72 hours'<=now() then created_at+interval '72 hours' else null end,
  expiry_reason=case when created_at+interval '72 hours'<=now() then 'opening_timeout' else null end,
  stream_cleanup_status='not_required';

alter table public.matches
  alter column chat_state set default 'awaiting_opening',
  alter column chat_state set not null,
  alter column opening_expires_at set default (now()+interval '72 hours'),
  alter column opening_expires_at set not null,
  alter column stream_cleanup_status set default 'not_required',
  alter column stream_cleanup_status set not null,
  add constraint matches_chat_state_valid check(chat_state in('awaiting_opening','awaiting_reply','active','expired')),
  add constraint matches_chat_pending_state_valid check(chat_pending_from_state is null or chat_pending_from_state in('awaiting_opening','awaiting_reply','active')),
  add constraint matches_stream_cleanup_status_valid check(stream_cleanup_status in('not_required','pending','processing','submitted','failed')),
  add constraint matches_expiry_reason_valid check(expiry_reason is null or expiry_reason in('opening_timeout','reply_timeout'));

create index matches_opening_expiry_idx on public.matches(opening_expires_at) where chat_state='awaiting_opening';
create index matches_reply_expiry_idx on public.matches(reply_expires_at) where chat_state='awaiting_reply';
create index matches_stream_cleanup_idx on public.matches(stream_cleanup_status,expired_at) where chat_state='expired';

-- This helper is intentionally private. Callers must first establish that they
-- are one of the match members; scheduler calls use the service role wrappers.
create function roundy_private.expire_match_chat_locked(p_match uuid)
returns void language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype; now_at timestamptz:=now();
begin
  select * into m from public.matches where id=p_match for update;
  if m.id is null or m.chat_state='expired' then return; end if;

  if m.chat_state='awaiting_opening' and m.opening_expires_at<=now_at then
    update public.matches set
      chat_state='expired',expired_at=now_at,expiry_reason='opening_timeout',
      chat_pending_message_id=null,chat_pending_from_state=null,
      stream_cleanup_status=case when stream_channel_created_at is null then 'not_required' else 'pending' end,
      stream_cleanup_requested_at=case when stream_channel_created_at is null then stream_cleanup_requested_at else now_at end,
      stream_cleanup_error=null
    where id=m.id;
  elsif m.chat_state='awaiting_reply' and m.reply_expires_at<=now_at then
    update public.matches set
      chat_state='expired',expired_at=now_at,expiry_reason='reply_timeout',
      chat_pending_message_id=null,chat_pending_from_state=null,
      stream_cleanup_status=case when stream_channel_created_at is null then 'not_required' else 'pending' end,
      stream_cleanup_requested_at=case when stream_channel_created_at is null then stream_cleanup_requested_at else now_at end,
      stream_cleanup_error=null
    where id=m.id;
  end if;
end;
$$;

create function roundy_private.match_chat_session(p_match uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid:=auth.uid();
  match_row public.matches%rowtype;
  other_id uuid;
  viewer_profile jsonb;
  other_profile jsonb;
  viewer_photo text;
  other_photo text;
  deadline timestamptz;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select m.* into match_row
  from public.matches m
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
  other_id:=case when match_row.user_a=u then match_row.user_b else match_row.user_a end;
  select profile into viewer_profile from public.profiles where user_id=u;
  select profile into other_profile from public.profiles where user_id=other_id;
  viewer_profile:=coalesce(viewer_profile,'{}'::jsonb);
  other_profile:=coalesce(other_profile,'{}'::jsonb);
  select photo into viewer_photo from jsonb_array_elements_text(case when jsonb_typeof(viewer_profile->'photos')='array' then viewer_profile->'photos' else '[]'::jsonb end) photo where photo like '/api/photos/'||u::text||'/%' limit 1;
  select photo into other_photo from jsonb_array_elements_text(case when jsonb_typeof(other_profile->'photos')='array' then other_profile->'photos' else '[]'::jsonb end) photo where photo like '/api/photos/'||other_id::text||'/%' limit 1;
  deadline:=case when match_row.chat_state='awaiting_opening' then match_row.opening_expires_at when match_row.chat_state='awaiting_reply' then match_row.reply_expires_at else null end;

  return jsonb_build_object(
    'id',match_row.id,
    'chat_state',match_row.chat_state,
    'deadline',deadline,
    'opening_expires_at',match_row.opening_expires_at,
    'reply_expires_at',match_row.reply_expires_at,
    'expired_at',match_row.expired_at,
    'expiry_reason',match_row.expiry_reason,
    'can_send',case when match_row.chat_state='awaiting_opening' then true when match_row.chat_state='awaiting_reply' then match_row.first_message_by_user_id is distinct from u when match_row.chat_state='active' then true else false end,
    'first_message_by_viewer',match_row.first_message_by_user_id=u,
    'viewer_stream_user_id','r_'||md5(u::text),
    'viewer_name',coalesce(nullif(viewer_profile->>'full_name',''),'Roundy member'),
    'viewer_photo',viewer_photo,
    'other_stream_user_id','r_'||md5(other_id::text),
    'other_name',coalesce(nullif(other_profile->>'full_name',''),'Your match'),
    'other_photo',other_photo,
    'channel_id','match_'||replace(match_row.id::text,'-',''),
    'notification_channel_id','roundy_'||md5(u::text),
    'stream_channel_exists',match_row.stream_channel_created_at is not null
  );
end;
$$;

create function roundy_private.set_match_chat_channel(p_match uuid,p_channel_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); match_row public.matches%rowtype; expected text;
begin
  if u is null then raise exception 'Sign in required'; end if;
  expected:='match_'||replace(p_match::text,'-','');
  if p_channel_id is distinct from expected then raise exception 'Unexpected chat channel'; end if;
  select m.* into match_row from public.matches m
  where m.id=p_match and (m.user_a=u or m.user_b=u)
  for update;
  if match_row.id is null then raise exception 'Match unavailable'; end if;
  perform roundy_private.expire_match_chat_locked(match_row.id);
  select * into match_row from public.matches where id=p_match;
  if match_row.chat_state='expired' then
    update public.matches set
      stream_channel_created_at=coalesce(stream_channel_created_at,now()),
      stream_cleanup_status='pending',stream_cleanup_requested_at=now(),stream_cleanup_error=null
    where id=match_row.id;
    return jsonb_build_object('expired',true);
  end if;
  update public.matches set stream_channel_created_at=coalesce(stream_channel_created_at,now()) where id=match_row.id;
  return jsonb_build_object('expired',false);
end;
$$;

create function roundy_private.reserve_match_chat_message(p_match uuid,p_message_id uuid)
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
      reply_expires_at=now()+interval '72 hours',chat_pending_message_id=p_message_id,chat_pending_from_state=previous_state
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

create function roundy_private.confirm_match_chat_message(p_match uuid,p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m public.matches%rowtype;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into m from public.matches where id=p_match and (user_a=u or user_b=u) for update;
  if m.id is null then raise exception 'Match unavailable'; end if;
  if m.chat_pending_message_id is distinct from p_message_id then raise exception 'Message reservation is no longer valid'; end if;
  update public.matches set chat_pending_message_id=null,chat_pending_from_state=null where id=m.id;
  return roundy_private.match_chat_session(p_match)||jsonb_build_object('message_id',p_message_id);
end;
$$;

create function roundy_private.abort_match_chat_message(p_match uuid,p_message_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m public.matches%rowtype;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into m from public.matches where id=p_match and (user_a=u or user_b=u) for update;
  if m.id is null or m.chat_pending_message_id is distinct from p_message_id then return false; end if;
  if m.chat_pending_from_state='awaiting_opening' then
    update public.matches set
      chat_state='awaiting_opening',first_message_at=null,first_message_by_user_id=null,first_message_id=null,reply_expires_at=null,
      chat_pending_message_id=null,chat_pending_from_state=null
    where id=m.id;
  elsif m.chat_pending_from_state='awaiting_reply' then
    update public.matches set
      chat_state='awaiting_reply',reply_message_at=null,reply_message_id=null,
      chat_pending_message_id=null,chat_pending_from_state=null
    where id=m.id;
  else
    update public.matches set chat_pending_message_id=null,chat_pending_from_state=null where id=m.id;
  end if;
  return true;
end;
$$;

-- Keep expired match data for the grey-ring history, but claim only the Stream
-- rooms that actually existed. The Edge Function performs the hard deletion.
create function roundy_private.claim_match_chat_cleanup(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; result jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Invalid cleanup limit'; end if;
  for r in
    select id from public.matches
    where (chat_state='awaiting_opening' and opening_expires_at<=now())
       or (chat_state='awaiting_reply' and reply_expires_at<=now())
    order by coalesce(reply_expires_at,opening_expires_at),id
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

create function roundy_private.finish_match_chat_cleanup(p_matches uuid[],p_succeeded boolean,p_error text default null,p_task_id text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_matches is null or cardinality(p_matches)=0 then return; end if;
  update public.matches set
    stream_cleanup_status=case when p_succeeded then 'submitted' else 'failed' end,
    stream_cleanup_error=case when p_succeeded then null else left(coalesce(p_error,'Stream cleanup failed'),500) end,
    stream_cleanup_task_id=case when p_succeeded then p_task_id else stream_cleanup_task_id end,
    stream_cleanup_requested_at=now()
  where id=any(p_matches) and chat_state='expired' and stream_cleanup_status='processing';
end;
$$;

-- Match cards remain the existing presentation API; chat status is safe to
-- reveal to both match members and lets the UI select the pink/grey ring.
create or replace function roundy_private.match_cards(p_match uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb; r record;
begin
 if u is null then raise exception 'Sign in required'; end if;
 for r in select id from public.matches where (user_a=u or user_b=u) and (p_match is null or id=p_match) loop
   perform roundy_private.expire_match_chat_locked(r.id);
 end loop;
 select coalesce(jsonb_agg(card order by created_at desc,id),'[]'::jsonb) into result
 from (
  select m.id,m.created_at,jsonb_build_object(
   'id',m.id,'full_name',p.profile->>'full_name',
   'age',extract(year from age((now() at time zone 'Asia/Seoul')::date,nullif(p.profile->>'birth_date','')::date)),
   'nationality',p.profile->>'nationality','height_cm',p.profile->'height_cm','mbti',nullif(p.profile->>'mbti',''),
   'public_job',p.profile->>'public_job','public_workplace',p.profile->>'public_workplace',
   'interests',coalesce(p.profile->'interests','[]'::jsonb),
   'photos',coalesce((select jsonb_agg(photo) from jsonb_array_elements_text(case when jsonb_typeof(p.profile->'photos')='array' then p.profile->'photos' else '[]'::jsonb end) photo where photo like '/api/photos/'||p.user_id::text||'/%'),'[]'::jsonb),
   'contact_available',coalesce(p.profile->>'contact_consent'='true' and nullif(p.profile->>'phone','') is not null,false),
   'event_id',e.id,'event_title',e.title,'event_starts_at',e.starts_at,
   'round_number',enc.round_number,'table_number',enc.table_number,
   'chat_state',m.chat_state,
   'chat_expires_at',case when m.chat_state='awaiting_opening' then m.opening_expires_at when m.chat_state='awaiting_reply' then m.reply_expires_at else null end
  ) card
  from public.matches m
  join public.events e on e.id=m.event_id
  left join public.event_sessions s on s.event_id=e.id
  join public.profiles p on p.user_id=case when m.user_a=u then m.user_b else m.user_a end
  join public.members other_member on other_member.id=p.user_id and other_member.deleted_at is null
  join public.members viewer on viewer.id=u and viewer.deleted_at is null
  left join lateral (
   select x.round_number,x.table_number from public.encounters x
   where x.event_id=m.event_id and least(x.user_a,x.user_b)=m.user_a and greatest(x.user_a,x.user_b)=m.user_b
   order by x.round_number limit 1
  ) enc on true
  where (m.user_a=u or m.user_b=u) and (p_match is null or m.id=p_match)
   and (s.state='finished' or e.ends_at<=now())
 ) eligible;
 return result;
end;
$$;

-- These are server-only entry points. The Next route authenticates the member,
-- then uses a Supabase service-role client to pass that verified actor into the
-- database. Browser clients cannot invoke a state transition directly.
create function public.service_match_chat_session(p_actor uuid,p_match uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null then raise exception 'Actor is required'; end if;
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  return roundy_private.match_chat_session(p_match);
end;
$$;
create function public.service_set_match_chat_channel(p_actor uuid,p_match uuid,p_channel_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null then raise exception 'Actor is required'; end if;
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  return roundy_private.set_match_chat_channel(p_match,p_channel_id);
end;
$$;
create function public.service_reserve_match_chat_message(p_actor uuid,p_match uuid,p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null then raise exception 'Actor is required'; end if;
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  return roundy_private.reserve_match_chat_message(p_match,p_message_id);
end;
$$;
create function public.service_confirm_match_chat_message(p_actor uuid,p_match uuid,p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null then raise exception 'Actor is required'; end if;
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  return roundy_private.confirm_match_chat_message(p_match,p_message_id);
end;
$$;
create function public.service_abort_match_chat_message(p_actor uuid,p_match uuid,p_message_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null then raise exception 'Actor is required'; end if;
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  return roundy_private.abort_match_chat_message(p_match,p_message_id);
end;
$$;
create function public.claim_match_chat_cleanup(p_limit integer default 50)
returns jsonb language sql security invoker set search_path='' as $$select roundy_private.claim_match_chat_cleanup(p_limit);$$;
create function public.finish_match_chat_cleanup(p_matches uuid[],p_succeeded boolean,p_error text default null,p_task_id text default null)
returns void language sql security invoker set search_path='' as $$select roundy_private.finish_match_chat_cleanup(p_matches,p_succeeded,p_error,p_task_id);$$;

revoke all on function
  roundy_private.expire_match_chat_locked(uuid),
  roundy_private.match_chat_session(uuid),public.service_match_chat_session(uuid,uuid),
  roundy_private.set_match_chat_channel(uuid,text),public.service_set_match_chat_channel(uuid,uuid,text),
  roundy_private.reserve_match_chat_message(uuid,uuid),public.service_reserve_match_chat_message(uuid,uuid,uuid),
  roundy_private.confirm_match_chat_message(uuid,uuid),public.service_confirm_match_chat_message(uuid,uuid,uuid),
  roundy_private.abort_match_chat_message(uuid,uuid),public.service_abort_match_chat_message(uuid,uuid,uuid),
  roundy_private.claim_match_chat_cleanup(integer),public.claim_match_chat_cleanup(integer),
  roundy_private.finish_match_chat_cleanup(uuid[],boolean,text,text),public.finish_match_chat_cleanup(uuid[],boolean,text,text)
from public,anon,authenticated;
grant execute on function
  public.service_match_chat_session(uuid,uuid),
  public.service_set_match_chat_channel(uuid,uuid,text),
  public.service_reserve_match_chat_message(uuid,uuid,uuid),
  public.service_confirm_match_chat_message(uuid,uuid,uuid),
  public.service_abort_match_chat_message(uuid,uuid,uuid),
  roundy_private.claim_match_chat_cleanup(integer),public.claim_match_chat_cleanup(integer),
  roundy_private.finish_match_chat_cleanup(uuid[],boolean,text,text),public.finish_match_chat_cleanup(uuid[],boolean,text,text)
to service_role;

-- The existing project scheduler configuration contains only the Supabase URL
-- and anon gateway JWT. The Edge Function itself uses the service-role secret.
create function roundy_private.dispatch_match_chat_expiry()
returns void language plpgsql security definer set search_path='' as $$
declare config roundy_private.reminder_scheduler_config;
begin
  select * into config from roundy_private.reminder_scheduler_config where singleton;
  if config.project_url is null then return; end if;
  if exists(
    select 1 from public.matches
    where (chat_state='awaiting_opening' and opening_expires_at<=now())
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
revoke all on function roundy_private.dispatch_match_chat_expiry() from public,anon,authenticated;
select cron.schedule('roundy-match-chat-expiry','* * * * *','select roundy_private.dispatch_match_chat_expiry()');

commit;
