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
