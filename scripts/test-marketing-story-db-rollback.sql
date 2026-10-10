-- Fully rolled-back integration test: no Meta network calls, no durable draft/photo/run changes.
do $$
declare
 ids uuid[]:='{}'; rids uuid[]:='{}';
 actor uuid; d uuid; a uuid; manifest jsonb; quality jsonb;
 dates date[]; info jsonb; claimed jsonb; claimed_stories jsonb; story_row jsonb; story_id uuid; msg text; i integer; j integer; attempts integer;
 today_kst date:=(now() at time zone 'Asia/Seoul')::date;
 slides jsonb:='[{"role":"cover","title":"Result"},{"role":"context","title":"Context"},{"role":"detail","title":"Detail"},{"role":"value","title":"Value"},{"role":"cta","title":"Follow Roundy"}]'::jsonb;
begin
 select approved_by into actor from public.instagram_post_drafts where approved_by is not null limit 1;
 if actor is null then raise exception 'NO_TEST_ADMIN';end if;
 begin
  for i in 1..3 loop
   insert into public.instagram_post_drafts(
    draft_date,draft_role,content_pillar,caption,cta,destination_url,images,
    status,revision,recommended_time_kst,window_start_kst,window_end_kst,
    content_document,carousel_slides,quality_report,quality_revision,
    content_mode,draft_kind,visual_source
   ) values(
    today_kst,'candidate','concept','Mock approved Feed '||i::text||' @roundy.meet roundy.team',
    'See Roundy','https://roundy.team',
    array['https://mock.roundy.team/0.jpg','https://mock.roundy.team/1.jpg',
     'https://mock.roundy.team/2.jpg','https://mock.roundy.team/3.jpg',
     'https://mock.roundy.team/4.jpg'],'needs_approval',1,
    '20:00'::time,'19:30'::time,'20:30'::time,
    jsonb_build_object('schema_version',2,'answer_first',true,
     'thumbnail_render_pending',false,
     'carousel_template',jsonb_build_object('mode','fixed','slide_count',5),
     'slides',slides),
    slides,jsonb_build_object('version',2,'status','unchecked','issues','[]'::jsonb),
    null,'prelaunch','brand','pexels'
   ) returning id into d;
   ids:=array_append(ids,d);
   for j in 0..2 loop
    insert into public.marketing_photo_assets(
     provider,provider_photo_id,source_url,image_url,preview_url,
     photographer,photographer_url,width,height,topic_key,license_name,license_url,
     license_checked_at,review_status,reviewed_by,reviewed_at,storage_path,
     content_sha256,perceptual_hash
    ) values('pexels',(9200000000+i*3+j)::text,
     'https://www.pexels.com/photo/mock-'||i::text||'-'||j::text||'/',
     'https://images.pexels.com/photos/'||(9200000000+i*3+j)::text||'/photo.jpeg',
     'https://images.pexels.com/photos/'||(9200000000+i*3+j)::text||'/preview.jpeg',
     'Mock photographer','https://www.pexels.com/@mock/',1080,1350,'prelaunch',
     'Pexels License','https://www.pexels.com/license/',now(),'approved',actor,now(),
     'stock/pexels/mock-'||gen_random_uuid()::text||'.jpg',repeat('a',64),repeat('a',16))
    returning id into a;
    insert into public.marketing_draft_photos(draft_id,asset_id,slot) values(d,a,j);
   end loop;
   select jsonb_agg(jsonb_build_object(
    'slot',p.slot,'asset_id',p.asset_id::text,'source_url',coalesce(ph.source_url,''),
    'license_url',coalesce(ph.license_url,''),'review_status',coalesce(ph.review_status,''),
    'reviewed_by',coalesce(ph.reviewed_by::text,''),'reviewed',ph.reviewed_at is not null,
    'license_checked',ph.license_checked_at is not null,
    'sha256',coalesce(ph.content_sha256,''),'storage_path',coalesce(ph.storage_path,'')
   ) order by p.slot) into manifest
   from public.marketing_draft_photos p
   join public.marketing_photo_assets ph on ph.id=p.asset_id
   where p.draft_id=d;
   quality:=jsonb_build_object('version',2,'status','passed','issues','[]'::jsonb,
    'preflight',jsonb_build_object('version',1,'status','passed','revision',1,
    'slide_count',5,'min_real_photos',3,'photo_manifest',manifest,
    'issues','[]'::jsonb,'checks',jsonb_build_array(
     jsonb_build_object('passed',true),jsonb_build_object('passed',true),
     jsonb_build_object('passed',true),jsonb_build_object('passed',true),
     jsonb_build_object('passed',true),jsonb_build_object('passed',true),
     jsonb_build_object('passed',true))));
   update public.instagram_post_drafts
    set quality_report=quality,quality_revision=1 where id=d;
   info:=public.approve_marketing_draft(d,1,actor);
   if info->'run'->>'status'<>'queued' then raise exception 'UNEXPECTED_RUN_STATE';end if;
   rids:=array_append(rids,(info->'run'->>'id')::uuid);
  end loop;
  select array_agg((slot.scheduled_for at time zone 'Asia/Seoul')::date
    order by slot.sequence_number) into dates
   from public.marketing_feed_schedule_slots slot where slot.draft_id=any(ids);
  if array_length(dates,1)<>3 or dates[2]<>dates[1]+1
    or dates[3]<>dates[2]+1 then
   raise exception 'THREE_APPROVALS_NOT_SPREAD: %',dates;end if;
  if (select count(*) from public.marketing_runs
      where id=any(rids) and status='queued')<>3
  then raise exception 'APPROVED_POSTS_LOST_FROM_QUEUE';end if;
  -- Story-only positive path. Uses a Feed already approved for tomorrow and
  -- never makes a real Meta request. All rows are discarded by this DO block.
  if (select (scheduled_for at time zone 'Asia/Seoul')::date
      from public.marketing_runs where id=rids[2])=today_kst+1 then
   story_id:=gen_random_uuid();
   insert into public.marketing_story_previews(
    id,feed_run_id,feed_draft_id,feed_scheduled_for,feed_date_kst,
    preview_date_kst,source_cover_url,teaser_title,language,status,
    image_path,image_url
   ) select story_id,r.id,ids[2],r.scheduled_for,today_kst+1,today_kst,
     r.snapshot->'images'->>0,'내일 올라올 콘텐츠 미리보기','ko',
     'generated',
     'story-previews/'||story_id::text||'/'||gen_random_uuid()::text||'.jpg',
     'https://test-only.roundy.team/mock-story.jpg'
   from public.marketing_runs r where r.id=rids[2];
   begin
    perform public.schedule_marketing_story_preview(story_id,actor);
    raise exception 'UNAPPROVED_STORY_WAS_SCHEDULED';
   exception when others then
    get stacked diagnostics msg=message_text;
    if msg not like 'STORY_MUST_BE_APPROVED_FIRST%'
     then raise exception 'STORY_APPROVAL_GUARD_FAILED: %',msg;end if;
   end;
   story_row:=public.approve_marketing_story_preview(story_id,actor);
   if story_row->>'status'<>'approved'
    then raise exception 'STORY_APPROVAL_NOT_RECORDED';end if;
   story_row:=public.schedule_marketing_story_preview(story_id,actor);
   if story_row->>'status'<>'scheduled' then
    raise exception 'STORY_SCHEDULE_STATE_INCORRECT: %',story_row;end if;
   update public.marketing_story_previews set scheduled_for=now()-interval '1 minute'
    where id=story_id;
   claimed_stories:=public.claim_marketing_story_previews();
   if jsonb_array_length(claimed_stories)<>1
     or claimed_stories->0->>'id'<>story_id::text
   then raise exception 'STORY_WAS_NOT_CLAIMED_ONCE: %',claimed_stories;end if;
   if jsonb_array_length(public.claim_marketing_story_previews())<>0
   then raise exception 'DUPLICATE_STORY_CLAIMED';end if;
   if public.mark_marketing_story_external_attempt(story_id) is distinct from true
   then raise exception 'STORY_EXTERNAL_ATTEMPT_NOT_RECORDED';end if;
   update public.marketing_story_previews set status='needs_review',
    error_code='MOCK_PROVIDER_TIMEOUT',error_message='Simulated Meta uncertain outcome'
   where id=story_id;
   update public.marketing_story_publish_attempts set
    state='needs_review',finished_at=now(),error_code='MOCK_PROVIDER_TIMEOUT'
   where story_id=story_id;
   if jsonb_array_length(public.claim_marketing_story_previews())<>0
   then raise exception 'UNCONFIRMED_STORY_WAS_AUTO_RETRIED';end if;
  end if;
  -- Simulate a due Feed run WITHOUT calling the Instagram API.
  update public.marketing_runs set scheduled_for=now()-interval '1 minute'
   where id=rids[1];
  claimed:=public.claim_marketing();
  if jsonb_array_length(claimed)<>1
   or claimed->0->>'id' is distinct from rids[1]::text
   then raise exception 'DID_NOT_CLAIM_ONLY_FIRST_POST: %',claimed;end if;
  select count(*) into attempts from public.marketing_feed_publish_attempts
   where run_id=rids[1] and state='publishing';
  if attempts<>1 then raise exception 'ATTEMPT_HISTORY_NOT_CREATED';end if;
  if public.mark_marketing_feed_external_attempt(rids[1]) is distinct from true
   then raise exception 'EXTERNAL_ATTEMPT_MARKER_MISSING';end if;
  update public.marketing_runs set status='needs_review',
   message='Mock network timeout after Meta POST',finished_at=now() where id=rids[1];
  select count(*) into attempts from public.marketing_feed_publish_attempts
   where run_id=rids[1] and state='needs_review' and external_requested_at is not null
    and error_message like 'Mock network timeout%';
  if attempts<>1 then raise exception 'UNKNOWN_EXTERNAL_ATTEMPT_NOT_QUARANTINED';end if;
  if jsonb_array_length(public.claim_marketing())<>0
   then raise exception 'BLIND_AUTO_RETRY_WAS_ALLOWED';end if;
  begin
   perform public.retry_marketing_feed_after_review(
    rids[1],actor,false,'Mock checked Instagram profile; no post found');
   raise exception 'RETRY_WITHOUT_ATTESTATION_WAS_ALLOWED';
  exception when others then
   get stacked diagnostics msg=message_text;
   if msg not like 'CONFIRM_NOT_PUBLISHED_AND_REVIEW_NOTE_REQUIRED%'
    then raise exception 'UNEXPECTED_RETRY_CHECK: %',msg;end if;
  end;
  info:=public.retry_marketing_feed_after_review(
   rids[1],actor,true,'Mock admin checked Instagram account and verified no post');
  if (info->>'feed_date_kst')::date<=today_kst
    or info->'run'->>'status'<>'queued'
   then raise exception 'RECONCILED_RETRY_NOT_RESCHEDULED';end if;
  if (select count(*) from public.marketing_feed_retry_reviews where run_id=rids[1])<>1
   then raise exception 'ADMIN_RECONCILIATION_NOT_AUDITED';end if;
  if (select count(*) from public.marketing_feed_publish_attempts where run_id=rids[1])<>1
   then raise exception 'RETRY_CREATED_UNEXPECTED_EXTERNAL_ATTEMPT';end if;
  raise exception 'EXPECTED_FULL_ROLLBACK';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'EXPECTED_FULL_ROLLBACK' then
   raise exception 'THREE_POST_DB_TEST_FAILED: %',msg;end if;
 end;
end $$;