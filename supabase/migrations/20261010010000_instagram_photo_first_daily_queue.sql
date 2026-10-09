-- Editorial-first Instagram feed settings and fail-closed publication protection.
ALTER TABLE public.marketing_automation_settings
 ADD COLUMN IF NOT EXISTS max_feed_posts_per_kst_day smallint NOT NULL DEFAULT 1 CHECK (max_feed_posts_per_kst_day BETWEEN 1 AND 3),
 ADD COLUMN IF NOT EXISTS carousel_slide_mode text NOT NULL DEFAULT 'fixed' CHECK (carousel_slide_mode IN ('fixed','alternating')),
 ADD COLUMN IF NOT EXISTS carousel_default_slides smallint NOT NULL DEFAULT 5 CHECK (carousel_default_slides IN (3,5)),
 ADD COLUMN IF NOT EXISTS min_real_photos_per_five smallint NOT NULL DEFAULT 3 CHECK (min_real_photos_per_five BETWEEN 3 AND 4),
 ADD COLUMN IF NOT EXISTS ai_cover_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS answer_first_enabled boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS story_preview_enabled boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS marketing_title_font_px smallint NOT NULL DEFAULT 76 CHECK (marketing_title_font_px BETWEEN 62 AND 104),
 ADD COLUMN IF NOT EXISTS marketing_body_font_px smallint NOT NULL DEFAULT 40 CHECK (marketing_body_font_px BETWEEN 32 AND 56);
ALTER TABLE public.instagram_post_drafts
 ADD COLUMN IF NOT EXISTS headline_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
 ADD COLUMN IF NOT EXISTS selected_headline text,
 ADD COLUMN IF NOT EXISTS publication_validation jsonb NOT NULL DEFAULT '{}'::jsonb;

-- The first and last cards are reserved for the cover and Roundy CTA.
-- Five-card carousel: the three middle information slides require approved Pexels.
CREATE OR REPLACE FUNCTION public.guard_marketing_stock_photo_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE n integer; expected integer[]; valid_count integer;
BEGIN
 IF new.status IN ('approved','scheduled','publishing','published')
    AND (tg_op='INSERT' OR new.status IS DISTINCT FROM old.status) THEN
  n:=jsonb_array_length(coalesce(new.carousel_slides,'[]'::jsonb));
  IF n IN (3,5) THEN
   IF new.visual_source <> 'pexels' THEN RAISE EXCEPTION 'REVIEWED_PHOTOGRAPHY_REQUIRED_FOR_CAROUSEL'; END IF;
   IF coalesce(cardinality(new.images),0)<>n THEN RAISE EXCEPTION 'CAROUSEL_CARD_COUNT_MISMATCH'; END IF;
   expected:=CASE WHEN n=5 THEN ARRAY[1,2,3] ELSE ARRAY[1] END;
   SELECT count(*) INTO valid_count FROM public.marketing_draft_photos p
     JOIN public.marketing_photo_assets a ON a.id=p.asset_id
    WHERE p.draft_id=new.id AND p.slot=ANY(expected)
      AND a.review_status='approved' AND a.storage_path IS NOT NULL
      AND coalesce(a.source_url,'')<>'' AND coalesce(a.license_name,'')<>''
      AND coalesce(a.license_url,'')<>'' AND a.license_checked_at IS NOT NULL
      AND coalesce(a.content_sha256,'')<>'';
   IF valid_count<>cardinality(expected)
      OR (SELECT count(*) FROM public.marketing_draft_photos WHERE draft_id=new.id)<>cardinality(expected)
      THEN RAISE EXCEPTION 'STOCK_PHOTOS_NOT_APPROVED_OR_RENDERED'; END IF;
  ELSIF new.visual_source='pexels' THEN
    RAISE EXCEPTION 'CAROUSEL_SLIDE_COUNT_UNSUPPORTED';
  END IF;
 END IF;
 RETURN new;
END $$;

