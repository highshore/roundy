-- Serialize worker claims and enforce the live, configurable KST Feed/day cap.
-- Repeat cron invocations cannot claim the same run twice.
create or replace function public.claim_marketing()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 t public.marketing_templates;
 r public.marketing_runs;
 local_now timestamp:=now() at time zone 'Asia/Seoul';
 due timestamptz;
 result jsonb:='[]'::jsonb;
 cap integer;
 attempts_today integer;
 legacy_sent_today integer;
 active_uncertain boolean;
 is_feed boolean;
begin
 -- Same acquisition order as the approval RPC and preflight triggers.
 perform pg_advisory_xact_lock(70361005);
 perform pg_advisory_xact_lock(20261010155000);
 perform pg_advisory_xact_lock(hashtextextended('roundy-marketing-claims',0));
 select greatest(1,least(10,coalesce(feed_daily_max_posts,1))) into cap
 from public.marketing_automation_settings where singleton=true;
 if cap is null then cap:=1; end if;
 -- Unknown external outcomes remain quarantined; no background retries.
 update public.marketing_runs set status='needs_review',
  message='PUBLISH_OUTCOME_UNKNOWN: Publisher timed out. Check Instagram before any manual retry.',
  finished_at=now()
 where status='publishing' and started_at<now()-interval '10 minutes';
 for t in select * from public.marketing_templates where enabled
   and extract(dow from local_now)::int=any(days) loop
  due=(local_now::date+t.time_kst) at time zone 'Asia/Seoul';
  if due<=now() and due>now()-interval '10 minutes' and t.updated_at<=due then
   insert into public.marketing_runs(template_id,channel,snapshot,request_key,scheduled_for)
   values(t.id,t.channel,to_jsonb(t),
    'schedule:'||t.id::text||':'||due::text,due)
   on conflict(request_key) do nothing;
  end if;
 end loop;
 for r in select * from public.marketing_runs where status='queued'
  and scheduled_for<=now() order by scheduled_for,id limit 30
  for update skip locked loop
  if exists(select 1 from public.marketing_runs
    where channel=r.channel and id<>r.id
      and status in ('publishing','needs_review')) then continue; end if;
  is_feed:=r.channel='instagram'
   and coalesce(r.snapshot->>'media_kind','feed')<>'reel';
  if is_feed then
   if not exists(select 1 from public.marketing_feed_schedule_slots
    where run_id=r.id and draft_id::text=r.snapshot->>'draft_id') then
    update public.marketing_runs set status='needs_review',
     message='APPROVED_FEED_SLOT_REQUIRED: Manual review before publishing a legacy template.',
     finished_at=now() where id=r.id;
    continue;
   end if;
   -- Every started attempt consumes that day's capacity, even after failure or
   -- ambiguous Meta outcomes. Older sent records without new attempt rows count too.
   select count(*) into attempts_today
   from public.marketing_feed_publish_attempts a
   join public.marketing_runs prior on prior.id=a.run_id
   where prior.channel='instagram'
    and coalesce(prior.snapshot->>'media_kind','feed')<>'reel'
    and (a.started_at at time zone 'Asia/Seoul')::date=local_now::date;
   select count(*) into legacy_sent_today
   from public.marketing_runs prior where prior.channel='instagram'
     and coalesce(prior.snapshot->>'media_kind','feed')<>'reel'
     and prior.status='sent'
     and (coalesce(prior.started_at,prior.finished_at) at time zone 'Asia/Seoul')::date=local_now::date
     and not exists(select 1 from public.marketing_feed_publish_attempts a where a.run_id=prior.id);
   if attempts_today+legacy_sent_today>=cap then
    -- Keep the approved run QUEUED; next KST day it is eligible again.
    update public.marketing_runs set
     message='FEED_DAILY_LIMIT_KST: Resuming on the next eligible local date.'
    where id=r.id;
    continue;
   end if;
  end if;
  if not is_feed and exists(select 1 from public.marketing_runs prior
   where prior.channel=r.channel and prior.status='sent'
    and prior.finished_at>now()-interval '24 hours'
    and (r.channel='koreapas' or
     (coalesce(prior.snapshot->>'media_kind','feed')=coalesce(r.snapshot->>'media_kind','feed')
      and case when r.snapshot->>'media_kind'='reel'
       then prior.snapshot->>'video_storage_path'=r.snapshot->>'video_storage_path'
       else prior.snapshot->>'caption'=r.snapshot->>'caption'
        and prior.snapshot->'images'=r.snapshot->'images' end))
  ) then
   update public.marketing_runs set status='skipped',
     message='Recent duplicate or channel posting interval (24 hours).',
     finished_at=now() where id=r.id;
   continue;
  end if;
  update public.marketing_runs set status='publishing',started_at=now(),message=''
   where id=r.id and status='queued' returning * into r;
  if found then result:=result||jsonb_build_array(to_jsonb(r)); end if;
 end loop;
 return result;
