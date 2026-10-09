-- Reel Studio is opt-in. Storage is private; only approved snapshots are enqueued.
create table if not exists public.instagram_reel_drafts (
 id uuid primary key default gen_random_uuid(),
 title text not null default '' check (char_length(title)<=100),
 hook_text text not null default '' check (char_length(hook_text)<=110),
 caption text not null default '' check (char_length(caption)<=2000),
 language text not null default 'en' check (language in ('en','ko')),
 pillar text not null default 'seoul' check (pillar in ('seoul','culture','humor','people','brand')),
 hook_style text not null default 'curiosity' check (hook_style in ('curiosity','practical','humor')),
 source_kind text check (source_kind is null or source_kind in ('upload','storyboard')),
 video_storage_path text unique check (video_storage_path is null or video_storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.mp4$'),
 duration_seconds numeric(6,2) check (duration_seconds is null or duration_seconds between 3 and 90),
 width integer check (width is null or width between 360 and 1920),
 height integer check (height is null or height between 640 and 1920),
 file_size bigint check (file_size is null or file_size between 1 and 41943040),
 rights_attested boolean not null default false,
 status text not null default 'draft' check (status in ('draft','needs_review','queued','published','failed','needs_review_publish','rejected')),
 revision integer not null default 1 check (revision between 1 and 10000),
 created_by uuid references auth.users(id) on delete set null,
 approved_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz,
 approved_revision integer,
 scheduled_for timestamptz,
 marketing_run_id uuid unique references public.marketing_runs(id) on delete set null,
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists instagram_reel_drafts_recent_idx on public.instagram_reel_drafts(created_at desc);
create index if not exists instagram_reel_drafts_status_idx on public.instagram_reel_drafts(status,scheduled_for);
alter table public.instagram_reel_drafts enable row level security;
revoke all on public.instagram_reel_drafts from public,anon,authenticated;
grant select on public.instagram_reel_drafts to authenticated;
grant all on public.instagram_reel_drafts to service_role;
drop policy if exists instagram_reel_admin_select on public.instagram_reel_drafts;
create policy instagram_reel_admin_select on public.instagram_reel_drafts
 for select to authenticated using ((select public.is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('marketing-reels','marketing-reels',false,41943040,array['video/mp4']::text[])
on conflict (id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists marketing_reels_admin_select on storage.objects;
drop policy if exists marketing_reels_admin_insert on storage.objects;
create policy marketing_reels_admin_select on storage.objects
 for select to authenticated using (bucket_id='marketing-reels' and (select public.is_admin()));
create policy marketing_reels_admin_insert on storage.objects
 for insert to authenticated with check (bucket_id='marketing-reels' and (select public.is_admin()));

alter table public.instagram_post_insights
 add column if not exists reel_avg_watch_time_ms bigint check (reel_avg_watch_time_ms is null or reel_avg_watch_time_ms>=0),
 add column if not exists reel_total_watch_time_ms bigint check (reel_total_watch_time_ms is null or reel_total_watch_time_ms>=0);

create or replace function public.enqueue_instagram_reel(
 p_reel uuid,p_revision integer,p_actor uuid,p_schedule timestamptz default null
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
 d public.instagram_reel_drafts;
 r public.marketing_runs;
 when_to_post timestamptz:=coalesce(p_schedule,now());
begin
 perform pg_advisory_xact_lock(hashtextextended('roundy-reel:'||p_reel::text,0));
 select * into d from public.instagram_reel_drafts where id=p_reel for update;
 if not found or d.status<>'needs_review' or d.revision<>p_revision or d.marketing_run_id is not null then
  raise exception 'REEL_DRAFT_CHANGED_REFRESH_FIRST';
 end if;
 if not d.rights_attested or d.video_storage_path is null or d.source_kind is null or
    char_length(trim(d.title))<3 or char_length(trim(d.hook_text))<3 or
    char_length(trim(d.caption))<5 or
    d.duration_seconds not between 3 and 90 or d.file_size not between 1 and 41943040 or
    d.width<360 or d.height<640 or abs(d.width::numeric/d.height::numeric-0.5625)>0.045
 then raise exception 'REEL_NOT_READY_FOR_APPROVAL'; end if;
 if p_actor is null then raise exception 'REEL_REVIEWER_REQUIRED'; end if;
 if when_to_post<now()-interval '2 minutes' or when_to_post>now()+interval '30 days'
 then raise exception 'INVALID_REEL_SCHEDULE'; end if;
 insert into public.marketing_runs(channel,snapshot,request_key,scheduled_for)
 values('instagram',jsonb_build_object(
  'channel','instagram','media_kind','reel','reel_id',d.id,
  'reel_revision',d.revision,'name','Roundy Reel - '||d.title,
  'title',d.title,'caption',d.caption,'cta','',
  'destination_url','','images','[]'::jsonb,
  'video_storage_path',d.video_storage_path,
  'video_duration_seconds',d.duration_seconds,
  'hook_style',d.hook_style,'content_pillar',d.pillar,
  'content_language',d.language,
  'eligible_for_optimization',true,
  'manual_reviewed',true
 ),'reel:'||d.id::text||':'||d.revision::text,when_to_post)
 returning * into r;
 update public.instagram_reel_drafts
 set status='queued',approved_at=now(),approved_by=p_actor,approved_revision=d.revision,
     scheduled_for=when_to_post,marketing_run_id=r.id,updated_at=now()
 where id=d.id returning * into d;
 return jsonb_build_object('draft',to_jsonb(d),'run',to_jsonb(r));
end;
$$;
revoke all on function public.enqueue_instagram_reel(uuid,integer,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.enqueue_instagram_reel(uuid,integer,uuid,timestamptz) to service_role;
