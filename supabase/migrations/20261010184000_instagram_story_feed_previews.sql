-- Story-only workflow. No change to Feed reservations, Feed claim logic or Feed limits.
create table if not exists public.marketing_story_previews (
 id uuid primary key default gen_random_uuid(),
 feed_run_id uuid not null unique references public.marketing_runs(id) on delete restrict,
 feed_draft_id uuid not null references public.instagram_post_drafts(id) on delete restrict,
 feed_scheduled_for timestamptz not null,
 feed_date_kst date not null,
 preview_date_kst date not null,
 source_cover_url text not null,
 teaser_title text not null check(length(teaser_title) between 1 and 180),
 language text not null check(language in ('ko','en')),
 image_path text unique,
 image_url text,
 media_format text not null default 'jpeg_static' check(media_format in ('jpeg_static','interactive_manual')),
 status text not null default 'generating' check(status in (
  'generating','generated','approved','scheduled','publishing','published',
  'manual_ready','needs_review','failed','canceled'
 )),
 approved_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz,
 scheduled_for timestamptz,
 started_at timestamptz,
 external_attempted_at timestamptz,
 instagram_container_id text,
 instagram_media_id text,
 instagram_permalink text,
 published_at timestamptz,
 publication_mode text check(publication_mode in ('api','manual')),
 error_code text,
 error_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint story_approved_requires_image check (
  status not in ('approved','scheduled','publishing','published') or
  (image_path is not null and image_url is not null and approved_by is not null
   and approved_at is not null)
 ),
 constraint story_scheduled_requires_time check (
  status not in ('scheduled','publishing') or scheduled_for is not null
 )
);
create index if not exists marketing_story_previews_due on public.marketing_story_previews(status,scheduled_for);
create index if not exists marketing_story_previews_day on public.marketing_story_previews(preview_date_kst,created_at desc);
alter table public.marketing_story_previews enable row level security;
revoke all on public.marketing_story_previews from public,anon,authenticated;
grant select,insert,update on public.marketing_story_previews to service_role;

create table if not exists public.marketing_story_publish_attempts (
 id bigint generated always as identity primary key,
 story_id uuid not null unique references public.marketing_story_previews(id) on delete restrict,
 state text not null check(state in ('claimed','external_started','sent','needs_review','failed','manual_ready')),
 started_at timestamptz not null default now(),
 external_started_at timestamptz,
 finished_at timestamptz,
 error_code text,
 error_message text,
 instagram_container_id text,
 instagram_media_id text
);
alter table public.marketing_story_publish_attempts enable row level security;
revoke all on public.marketing_story_publish_attempts from public,anon,authenticated;
grant select,insert,update on public.marketing_story_publish_attempts to service_role;

create or replace function roundy_private.marketing_story_source_valid(p_story public.marketing_story_previews)
returns boolean language sql security invoker set search_path=''
as $$
 select exists(
  select 1 from public.marketing_runs r
  join public.instagram_post_drafts d on d.id=p_story.feed_draft_id
  where r.id=p_story.feed_run_id and r.channel='instagram'
   and r.status='queued'
   and r.snapshot->>'draft_id'=d.id::text
   and coalesce(r.snapshot->>'media_kind','feed')='feed'
   and r.scheduled_for=p_story.feed_scheduled_for
   and (r.scheduled_for at time zone 'Asia/Seoul')::date=p_story.feed_date_kst
   and (r.scheduled_for at time zone 'Asia/Seoul')::date=p_story.preview_date_kst+1
   and d.status='scheduled' and d.marketing_run_id=r.id
   and d.approved_at is not null and d.approved_by is not null
   and d.quality_report->>'status'='passed'
   and d.quality_report->'preflight'->>'status'='passed'
   and d.quality_revision=d.revision
   and cardinality(d.images)>0 and d.images[1]=p_story.source_cover_url
   and r.snapshot->'images'->>0=p_story.source_cover_url
 )
$$;
revoke all on function roundy_private.marketing_story_source_valid(public.marketing_story_previews) from public,anon,authenticated;
grant execute on function roundy_private.marketing_story_source_valid(public.marketing_story_previews) to service_role;

