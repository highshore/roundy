-- Story cron is independent of Feed, Reel and daily Feed post limits.
create or replace function roundy_private.dispatch_marketing_story_previews()
returns void language plpgsql security definer set search_path=''
as $$
declare
 setting public.marketing_automation_settings;
 cfg roundy_private.reminder_scheduler_config;
 secret_value text;
 today_kst date:=(now() at time zone 'Asia/Seoul')::date;
 tomorrow date:=today_kst+1;
 next_day date:=today_kst+2;
 need_generation boolean:=false;
 need_publisher boolean:=false;
begin
 select * into setting from public.marketing_automation_settings where singleton;
 if not found then return;end if;
 if setting.story_preview_auto_enabled then
  select exists (
   select 1 from public.marketing_runs r
   join public.instagram_post_drafts d on d.id=(r.snapshot->>'draft_id')::uuid
   where r.channel='instagram' and r.status='queued'
    and r.snapshot ? 'draft_id'
    and coalesce(r.snapshot->>'media_kind','feed')='feed'
    and (r.scheduled_for at time zone 'Asia/Seoul')::date=tomorrow
    and d.status='scheduled' and d.marketing_run_id=r.id
    and d.approved_by is not null and d.approved_at is not null
    and d.quality_report->>'status'='passed'
    and d.quality_report->'preflight'->>'status'='passed'
    and d.quality_revision=d.revision
    and not exists(select 1 from public.marketing_story_previews s where s.feed_run_id=r.id)
  ) into need_generation;
 end if;
 select exists(select 1 from public.marketing_story_previews
  where (status='scheduled' and scheduled_for<=now())
    or (status='publishing' and started_at<now()-interval '10 minutes')
 ) into need_publisher;
 if not need_generation and not need_publisher then return; end if;
 select * into cfg from roundy_private.reminder_scheduler_config where singleton;
 select secret into secret_value from roundy_private.marketing_scheduler_config where singleton;
 if cfg.project_url is null or secret_value is null then return;end if;
 if need_generation then
  perform net.http_post(
   url:='https://roundy.team/api/internal/marketing-story-previews',
   headers:=jsonb_build_object('Content-Type','application/json',
    'x-marketing-secret',secret_value),
   body:='{}'::jsonb,timeout_milliseconds:=115000
  );
 end if;
 if need_publisher then
  perform net.http_post(
   url:=cfg.project_url||'/functions/v1/roundy-story-previews',
   headers:=jsonb_build_object('Content-Type','application/json',
    'Authorization','Bearer '||cfg.anon_jwt,'x-marketing-secret',secret_value),
   body:='{}'::jsonb,timeout_milliseconds:=90000
  );
 end if;
end;
$$;
revoke all on function roundy_private.dispatch_marketing_story_previews() from public,anon,authenticated;
-- KST scheduling calculations occur inside the function; the cron itself is timezone-neutral.
select cron.schedule(
 'roundy-story-previews','*/10 * * * *',
 'select roundy_private.dispatch_marketing_story_previews()'
);
