-- Both manual approval actions allocate from the SAME global KST Feed ledger.
-- Preserve existing approval and preflight RPC names, locks and human approval flow.
create or replace function public.approve_marketing_draft(
 p_id uuid,p_revision integer,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
 d public.instagram_post_drafts;
 r public.marketing_runs;
 slot public.marketing_feed_schedule_slots;
 missed boolean;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_id for update;
 if not found or d.status<>'needs_approval' or d.revision is distinct from p_revision
 then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if p_actor is null then raise exception 'ADMIN_APPROVAL_REQUIRED'; end if;
 if exists(select 1 from public.marketing_generation_jobs
   where draft_id=p_id and status='running' and created_at>now()-interval '5 minutes')
 then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 if trim(d.caption)='' or cardinality(d.images)=0
 then raise exception 'COMPLETE_COPY_AND_IMAGES_FIRST'; end if;
 slot:=roundy_private.reserve_marketing_feed_slot(p_id,false);
 missed:=now()>(
   ((now() at time zone 'Asia/Seoul')::date+
     coalesce(d.window_end_kst,d.recommended_time_kst,'20:00'::time))
   at time zone 'Asia/Seoul'
 );
 insert into public.marketing_runs(channel,snapshot,request_key,scheduled_for)
 values('instagram',jsonb_build_object(
  'channel','instagram','name','Daily Instagram - '||d.draft_date,'title','',
  'caption',d.caption,'cta',d.cta,'destination_url',d.destination_url,'images',to_jsonb(d.images),
  'draft_id',d.id,'event_id',d.event_id,'content_mode',d.content_mode,
  'draft_kind',d.draft_kind,'growth_topic_type',d.growth_topic_type,
  'content_pillar',d.content_pillar,'content_language',d.content_language,
  'eligible_for_optimization',not missed,'auto_generated',true,
  'feed_sequence',slot.sequence_number,'feed_date_kst',slot.slot_date,
  'feed_slot_position',slot.slot_position,'feed_carousel_count',slot.slide_count
 ),'draft:'||d.id||':'||d.revision,slot.scheduled_for)
 returning * into r;
 update public.marketing_feed_schedule_slots set run_id=r.id,updated_at=now()
 where draft_id=d.id and run_id is null;
 update public.instagram_post_drafts
 set status='scheduled',approved_at=now(),approved_by=p_actor,marketing_run_id=r.id,
  scheduled_for=slot.scheduled_for,eligible_for_optimization=not missed,updated_at=now()
 where id=p_id returning * into d;
 return jsonb_build_object('draft',to_jsonb(d),'run',to_jsonb(r),
  'missed_window',missed,'feed_date_kst',slot.slot_date,
  'feed_sequence',slot.sequence_number,'slot_position',slot.slot_position,'deferred',
  (slot.slot_date>(now() at time zone 'Asia/Seoul')::date));
end;$$;
revoke all on function public.approve_marketing_draft(uuid,integer,uuid)
 from public,anon,authenticated;
grant execute on function public.approve_marketing_draft(uuid,integer,uuid) to service_role;

-- Explicit publish-now respects the same Feed/day limit. If today's slots are full,
-- it becomes a future scheduled run and the API must NOT invoke the worker today.
create or replace function public.publish_marketing_draft_now(
 p_id uuid,p_revision integer,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
 d public.instagram_post_drafts;
 r public.marketing_runs;
 slot public.marketing_feed_schedule_slots;
 defer_now boolean;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_id for update;
 if not found or d.status<>'needs_approval' or d.revision is distinct from p_revision
 then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if p_actor is null then raise exception 'ADMIN_APPROVAL_REQUIRED'; end if;
 if exists(select 1 from public.marketing_generation_jobs
   where draft_id=p_id and status='running' and created_at>now()-interval '5 minutes')
 then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 if trim(d.caption)='' or cardinality(d.images)=0
 then raise exception 'COMPLETE_COPY_AND_IMAGES_FIRST'; end if;
 slot:=roundy_private.reserve_marketing_feed_slot(p_id,true);
 defer_now:=slot.scheduled_for>now()+interval '15 seconds';
 insert into public.marketing_runs(channel,snapshot,request_key,scheduled_for)
 values('instagram',jsonb_build_object(
  'channel','instagram','name','Immediate Instagram - '||d.draft_date,'title','',
  'caption',d.caption,'cta',d.cta,'destination_url',d.destination_url,'images',to_jsonb(d.images),
  'draft_id',d.id,'event_id',d.event_id,'content_mode',d.content_mode,
  'draft_kind',d.draft_kind,'growth_topic_type',d.growth_topic_type,
  'content_pillar',d.content_pillar,'content_language',d.content_language,
  'eligible_for_optimization',false,'auto_generated',false,'publish_mode',
  case when defer_now then 'deferred_immediate' else 'immediate' end,
  'feed_sequence',slot.sequence_number,'feed_date_kst',slot.slot_date,
  'feed_slot_position',slot.slot_position,'feed_carousel_count',slot.slide_count
 ),'draft-now:'||d.id||':'||d.revision,slot.scheduled_for)
 returning * into r;
 update public.marketing_feed_schedule_slots set run_id=r.id,updated_at=now()
 where draft_id=d.id and run_id is null;
 update public.instagram_post_drafts
 set status='scheduled',approved_at=now(),approved_by=p_actor,marketing_run_id=r.id,
  scheduled_for=slot.scheduled_for,eligible_for_optimization=false,updated_at=now()
 where id=p_id returning * into d;
 return jsonb_build_object('draft',to_jsonb(d),'run',to_jsonb(r),
  'publish_mode',case when defer_now then 'deferred_immediate' else 'immediate' end,
  'deferred',defer_now,'feed_date_kst',slot.slot_date,
  'feed_sequence',slot.sequence_number,'slot_position',slot.slot_position);
end;$$;
revoke all on function public.publish_marketing_draft_now(uuid,integer,uuid)
 from public,anon,authenticated;
grant execute on function public.publish_marketing_draft_now(uuid,integer,uuid) to service_role;