end;$$;
-- Service-role cron/worker only. Never expose a SECURITY DEFINER claim to the public API.
revoke all on function public.claim_marketing() from public,anon,authenticated;
grant execute on function public.claim_marketing() to service_role;

-- Every state transition is audited as a separate attempt. No background retry
-- overwrites an earlier error or uncertain result.
create or replace function roundy_private.log_marketing_feed_attempt()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare next_no integer;
begin
 if new.channel<>'instagram'
  or coalesce(new.snapshot->>'media_kind','feed')='reel'
  or nullif(new.snapshot->>'draft_id','') is null then return new; end if;
 if old.status='queued' and new.status='publishing' then
  select coalesce(max(attempt_no),0)+1 into next_no
  from public.marketing_feed_publish_attempts where run_id=new.id;
  insert into public.marketing_feed_publish_attempts(run_id,attempt_no,state,started_at)
  values(new.id,next_no,'publishing',coalesce(new.started_at,now()));
 elsif old.status='publishing' and new.status in ('sent','failed','needs_review') then
  update public.marketing_feed_publish_attempts set
   state=new.status,finished_at=coalesce(new.finished_at,now()),
   error_message=case when new.status='sent' then null else left(coalesce(new.message,'Unknown publisher error'),500) end,
   external_id=new.external_id
  where run_id=new.id and state='publishing' and finished_at is null;
 end if;
 return new;
end;$$;
revoke all on function roundy_private.log_marketing_feed_attempt()
 from public,anon,authenticated;
drop trigger if exists log_marketing_feed_attempt on public.marketing_runs;
create trigger log_marketing_feed_attempt
 after update of status on public.marketing_runs
 for each row when (old.status is distinct from new.status)
 execute function roundy_private.log_marketing_feed_attempt();

-- An external POST may be made only after recording durable uncertainty evidence.
-- If the database write fails, the worker must stop BEFORE calling Meta.
create or replace function public.mark_marketing_feed_external_attempt(p_run uuid)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare n integer;
begin
 update public.marketing_feed_publish_attempts
 set external_requested_at=coalesce(external_requested_at,now())
 where run_id=p_run and state='publishing' and finished_at is null;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'FEED_EXTERNAL_ATTEMPT_NOT_CLAIMED'; end if;
 return true;
end;$$;
revoke all on function public.mark_marketing_feed_external_attempt(uuid)
 from public,anon,authenticated;
grant execute on function public.mark_marketing_feed_external_attempt(uuid) to service_role;

-- Never allow a service client to move an ambiguous Feed run back to 'queued'
-- without the admin's explicitly recorded not-published verification.
create or replace function roundy_private.guard_marketing_feed_retry()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare last_no integer;
begin
 if new.channel='instagram' and coalesce(new.snapshot->>'media_kind','feed')<>'reel'
  and old.status in ('failed','needs_review') and new.status='queued' then
  select max(attempt_no) into last_no
   from public.marketing_feed_publish_attempts where run_id=new.id;
  if last_no is null or not exists (
   select 1 from public.marketing_feed_retry_reviews
   where run_id=new.id and attempt_no=last_no and confirmed_not_published
  ) then raise exception 'FEED_RETRY_REQUIRES_CONFIRMED_NO_POST'; end if;
 end if;
 return new;
end;$$;
revoke all on function roundy_private.guard_marketing_feed_retry()
 from public,anon,authenticated;
drop trigger if exists guard_marketing_feed_retry on public.marketing_runs;
create trigger guard_marketing_feed_retry
 before update of status on public.marketing_runs
 for each row execute function roundy_private.guard_marketing_feed_retry();
