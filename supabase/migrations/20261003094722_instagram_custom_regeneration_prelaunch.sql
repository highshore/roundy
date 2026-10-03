begin;

alter table public.marketing_automation_settings
  add column if not exists content_mode text not null default 'prelaunch'
    check(content_mode in('prelaunch','live_event'));

alter table public.instagram_post_drafts
  add column if not exists content_mode text not null default 'live_event'
    check(content_mode in('prelaunch','live_event')),
  add column if not exists last_regeneration_mode text
    check(last_regeneration_mode is null or last_regeneration_mode in('text','image','both')),
  add column if not exists last_regeneration_instruction text not null default ''
    check(length(last_regeneration_instruction)<=500),
  add column if not exists regenerated_at timestamptz;

update public.instagram_post_drafts
set content_mode=case when event_id is null then 'prelaunch' else 'live_event' end
where content_mode is distinct from case when event_id is null then 'prelaunch' else 'live_event' end;

update public.marketing_automation_settings
set content_mode='prelaunch'
where singleton;

commit;
