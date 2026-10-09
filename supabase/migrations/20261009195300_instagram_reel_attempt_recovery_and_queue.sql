-- Fix the MP4 path check to avoid backslash-escape ambiguity in PostgreSQL regex.
alter table public.instagram_reel_drafts drop constraint if exists instagram_reel_drafts_video_storage_path_check;
alter table public.instagram_reel_drafts add constraint instagram_reel_drafts_video_storage_path_check
check (video_storage_path is null or video_storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]mp4$');

create table if not exists public.instagram_reel_publish_attempts(
 run_id uuid primary key references public.marketing_runs(id) on delete cascade,
 reel_id uuid not null references public.instagram_reel_drafts(id) on delete cascade,
 creation_id text not null check(length(creation_id) between 1 and 120),
 stage text not null default 'container_created'
    check(stage in ('container_created','awaiting_ready','publishing','sent')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists reel_publish_attempts_reel_idx
 on public.instagram_reel_publish_attempts(reel_id,created_at desc);
alter table public.instagram_reel_publish_attempts enable row level security;
revoke all on public.instagram_reel_publish_attempts from public,anon,authenticated;
grant select on public.instagram_reel_publish_attempts to authenticated;
grant all on public.instagram_reel_publish_attempts to service_role;
drop policy if exists instagram_reel_publish_attempts_admin_read on public.instagram_reel_publish_attempts;
create policy instagram_reel_publish_attempts_admin_read
on public.instagram_reel_publish_attempts for select to authenticated using((select public.is_admin()));

-- Keep existing queue idempotency while treating Reel videos as different media.
-- Never requeue uncertain publish requests.
create or replace function public.claim_marketing()
returns jsonb language plpgsql security definer set search_path=''
as $$
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
  update public.marketing_runs set status='publishing',started_at=now()
  where id=r.id returning * into r;
  result=result||jsonb_build_array(to_jsonb(r));
 end loop;
 return result;
end;
$$;
revoke all on function public.claim_marketing() from public,anon,authenticated;
grant execute on function public.claim_marketing() to service_role;
