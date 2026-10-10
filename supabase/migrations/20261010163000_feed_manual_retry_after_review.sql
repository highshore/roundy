-- Explicit admin-only Feed retry after checking that Meta did NOT publish.
-- Reuses the original approved run and its source snapshots; it never creates
-- a second run for the same draft and never retries a needs_review outcome on cron.
create or replace function public.retry_marketing_feed_after_review(
 p_run uuid,p_actor uuid,p_confirm_no_post boolean,p_note text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
 r public.marketing_runs;
 d public.instagram_post_drafts;
 slot public.marketing_feed_schedule_slots;
 pref public.marketing_automation_settings;
 last_attempt public.marketing_feed_publish_attempts;
 kst_today date:=(now() at time zone 'Asia/Seoul')::date;
 candidate date;
 proposed timestamptz;
 n_reserved integer;
 n_prior integer;
 cap integer;
 i integer;
begin
 perform pg_advisory_xact_lock(70361005);
 perform pg_advisory_xact_lock(20261010155000);
 if p_actor is null or p_confirm_no_post is distinct from true
  or length(trim(coalesce(p_note,''))) not between 12 and 500
 then raise exception 'CONFIRM_NOT_PUBLISHED_AND_REVIEW_NOTE_REQUIRED'; end if;
 select * into r from public.marketing_runs where id=p_run for update;
 if not found or r.channel<>'instagram'
  or coalesce(r.snapshot->>'media_kind','feed')='reel'
  or r.status not in ('needs_review','failed') or r.external_id is not null
 then raise exception 'FEED_RUN_NOT_RETRYABLE'; end if;
 select * into slot from public.marketing_feed_schedule_slots where run_id=r.id for update;
 if not found then raise exception 'APPROVED_FEED_RESERVATION_REQUIRED'; end if;
 select * into d from public.instagram_post_drafts
  where id=slot.draft_id and marketing_run_id=r.id for update;
 if not found or d.status not in ('scheduled','failed')
  or d.approved_by is null or d.approved_at is null
 then raise exception 'APPROVED_FEED_DRAFT_REQUIRED'; end if;
 select * into last_attempt from public.marketing_feed_publish_attempts
  where run_id=r.id order by attempt_no desc limit 1 for update;
 if not found or last_attempt.state not in ('failed','needs_review')
  or last_attempt.finished_at is null
 then raise exception 'UNFINISHED_OR_UNCONFIRMED_ATTEMPT'; end if;
 if exists(select 1 from public.marketing_feed_retry_reviews
  where run_id=r.id and attempt_no=last_attempt.attempt_no)
 then raise exception 'FEED_RETRY_ALREADY_REVIEWED'; end if;
 select * into pref from public.marketing_automation_settings where singleton=true;
 cap:=greatest(1,least(10,coalesce(pref.feed_daily_max_posts,1)));
 -- A retry is always next local day or later. A failed attempt already consumed
 -- its original KST day; never attempt a second external POST on that date.
 candidate:=kst_today+1;
 for i in 0..365 loop
  select count(*) into n_reserved from public.marketing_feed_schedule_slots
   where slot_date=candidate and run_id is distinct from r.id;
  select count(*) into n_prior from public.marketing_runs old
   where old.channel='instagram'
    and coalesce(old.snapshot->>'media_kind','feed')<>'reel'
    and old.status<>'skipped'
    and (old.scheduled_for at time zone 'Asia/Seoul')::date=candidate
    and old.id is distinct from r.id
    and not exists(select 1 from public.marketing_feed_schedule_slots x where x.run_id=old.id);
  if n_reserved+n_prior<cap then exit; end if;
  candidate:=candidate+1;
 end loop;
 if i>365 then raise exception 'FEED_SCHEDULE_HORIZON_EXCEEDED'; end if;
 proposed:=(candidate+coalesce(d.recommended_time_kst,pref.daily_time_kst,'20:00'::time))
  at time zone 'Asia/Seoul';
 insert into public.marketing_feed_retry_reviews(
  run_id,attempt_no,reviewed_by,confirmed_not_published,review_note
 ) values(r.id,last_attempt.attempt_no,p_actor,true,trim(p_note));
 update public.marketing_feed_schedule_slots
 set slot_date=candidate,slot_position=n_reserved+n_prior+1,
  scheduled_for=proposed,updated_at=now() where run_id=r.id;
 if d.status='failed' then
  update public.instagram_post_drafts set status='scheduled',updated_at=now()
   where id=d.id;
 end if;
 update public.instagram_post_drafts set scheduled_for=proposed,updated_at=now()
 where id=d.id;
 update public.marketing_runs set status='queued',scheduled_for=proposed,
  started_at=null,finished_at=null,message='RETRY_VERIFIED_NO_POST: '||left(trim(p_note),420),
  snapshot=jsonb_set(jsonb_set(r.snapshot,'{feed_date_kst}',to_jsonb(candidate::text),true),
   '{feed_slot_position}',to_jsonb(n_reserved+n_prior+1),true)
 where id=r.id returning * into r;
 return jsonb_build_object('run',to_jsonb(r),'feed_date_kst',candidate,
  'attempt_no',last_attempt.attempt_no+1,
  'prior_attempt_id',last_attempt.id,'next_scheduled_for',proposed,
  'requires_manual_review',false);
end;$$;
revoke all on function public.retry_marketing_feed_after_review(uuid,uuid,boolean,text)
 from public,anon,authenticated;
grant execute on function public.retry_marketing_feed_after_review(uuid,uuid,boolean,text)
 to service_role;
