-- KST Feed reservation ledger. Existing drafts and published runs are never backfilled or altered.
create table if not exists public.marketing_feed_schedule_slots (
  draft_id uuid primary key references public.instagram_post_drafts(id) on delete restrict,
  run_id uuid unique references public.marketing_runs(id) on delete restrict,
  sequence_number bigint not null unique check (sequence_number > 0),
  alternating_sequence bigint unique check (alternating_sequence > 0),
  slot_date date not null,
  slot_position smallint not null check (slot_position between 1 and 10),
  scheduled_for timestamptz not null,
  carousel_mode text not null check (carousel_mode in ('fixed','alternating')),
  slide_count smallint not null check (slide_count in (3,5)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slot_date,slot_position)
);
create index if not exists marketing_feed_slots_schedule_idx
  on public.marketing_feed_schedule_slots(slot_date,sequence_number);
alter table public.marketing_feed_schedule_slots enable row level security;
revoke all on public.marketing_feed_schedule_slots from public,anon,authenticated;
grant select,insert,update on public.marketing_feed_schedule_slots to service_role;

-- A draft can create at most one Feed run, across revisions and request keys.
-- Reel Studio uses a separate review/publish contract and is deliberately excluded.
create unique index if not exists marketing_instagram_feed_draft_once
 on public.marketing_runs ((snapshot->>'draft_id'))
 where channel='instagram' and snapshot ? 'draft_id'
   and coalesce(snapshot->>'media_kind','feed')<>'reel';

create table if not exists public.marketing_feed_publish_attempts (
 id bigint generated always as identity primary key,
 run_id uuid not null references public.marketing_runs(id) on delete restrict,
 attempt_no integer not null check (attempt_no between 1 and 50),
 state text not null check (state in ('publishing','sent','failed','needs_review')),
 started_at timestamptz not null default now(),
 external_requested_at timestamptz,
 finished_at timestamptz,
 error_message text,
 external_id text,
 created_at timestamptz not null default now(),
 unique (run_id,attempt_no)
);
create unique index if not exists marketing_feed_one_unfinished_attempt
 on public.marketing_feed_publish_attempts(run_id) where finished_at is null;
alter table public.marketing_feed_publish_attempts enable row level security;
revoke all on public.marketing_feed_publish_attempts from public,anon,authenticated;
grant select,insert,update on public.marketing_feed_publish_attempts to service_role;

create table if not exists public.marketing_feed_retry_reviews (
 run_id uuid not null references public.marketing_runs(id) on delete restrict,
 attempt_no integer not null,
 reviewed_by uuid not null references auth.users(id) on delete restrict,
 confirmed_not_published boolean not null check (confirmed_not_published),
 review_note text not null check (length(trim(review_note)) between 12 and 500),
 reviewed_at timestamptz not null default now(),
 primary key(run_id,attempt_no),
 foreign key(run_id,attempt_no)
  references public.marketing_feed_publish_attempts(run_id,attempt_no) on delete restrict
);
alter table public.marketing_feed_retry_reviews enable row level security;
revoke all on public.marketing_feed_retry_reviews from public,anon,authenticated;
grant select,insert on public.marketing_feed_retry_reviews to service_role;

-- Reserve a stable KST day/position once, serialized with other approvals and claims.
-- Deferring publication must never delete a run or erase earlier attempts.
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
  expected:=5;
 end if;
 if coalesce((d.content_document->'carousel_template'->>'slide_count')::integer,0)<>expected
  or coalesce(jsonb_array_length(d.carousel_slides),0)<>expected
  or coalesce(cardinality(d.images),0)<>expected
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
comment on table public.marketing_feed_schedule_slots is
 'KST publication date and serial approval order. Scheduled records are retained after failure; each date has at most configured capacity.';
