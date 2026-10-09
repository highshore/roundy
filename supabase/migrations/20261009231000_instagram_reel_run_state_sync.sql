-- Keep Reel Studio drafts in sync even if the publisher crashes or the
-- existing 10-minute marketing-run watchdog marks the outcome uncertain.
create or replace function roundy_private.sync_instagram_reel_run_status()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.channel='instagram' and new.snapshot->>'media_kind'='reel'
    and new.snapshot->>'reel_id' is not null then
  update public.instagram_reel_drafts
  set status=case new.status
    when 'sent' then 'published'
    when 'needs_review' then 'needs_review_publish'
    when 'failed' then 'failed'
    when 'skipped' then 'failed'
    else 'queued' end,
   published_at=case when new.status='sent' then coalesce(new.finished_at,now())
      else published_at end,
   updated_at=now()
  where id=(new.snapshot->>'reel_id')::uuid and marketing_run_id=new.id
    and status in ('queued','needs_review_publish','failed');
 end if;
 return new;
end;
$$;
revoke all on function roundy_private.sync_instagram_reel_run_status() from public,anon,authenticated;
drop trigger if exists marketing_reel_sync_run_status on public.marketing_runs;
create trigger marketing_reel_sync_run_status
 after update of status on public.marketing_runs for each row
 when (old.status is distinct from new.status)
 execute function roundy_private.sync_instagram_reel_run_status();
