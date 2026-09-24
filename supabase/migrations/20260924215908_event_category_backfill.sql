begin;

-- Align legacy events with the two supported event categories.
update public.wis_events
set theme='1:1 Speed Meetup'
where btrim(coalesce(theme,''))='';

alter table public.wis_events
  alter column theme set default '1:1 Speed Meetup';

alter table public.wis_events
  drop constraint if exists wis_events_theme_check;

alter table public.wis_events
  add constraint wis_events_theme_check
  check(theme in ('1:1 Speed Meetup','Business Meetup'));

commit;
