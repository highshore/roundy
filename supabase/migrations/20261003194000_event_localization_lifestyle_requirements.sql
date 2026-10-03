begin;

alter table public.events
  add column if not exists title_ko text not null default '',
  add column if not exists description_ko text not null default '',
  add column if not exists height_requirements jsonb not null
    default '{"female":{"min_cm":null,"max_cm":null},"male":{"min_cm":null,"max_cm":null}}'::jsonb,
  add column if not exists smoking_requirements jsonb not null
    default '{"female":{"mode":"all","values":[]},"male":{"mode":"all","values":[]}}'::jsonb;

alter table public.events
  drop constraint if exists events_title_ko_length,
  add constraint events_title_ko_length check (char_length(title_ko) <= 120),
  drop constraint if exists events_description_ko_length,
  add constraint events_description_ko_length check (char_length(description_ko) <= 3000);

create or replace function roundy_private.validate_event_lifestyle_requirements()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  g text;
  rule jsonb;
  min_node jsonb;
  max_node jsonb;
  min_height int;
  max_height int;
  smoking_value text;
begin
  if jsonb_typeof(new.height_requirements) <> 'object' then
    raise exception 'Invalid height requirements';
  end if;
  if jsonb_typeof(new.smoking_requirements) <> 'object' then
    raise exception 'Invalid smoking requirements';
  end if;

  foreach g in array array['female','male'] loop
    rule := new.height_requirements->g;
    if rule is null or jsonb_typeof(rule) <> 'object'
      or not (rule ? 'min_cm') or not (rule ? 'max_cm') then
      raise exception 'Invalid height requirements';
    end if;

    min_node := rule->'min_cm';
    max_node := rule->'max_cm';
    min_height := null;
    max_height := null;

    if jsonb_typeof(min_node) <> 'null' then
      if jsonb_typeof(min_node) <> 'number' or (min_node#>>'{}') !~ '^\d+$' then
        raise exception 'Invalid height requirements';
      end if;
      min_height := (min_node#>>'{}')::int;
      if min_height not between 100 and 250 then
        raise exception 'Height requirements must be between 100 and 250 cm';
      end if;
    end if;

    if jsonb_typeof(max_node) <> 'null' then
      if jsonb_typeof(max_node) <> 'number' or (max_node#>>'{}') !~ '^\d+$' then
        raise exception 'Invalid height requirements';
      end if;
      max_height := (max_node#>>'{}')::int;
      if max_height not between 100 and 250 then
        raise exception 'Height requirements must be between 100 and 250 cm';
      end if;
    end if;

    if min_height is not null and max_height is not null and min_height > max_height then
      raise exception 'Minimum height cannot exceed maximum height';
    end if;

    rule := new.smoking_requirements->g;
    if rule is null or jsonb_typeof(rule) <> 'object'
      or coalesce(rule->>'mode','') not in ('all','selected')
      or jsonb_typeof(rule->'values') is distinct from 'array' then
      raise exception 'Invalid smoking requirements';
    end if;

    if rule->>'mode'='selected' and jsonb_array_length(rule->'values')=0 then
      raise exception 'Choose at least one allowed smoking habit';
    end if;
    if rule->>'mode'='all' and jsonb_array_length(rule->'values')<>0 then
      raise exception 'Invalid smoking requirements';
    end if;

    for smoking_value in select jsonb_array_elements_text(rule->'values') loop
      if smoking_value not in ('never','socially','sometimes','daily') then
        raise exception 'Invalid smoking requirement value';
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

drop trigger if exists events_lifestyle_requirements_validation on public.events;
create trigger events_lifestyle_requirements_validation
before insert or update of height_requirements,smoking_requirements on public.events
for each row execute function roundy_private.validate_event_lifestyle_requirements();

create or replace function roundy_private.assert_event_profile_requirements(
  p_event uuid,
  p_user uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  height_rules jsonb;
  smoking_rules jsonb;
  profile_data jsonb;
  member_gender text;
  height_rule jsonb;
  smoking_rule jsonb;
  min_height int;
  max_height int;
  member_height int;
  member_smoking text;
begin
  select e.height_requirements,e.smoking_requirements
  into height_rules,smoking_rules
  from public.events e
  where e.id=p_event and e.deleted_at is null;

  if not found then
    raise exception 'Event unavailable';
  end if;

  select p.profile into profile_data
  from public.profiles p
  where p.user_id=p_user;

  member_gender:=coalesce(profile_data->>'gender','');
  if member_gender not in ('female','male') then
    raise exception 'Complete your gender before applying';
  end if;

  height_rule:=height_rules->member_gender;
  min_height:=case
    when jsonb_typeof(height_rule->'min_cm')='number' then (height_rule->>'min_cm')::int
    else null
  end;
  max_height:=case
    when jsonb_typeof(height_rule->'max_cm')='number' then (height_rule->>'max_cm')::int
    else null
  end;

  if min_height is not null or max_height is not null then
    if coalesce(profile_data->>'height_cm','') !~ '^\d+$' then
      raise exception 'Update your profile height before applying';
    end if;
    member_height:=(profile_data->>'height_cm')::int;
    if (min_height is not null and member_height<min_height)
      or (max_height is not null and member_height>max_height) then
      raise exception 'Your height does not meet this event requirement for your group';
    end if;
  end if;

  smoking_rule:=smoking_rules->member_gender;
  if smoking_rule->>'mode'='selected' then
    member_smoking:=coalesce(profile_data->>'smoking_frequency','');
    if member_smoking not in ('never','socially','sometimes','daily') then
      raise exception 'Update your smoking preference before applying';
    end if;
    if not (smoking_rule->'values' ? member_smoking) then
      raise exception 'Your smoking preference does not meet this event requirement for your group';
    end if;
  end if;
end;
$$;

create or replace function roundy_private.enforce_event_lifestyle_requirements()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform roundy_private.assert_event_profile_requirements(new.event_id,new.user_id);
  return new;
end;
$$;

drop trigger if exists applications_lifestyle_requirements on public.applications;
create trigger applications_lifestyle_requirements
before insert or update of event_id,user_id on public.applications
for each row execute function roundy_private.enforce_event_lifestyle_requirements();

drop trigger if exists bookings_lifestyle_requirements on public.bookings;
create trigger bookings_lifestyle_requirements
before insert or update of event_id,user_id on public.bookings
for each row execute function roundy_private.enforce_event_lifestyle_requirements();

create or replace function public.event_checkout_quote(
  p_event uuid,
  p_code text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
begin
  perform roundy_private.assert_event_profile_requirements(p_event,auth.uid());
  return roundy_private.event_checkout_quote(p_event,p_code);
end;
$$;

revoke all on function roundy_private.validate_event_lifestyle_requirements(),
  roundy_private.enforce_event_lifestyle_requirements(),
  roundy_private.assert_event_profile_requirements(uuid,uuid)
from public,anon,authenticated,service_role;

grant execute on function roundy_private.assert_event_profile_requirements(uuid,uuid)
to authenticated,service_role;

create or replace function roundy_private.public_age_band(p_profile jsonb)
returns text
language plpgsql
stable
set search_path=''
as $$
declare
  raw_birth text:=coalesce(p_profile->>'birth_date','');
  birth_date date;
  years int;
  decade int;
  band text;
begin
  if raw_birth !~ '^\d{4}-\d{2}-\d{2}$' then return 'unknown'; end if;
  begin
    birth_date:=raw_birth::date;
  exception when others then
    return 'unknown';
  end;

  years:=extract(year from age((now() at time zone 'Asia/Seoul')::date,birth_date))::int;
  if years<18 or years>120 then return 'unknown'; end if;

  decade:=(years/10)*10;
  band:=case
    when (years%10)<=3 then 'early'
    when (years%10)<=6 then 'mid'
    else 'late'
  end;

  return decade::text||'_'||band;
end;
$$;

commit;