-- The database allocates publication dates under a transaction advisory lock.
-- Stories and Reels are exempt from the Instagram Feed limit.
CREATE OR REPLACE FUNCTION roundy_private.assign_instagram_feed_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE proposed date; original date; capacity integer; used integer; posting_time time; attempt integer:=0;
BEGIN
 IF new.channel<>'instagram' OR coalesce(new.snapshot->>'media_kind','feed') IN ('reel','story')
    OR coalesce(new.status,'queued')<>'queued' THEN RETURN new; END IF;
 PERFORM pg_advisory_xact_lock(70361005);
 SELECT max_feed_posts_per_kst_day,daily_time_kst INTO capacity,posting_time
 FROM public.marketing_automation_settings WHERE singleton=true;
 capacity:=coalesce(capacity,1);posting_time:=coalesce(posting_time,'20:00'::time);
 original:=greatest((now() AT TIME ZONE 'Asia/Seoul')::date,
                     (coalesce(new.scheduled_for,now()) AT TIME ZONE 'Asia/Seoul')::date);
 proposed:=original;
 LOOP
  SELECT count(*) INTO used FROM public.marketing_runs existing
  WHERE existing.id IS DISTINCT FROM new.id AND existing.channel='instagram'
    AND coalesce(existing.snapshot->>'media_kind','feed')='feed'
    AND existing.status IN ('queued','publishing','needs_review','sent')
    AND ((existing.scheduled_for AT TIME ZONE 'Asia/Seoul')::date=proposed
      OR (existing.status='sent' AND (existing.finished_at AT TIME ZONE 'Asia/Seoul')::date=proposed));
  EXIT WHEN used<capacity;
  proposed:=proposed+1;attempt:=attempt+1;
  IF attempt>365 THEN RAISE EXCEPTION 'INSTAGRAM_FEED_QUEUE_HORIZON_EXCEEDED';END IF;
 END LOOP;
 IF proposed<>original THEN
  new.scheduled_for:=(proposed+posting_time) AT TIME ZONE 'Asia/Seoul';
  new.snapshot:=jsonb_set(coalesce(new.snapshot,'{}'::jsonb),'{feed_deferred_by_quota}','true'::jsonb,true);
 END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS assign_instagram_feed_day ON public.marketing_runs;
CREATE TRIGGER assign_instagram_feed_day BEFORE INSERT OR UPDATE OF scheduled_for ON public.marketing_runs
FOR EACH ROW EXECUTE FUNCTION roundy_private.assign_instagram_feed_day();

