-- Integration QA ONLY. This entire DO block intentionally rolls back everything,
-- including the temporary Alternating settings, mock photos, drafts and runs.
-- It NEVER invokes a Supabase Edge Function or Instagram/Meta endpoint.
do $qa$
declare
 actor uuid; today_kst date:=(now() at time zone 'Asia/Seoul')::date;
 before_mode text; requested integer; seq bigint; i integer; j integer; count_cards integer;
 d uuid; photo uuid; approval jsonb; manifest jsonb; quality jsonb;
 slides jsonb; cards text[]; slots integer[];
 booked_dates date[]; booked_counts integer[]; booked_orders bigint[]; ids uuid[]:='{}';
 msg text;
begin
 select approved_by into actor from public.instagram_post_drafts where approved_by is not null limit 1;
 if actor is null then raise exception 'NO_ADMIN_ACTOR_FIXTURE';end if;
 begin
  select carousel_mode into before_mode from public.marketing_automation_settings where singleton=true;
  update public.marketing_automation_settings set carousel_mode='alternating',feed_daily_max_posts=1,
   carousel_min_real_photos_3=2,carousel_min_real_photos_5=3,carousel_answer_first_enabled=true
   where singleton=true;
  for i in 1..4 loop
   count_cards:=case when (i%2)=1 then 3 else 5 end;
   slides:=case when count_cards=3 then
    '[{"role":"cover","title":"성수 첫 데이트는 서울숲 산책부터","body":"실제 가기 전에 장소를 확인하세요."},
      {"role":"plan","title":"서울숲 산책으로 시작","body":"가까운 산책길에서 대화를 시작해보세요."},
      {"role":"cta","title":"Roundy에서 다음 만남","body":"Roundy에서 서로 대화할 시간을 찾아보세요."}]'::jsonb
   else
    '[{"role":"cover","title":"성수 첫 데이트는 서울숲 산책부터","body":"실제 가기 전에 장소를 확인하세요."},
      {"role":"scenario","title":"조용한 산책 코스","body":"사람이 붐비는 시간대를 피해보세요."},
      {"role":"etiquette","title":"걷는 속도를 맞추기","body":"편하게 이야기를 나눠보세요."},
      {"role":"plan","title":"다음 장소를 준비","body":"가까운 카페도 미리 확인하세요."},
      {"role":"cta","title":"Roundy에서 다음 만남","body":"Roundy에서 서로 대화할 시간을 찾아보세요."}]'::jsonb
   end;
   cards:=array(select 'https://mock.roundy.team/'||i::text||'-'||x::text||'.jpg'
    from generate_series(1,count_cards) x);
   insert into public.instagram_post_drafts(
    draft_date,draft_role,content_pillar,caption,cta,destination_url,images,
    status,revision,recommended_time_kst,window_start_kst,window_end_kst,
    scheduled_for,content_document,carousel_slides,quality_report,quality_revision,
    content_mode,draft_kind,visual_source
   ) values(
    today_kst,'candidate','concept','성수에서 즐기는 데이트 코스 '||i::text||E'\n@roundy.meet roundy.team',
    'Roundy 둘러보기','https://roundy.team',cards,'needs_approval',1,
    time '20:00',time '19:30',time '20:30',
    ((today_kst+1)+time '20:00') at time zone 'Asia/Seoul',
    jsonb_build_object('schema_version',2,'answer_first',true,'thumbnail_render_pending',false,
     'thumbnail_candidates',jsonb_build_array('성수 첫 데이트는 서울숲 산책부터',
      '성수에서 대화하는 산책 코스','성수 첫 만남은 걷기로 시작'),
     'carousel_template',jsonb_build_object('version',1,'mode','alternating',
      'slide_count',count_cards,'reservation_number',i,
      'title_font_size_px',72,'body_font_size_px',36),'slides',slides),
    slides,jsonb_build_object('version',2,'status','unchecked','issues','[]'::jsonb),
    null,'prelaunch','brand','pexels'
   ) returning id into d;
   ids:=array_append(ids,d);
   select public.reserve_marketing_carousel_slot(d) into seq;
   if seq<>i then raise exception 'PROVISIONAL_SEQUENCE_INVALID % != %',seq,i;end if;
   for j in 0..count_cards-2 loop
    if j >= (case when count_cards=3 then 2 else 3 end) then exit; end if;
    insert into public.marketing_photo_assets(provider,provider_photo_id,source_url,
     image_url,preview_url,photographer,photographer_url,width,height,topic_key,
     license_name,license_url,license_checked_at,review_status,reviewed_by,reviewed_at,
     storage_path,content_sha256,perceptual_hash)
    values('pexels',(9400000000+i*6+j)::text,
     'https://www.pexels.com/photo/mock-alt-'||i::text||'-'||j::text||'/',
     'https://images.pexels.com/photos/'||(9400000000+i*6+j)::text||'/photo.jpeg',
     'https://images.pexels.com/photos/'||(9400000000+i*6+j)::text||'/preview.jpeg',
     'QA photographer','https://www.pexels.com/@qa/',1080,1350,
     'prelaunch','Pexels License','https://www.pexels.com/license/',now(),
     'approved',actor,now(),'stock/pexels/qa-'||gen_random_uuid()::text||'.jpg',
     repeat('a',64),repeat('a',16)) returning id into photo;
    insert into public.marketing_draft_photos(draft_id,asset_id,slot) values(d,photo,j);
   end loop;
   select jsonb_agg(jsonb_build_object(
    'slot',p.slot,'asset_id',p.asset_id::text,'source_url',coalesce(a.source_url,''),
    'license_url',coalesce(a.license_url,''),'review_status',coalesce(a.review_status,''),
    'reviewed_by',coalesce(a.reviewed_by::text,''),'reviewed',a.reviewed_at is not null,
    'license_checked',a.license_checked_at is not null,
    'sha256',coalesce(a.content_sha256,''),'storage_path',coalesce(a.storage_path,''))
    order by p.slot) into manifest from public.marketing_draft_photos p
    join public.marketing_photo_assets a on a.id=p.asset_id where p.draft_id=d;
   quality:=jsonb_build_object('version',2,'status','passed','issues','[]'::jsonb,
    'preflight',jsonb_build_object('version',1,'status','passed','revision',1,
     'slide_count',count_cards,'min_real_photos',case when count_cards=3 then 2 else 3 end,
     'photo_manifest',manifest,'issues','[]'::jsonb,
     'checks',jsonb_build_array(jsonb_build_object('passed',true),jsonb_build_object('passed',true),
      jsonb_build_object('passed',true),jsonb_build_object('passed',true),
      jsonb_build_object('passed',true),jsonb_build_object('passed',true),
      jsonb_build_object('passed',true))));
   update public.instagram_post_drafts set quality_report=quality,quality_revision=1 where id=d;
   approval:=public.approve_marketing_draft(d,1,actor);
   if approval->'run'->>'status'<> 'queued' then raise exception 'ALT_APPROVAL_RUN_NOT_QUEUED';end if;
  end loop;
  select array_agg(slot.slide_count order by slot.sequence_number),
         array_agg(slot.alternating_sequence order by slot.sequence_number),
         array_agg(slot.slot_date order by slot.sequence_number)
   into booked_counts,booked_orders,booked_dates
   from public.marketing_feed_schedule_slots slot where slot.draft_id=any(ids);
  if booked_counts <> array[3,5,3,5] or booked_orders <> array[1,2,3,4]::bigint[]
  then raise exception 'ALT_FINAL_ORDER_WRONG: % %',booked_counts,booked_orders;end if;
  if booked_dates[2]<>booked_dates[1]+1 or booked_dates[3]<>booked_dates[2]+1
     or booked_dates[4]<>booked_dates[3]+1 then
    raise exception 'ALT_KST_DATE_CAP_BROKEN: %',booked_dates;end if;
  raise exception 'EXPECTED_FULL_QA_ROLLBACK';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg <> 'EXPECTED_FULL_QA_ROLLBACK' then raise exception 'ALT_QA_FAILED: %',msg;end if;
 end;
end
$qa$;