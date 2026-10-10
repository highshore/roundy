-- Repair row-variable / SQL alias collision in isolated Story claim RPC.
create or replace function public.claim_marketing_story_previews()
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare s public.marketing_story_previews; claimed jsonb:='[]'::jsonb;
begin
 perform pg_advisory_xact_lock(20261010183000);
 update public.marketing_story_previews set status='needs_review',
  error_code='STORY_PUBLISH_OUTCOME_UNKNOWN',
  error_message='Publisher stopped without a confirmed outcome. Review Instagram before manual intervention.',
  updated_at=now()
 where status='publishing' and started_at<now()-interval '10 minutes';
 update public.marketing_story_publish_attempts a set
  state='needs_review',finished_at=now(),error_code='STORY_PUBLISH_OUTCOME_UNKNOWN',
  error_message='Publishing outcome uncertain; do not retry automatically.'
 where state in ('claimed','external_started') and
  exists(select 1 from public.marketing_story_previews sp where sp.id=a.story_id and sp.status='needs_review');
 for s in
  select * from public.marketing_story_previews
  where status='scheduled' and scheduled_for<=now()
  order by scheduled_for,id limit 10
  for update skip locked
 loop
  if (now() at time zone 'Asia/Seoul')::date<>s.preview_date_kst
    or not roundy_private.marketing_story_source_valid(s) then
   update public.marketing_story_previews set status='manual_ready',
    error_code='STORY_SOURCE_OR_DATE_CHANGED',
    error_message='The approved Feed or preview day changed. Automatic publishing disabled.',
    updated_at=now() where id=s.id;
   continue;
  end if;
  if exists(select 1 from public.marketing_story_publish_attempts where story_id=s.id) then
   update public.marketing_story_previews set status='needs_review',
    error_code='STORY_ALREADY_ATTEMPTED',
    error_message='The Story has an existing publishing attempt; duplicate publish blocked.',
    updated_at=now() where id=s.id;
   continue;
  end if;
  update public.marketing_story_previews set status='publishing',
   started_at=now(),updated_at=now()
  where id=s.id returning * into s;
  insert into public.marketing_story_publish_attempts(story_id,state)
   values(s.id,'claimed');
  claimed:=claimed||jsonb_build_array(to_jsonb(s));
 end loop;
 return claimed;
end;$$;
revoke all on function public.claim_marketing_story_previews() from public,anon,authenticated;
grant execute on function public.claim_marketing_story_previews() to service_role;