-- The approval RPC must use the date allocated by the queue trigger.
CREATE OR REPLACE FUNCTION public.approve_marketing_draft(p_id uuid, p_revision integer, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.instagram_post_drafts; r public.marketing_runs; scheduled timestamptz; missed boolean;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_id for update;
 if not found or d.status<>'needs_approval' or d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if exists(select 1 from public.marketing_generation_jobs where draft_id=p_id and status='running' and created_at>now()-interval '5 minutes') then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 if trim(d.caption)='' or cardinality(d.images)=0 then raise exception 'COMPLETE_COPY_AND_IMAGES_FIRST'; end if;
 missed:=now()>((d.draft_date+d.window_end_kst) at time zone 'Asia/Seoul');
 scheduled:=case when d.scheduled_for>now()+interval '1 minute' then d.scheduled_for else now()+case when missed then interval '10 minutes' else interval '5 minutes' end end;
 insert into public.marketing_runs(channel,snapshot,request_key,scheduled_for)
 values(
  'instagram',
  jsonb_build_object(
   'channel','instagram','name','Daily Instagram - '||d.draft_date,'title','',
   'caption',d.caption,'cta',d.cta,'destination_url',d.destination_url,'images',to_jsonb(d.images),
   'draft_id',d.id,'event_id',d.event_id,'content_mode',d.content_mode,'draft_kind',d.draft_kind,
   'growth_topic_type',d.growth_topic_type,'content_pillar',d.content_pillar,'content_language',d.content_language,
   'eligible_for_optimization',not missed,'auto_generated',true
  ),
  'draft:'||d.id||':'||d.revision,
  scheduled
 ) returning * into r;
 update public.instagram_post_drafts
 set status='scheduled',approved_at=now(),approved_by=p_actor,marketing_run_id=r.id,scheduled_for=r.scheduled_for,
     eligible_for_optimization=not missed,updated_at=now()
 where id=p_id returning * into d;
 return jsonb_build_object('draft',to_jsonb(d),'run',to_jsonb(r),'missed_window',missed);
end $function$
;

CREATE OR REPLACE FUNCTION public.publish_marketing_draft_now(p_id uuid, p_revision integer, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.instagram_post_drafts; r public.marketing_runs;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_id for update;
 if not found or d.status<>'needs_approval' or d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if exists(select 1 from public.marketing_generation_jobs where draft_id=p_id and status='running' and created_at>now()-interval '5 minutes') then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 if trim(d.caption)='' or cardinality(d.images)=0 then raise exception 'COMPLETE_COPY_AND_IMAGES_FIRST'; end if;
 insert into public.marketing_runs(channel,snapshot,request_key,scheduled_for)
 values(
  'instagram',
  jsonb_build_object(
   'channel','instagram','name','Immediate Instagram - '||d.draft_date,'title','',
   'caption',d.caption,'cta',d.cta,'destination_url',d.destination_url,'images',to_jsonb(d.images),
   'draft_id',d.id,'event_id',d.event_id,'content_mode',d.content_mode,'draft_kind',d.draft_kind,
   'growth_topic_type',d.growth_topic_type,'content_pillar',d.content_pillar,'content_language',d.content_language,
   'eligible_for_optimization',false,'auto_generated',false,'publish_mode','immediate'
  ),
  'draft-now:'||d.id||':'||d.revision,
  now()
 ) returning * into r;
 update public.instagram_post_drafts
 set status='scheduled',approved_at=now(),approved_by=p_actor,marketing_run_id=r.id,
     scheduled_for=r.scheduled_for,eligible_for_optimization=false,updated_at=now()
 where id=p_id returning * into d;
 return jsonb_build_object('draft',to_jsonb(d),'run',to_jsonb(r),'publish_mode','immediate');
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_marketing()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.marketing_templates; r public.marketing_runs;
 local_now timestamp:=now() at time zone 'Asia/Seoul';
 due timestamptz;
 result jsonb:='[]';
begin
 perform pg_advisory_xact_lock(hashtextextended('roundy-marketing-claims',0));
 update public.marketing_runs set status='needs_review',
  message='Publisher timed out. Check the channel before retrying.',finished_at=now()
 where status='publishing' and started_at<now()-interval '10 minutes';
 for t in select * from public.marketing_templates where enabled
   and extract(dow from local_now)::int=any(days) loop
  due=(local_now::date+t.time_kst) at time zone 'Asia/Seoul';
  if due<=now() and due>now()-interval '10 minutes' and t.updated_at<=due then
   insert into public.marketing_runs(template_id,channel,snapshot,request_key,scheduled_for)
   values(t.id,t.channel,to_jsonb(t),'schedule:'||t.id::text||':'||due::text,due)
   on conflict(request_key) do nothing;
  end if;
 end loop;
 for r in select * from public.marketing_runs where status='queued'
 and scheduled_for<=now() order by scheduled_for limit 10 for update skip locked loop
  if exists(select 1 from public.marketing_runs
   where channel=r.channel and status in('publishing','needs_review')) then continue;end if;
  if exists(select 1 from public.marketing_runs where channel=r.channel
   and status='sent' and finished_at>now()-interval '24 hours'
   and (r.channel='koreapas' or
     (coalesce(snapshot->>'media_kind','feed')=coalesce(r.snapshot->>'media_kind','feed')
      and case when r.snapshot->>'media_kind'='reel'
        then snapshot->>'video_storage_path'=r.snapshot->>'video_storage_path'
        else snapshot->>'caption'=r.snapshot->>'caption'
         and snapshot->'images'=r.snapshot->'images'
      end))
  ) then
   update public.marketing_runs set status='skipped',
   message='Recent duplicate or channel posting interval (24 hours).',finished_at=now()
   where id=r.id;continue;
  end if;
  -- Claim-time protection covers already queued legacy runs and midnight drift.
  if r.channel='instagram' and coalesce(r.snapshot->>'media_kind','feed')='feed' then
   if (select count(*) from public.marketing_runs other
       where other.id<>r.id and other.channel='instagram'
        and coalesce(other.snapshot->>'media_kind','feed')='feed'
        and other.status in ('publishing','needs_review','sent')
        and ((other.scheduled_for at time zone 'Asia/Seoul')::date=local_now::date
          or (other.status='sent' and (other.finished_at at time zone 'Asia/Seoul')::date=local_now::date)))
     >= (select coalesce(max_feed_posts_per_kst_day,1) from public.marketing_automation_settings where singleton=true)
   then
    update public.marketing_runs set scheduled_for=((local_now::date+1)
     +(select daily_time_kst from public.marketing_automation_settings where singleton=true))
      at time zone 'Asia/Seoul',
      message='KST daily feed quota reached. Automatically rescheduled.'
     where id=r.id;
    continue;
   end if;
  end if;
  update public.marketing_runs set status='publishing',started_at=now()
  where id=r.id returning * into r;
  result=result||jsonb_build_array(to_jsonb(r));
 end loop;
 return result;
end;
$function$
;
