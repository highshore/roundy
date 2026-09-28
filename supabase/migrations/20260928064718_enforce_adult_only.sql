begin;

-- Roundy is an adult-only service. Enforce the platform minimum independently
-- from each event's narrower age range so UI or API mistakes cannot admit minors.
create or replace function roundy_private.enforce_minimum_profile_age()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  dob date;
  today_seoul date := (now() at time zone 'Asia/Seoul')::date;
begin
  if coalesce(new.profile->>'birth_date','')='' then
    return new;
  end if;

  begin
    dob := (new.profile->>'birth_date')::date;
  exception when others then
    raise exception 'Choose a valid date of birth';
  end;

  if extract(year from age(today_seoul,dob)) < 19 then
    raise exception 'Roundy is available only to people age 19 or older';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_minimum_age on public.profiles;
create trigger profiles_minimum_age
before insert or update of profile on public.profiles
for each row execute function roundy_private.enforce_minimum_profile_age();

create or replace function roundy_private.enforce_adult_event_access()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  dob date;
  today_seoul date := (now() at time zone 'Asia/Seoul')::date;
begin
  select nullif(profile->>'birth_date','')::date
    into dob
  from public.profiles
  where user_id=new.user_id;

  if dob is null or extract(year from age(today_seoul,dob)) < 19 then
    raise exception 'Roundy is available only to people age 19 or older';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_minimum_age on public.applications;
create trigger applications_minimum_age
before insert or update of event_id,user_id on public.applications
for each row execute function roundy_private.enforce_adult_event_access();

drop trigger if exists bookings_minimum_age on public.bookings;
create trigger bookings_minimum_age
before insert or update of event_id,user_id on public.bookings
for each row execute function roundy_private.enforce_adult_event_access();

-- Existing legacy events can be reviewed separately without blocking deployment,
-- but every new or edited event must use an adult-only minimum range.
alter table public.events
  drop constraint if exists events_adult_age_range;
alter table public.events
  add constraint events_adult_age_range
  check(age_min >= 19 and age_max >= age_min)
  not valid;

revoke all on function roundy_private.enforce_minimum_profile_age(),
  roundy_private.enforce_adult_event_access()
from public,anon,authenticated;

commit;