create or replace function public.approve_marketing_story_preview(p_story uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare s public.marketing_story_previews;
begin
 if p_actor is null then raise exception 'STORY_ADMIN_REQUIRED';end if;
 select * into s from public.marketing_story_previews where id=p_story for update;
 if not found or s.status<>'generated' or s.image_path is null or s.image_url is null
 then raise exception 'STORY_NOT_READY_FOR_APPROVAL';end if;
 if not roundy_private.marketing_story_source_valid(s)
 then raise exception 'STORY_SOURCE_FEED_NO_LONGER_ELIGIBLE';end if;
 update public.marketing_story_previews
  set status='approved',approved_by=p_actor,approved_at=now(),
   updated_at=now(),error_code=null,error_message=null
 where id=s.id returning * into s;
 return to_jsonb(s);
end;$$;
revoke all on function public.approve_marketing_story_preview(uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_marketing_story_preview(uuid,uuid) to service_role;

create or replace function public.schedule_marketing_story_preview(p_story uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare s public.marketing_story_previews;
 local_today date:=(now() at time zone 'Asia/Seoul')::date;
 desired timestamptz;
begin
 if p_actor is null then raise exception 'STORY_ADMIN_REQUIRED';end if;
 select * into s from public.marketing_story_previews where id=p_story for update;
 if not found or s.status<>'approved' or s.approved_by is null
 then raise exception 'STORY_MUST_BE_APPROVED_FIRST';end if;
 if not roundy_private.marketing_story_source_valid(s)
 then raise exception 'STORY_SOURCE_FEED_NO_LONGER_ELIGIBLE';end if;
 if s.preview_date_kst<>local_today then
  update public.marketing_story_previews set status='manual_ready',
   error_code='STORY_PREVIEW_DATE_ELAPSED',error_message='Download and upload this Story manually if still relevant.',
   updated_at=now() where id=s.id returning * into s;
  return to_jsonb(s);
 end if;
 desired:=greatest(now()+interval '5 minutes',
  (local_today+time '19:00') at time zone 'Asia/Seoul');
 if (desired at time zone 'Asia/Seoul')::date<>s.preview_date_kst then
  update public.marketing_story_previews set status='manual_ready',
   error_code='STORY_PREVIEW_DATE_ELAPSED',error_message='Story cannot be auto-posted after its preview day.',
   updated_at=now() where id=s.id returning * into s;
  return to_jsonb(s);
 end if;
 update public.marketing_story_previews
  set status='scheduled',scheduled_for=desired,updated_at=now()
  where id=s.id returning * into s;
 return to_jsonb(s);
end;$$;
revoke all on function public.schedule_marketing_story_preview(uuid,uuid) from public,anon,authenticated;
grant execute on function public.schedule_marketing_story_preview(uuid,uuid) to service_role;

-- Isolated Story publisher claim. Multiple Story previews may be published in
-- one KST day; no query reads or consumes the Feed daily allowance.
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
  exists(select 1 from public.marketing_story_previews s where s.id=a.story_id and s.status='needs_review');
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

create or replace function public.mark_marketing_story_external_attempt(p_story uuid)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare n integer;
begin
 update public.marketing_story_publish_attempts set
  state='external_started',external_started_at=now()
 where story_id=p_story and state='claimed';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'STORY_EXTERNAL_ATTEMPT_NOT_RESERVED';end if;
 update public.marketing_story_previews set external_attempted_at=now(),updated_at=now()
 where id=p_story and status='publishing';
 return true;
end;$$;
revoke all on function public.mark_marketing_story_external_attempt(uuid) from public,anon,authenticated;
grant execute on function public.mark_marketing_story_external_attempt(uuid) to service_role;

-- Admin confirmation after a MANUAL upload; never records an API post or calls Meta.
create or replace function public.confirm_marketing_story_manual_post(p_story uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare s public.marketing_story_previews;
begin
 if p_actor is null then raise exception 'STORY_ADMIN_REQUIRED';end if;
 select * into s from public.marketing_story_previews where id=p_story for update;
 if not found or s.status<>'manual_ready' or s.image_path is null
 then raise exception 'STORY_NOT_AVAILABLE_FOR_MANUAL_CONFIRMATION';end if;
 update public.marketing_story_previews set status='published',
  publication_mode='manual',published_at=now(),updated_at=now()
 where id=s.id returning * into s;
 return to_jsonb(s);
end;$$;
revoke all on function public.confirm_marketing_story_manual_post(uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_marketing_story_manual_post(uuid,uuid) to service_role;
