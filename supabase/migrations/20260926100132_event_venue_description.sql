begin;
alter table public.events add column venue_description text not null default '' check(char_length(venue_description)<=1000);
comment on column public.events.venue_description is 'Optional public venue instructions entered by the event administrator.';
commit;
