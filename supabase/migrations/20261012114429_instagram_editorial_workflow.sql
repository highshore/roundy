-- Forward-only: no historical rows, approvals or schedules are changed.
-- Ledger slide_count remains the reserved STORY count; images include the brand card.
begin;
create or replace function roundy_private.reserve_marketing_feed_slot(
 p_draft uuid,p_immediate boolean default false)
returns public.marketing_feed_schedule_slots
language plpgsql security invoker set search_path=''
as $$
declare
 d public.instagram_post_drafts;
 s public.marketing_automation_settings;
 booked public.marketing_feed_schedule_slots;
 current_date_kst date:=(now() at time zone 'Asia/Seoul')::date;
 preferred_time time;
 candidate date;
 candidate_at timestamptz;
 n_daily integer;
 n_prior integer;
 n_reserved integer;
 seq bigint;
 alt_seq bigint;
 expected integer;
 total_count integer;
 i integer;
 found_slot boolean:=false;
begin
 perform pg_advisory_xact_lock(70361005);
 perform pg_advisory_xact_lock(20261010155000);
 if p_draft is null then raise exception 'FEED_DRAFT_REQUIRED'; end if;
 select * into booked from public.marketing_feed_schedule_slots where draft_id=p_draft;
 if found then return booked; end if;
 select * into d from public.instagram_post_drafts
  where id=p_draft and status='needs_approval' for update;
 if not found then raise exception 'FEED_DRAFT_NOT_APPROVABLE'; end if;
 select * into s from public.marketing_automation_settings where singleton=true;
 if not found then raise exception 'FEED_SETTINGS_MISSING'; end if;
 if coalesce(d.content_document->'carousel_template'->>'mode','')<>s.carousel_mode
 then raise exception 'CAROUSEL_MODE_CHANGED_REGENERATION_REQUIRED: 현재 마케팅 설정에 맞는 카드뉴스를 다시 생성하세요.'; end if;
 n_daily:=greatest(1,least(10,coalesce(s.feed_daily_max_posts,1)));
 select coalesce(max(sequence_number),0)+1 into seq from public.marketing_feed_schedule_slots;
 alt_seq:=null;
 if coalesce(d.content_document->'carousel_template'->>'mode','')='alternating' then
  select coalesce(max(alternating_sequence),0)+1 into alt_seq
  from public.marketing_feed_schedule_slots;
  expected:=case when mod(alt_seq,2)=1 then 3 else 5 end;
 else
  expected:=case when d.content_document->>'editorial_workflow_version'='1'
    and d.content_document->>'story_length_source'='admin'
    then (d.content_document->'carousel_template'->>'slide_count')::integer else 5 end;
 end if;
 if expected not in (3,5) then raise exception 'INVALID_STORY_CARD_COUNT'; end if;
 total_count:=expected+case when d.content_document->>'brand_outro_version'='1' then 1 else 0 end;
 if total_count<>expected and (
   d.carousel_slides->(total_count-1)->>'role' is distinct from 'brand_outro'
   or d.carousel_slides->(total_count-2)->>'role' is distinct from 'editorial_closing'
 ) then raise exception 'ROUNDY_OUTRO_STORY_CONTRACT_INVALID'; end if;
 if coalesce((d.content_document->'carousel_template'->>'slide_count')::integer,0)<>expected
  or coalesce(jsonb_array_length(d.carousel_slides),0)<>total_count
  or coalesce(cardinality(d.images),0)<>total_count
 then
  raise exception 'CAROUSEL_FINAL_ORDER_REQUIRES_REGENERATION: 예약 순서의 %장 카드와 현재 콘텐츠가 일치하지 않습니다.',expected;
 end if;
 preferred_time:=coalesce(d.recommended_time_kst,s.daily_time_kst,'20:00'::time);
 candidate:=case when p_immediate then current_date_kst else greatest(current_date_kst,coalesce((d.scheduled_for at time zone 'Asia/Seoul')::date,current_date_kst)) end;
 for i in 0..365 loop
  candidate_at:=(candidate+preferred_time) at time zone 'Asia/Seoul';
  if p_immediate and candidate=current_date_kst then candidate_at:=now(); end if;
  if candidate=current_date_kst and candidate_at<now()+interval '30 seconds' and not p_immediate then
   candidate:=candidate+1;continue;
  end if;
  select count(*) into n_reserved from public.marketing_feed_schedule_slots where slot_date=candidate;
  -- Published legacy posts still consume their KST day quota.
  select count(*) into n_prior from public.marketing_runs r
   where r.channel='instagram'
    and coalesce(r.snapshot->>'media_kind','feed')<>'reel'
    and (r.scheduled_for at time zone 'Asia/Seoul')::date=candidate
    and r.status not in ('skipped')
    and not exists(select 1 from public.marketing_feed_schedule_slots slot where slot.run_id=r.id);
  if n_reserved+n_prior<n_daily then found_slot:=true;exit;end if;
  candidate:=candidate+1;
 end loop;
 if not found_slot then raise exception 'FEED_SCHEDULE_HORIZON_EXCEEDED'; end if;
 booked.draft_id:=d.id;
 booked.sequence_number:=seq;
 booked.alternating_sequence:=alt_seq;
 booked.slot_date:=candidate;
 booked.slot_position:=n_reserved+n_prior+1;
 booked.scheduled_for:=candidate_at;
 booked.carousel_mode:=coalesce(d.content_document->'carousel_template'->>'mode','fixed');
 booked.slide_count:=expected;
 insert into public.marketing_feed_schedule_slots (
  draft_id,sequence_number,alternating_sequence,slot_date,slot_position,
  scheduled_for,carousel_mode,slide_count
 ) values (booked.draft_id,booked.sequence_number,booked.alternating_sequence,
  booked.slot_date,booked.slot_position,booked.scheduled_for,booked.carousel_mode,booked.slide_count)
 returning * into booked;
 -- A generation-time sequence is provisional. The final approved Feed order
 -- and the reserved local publication date are authoritative.
 update public.marketing_carousel_slot_reservations
  set planned_for=booked.scheduled_for where draft_id=d.id;
 return booked;
end;
$$;
revoke all on function roundy_private.reserve_marketing_feed_slot(uuid,boolean)
 from public,anon,authenticated;
grant execute on function roundy_private.reserve_marketing_feed_slot(uuid,boolean)
 to service_role;

commit;
