-- Fully rolled-back integration test: no Meta network calls, no durable draft/photo/run changes.
do $$
declare
 ids uuid[]:='{}'; rids uuid[]:='{}';
 actor uuid; d uuid; a uuid; manifest jsonb; quality jsonb;
 dates date[]; info jsonb; msg text; i integer; j integer;
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
  raise exception 'EXPECTED_FULL_ROLLBACK';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'EXPECTED_FULL_ROLLBACK' then
   raise exception 'THREE_POST_DB_TEST_FAILED: %',msg;end if;
 end;
end $$;