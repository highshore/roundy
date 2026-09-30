begin;

-- Public attendee roster intentionally exposes only broad, non-identifying
-- demographic buckets. Exact birth dates, names, workplaces, job titles,
-- photos and contact details remain private.
create or replace function roundy_private.public_age_band(p_profile jsonb)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  raw_birth text:=coalesce(p_profile->>'birth_date','');
  birth_year int;
  decade int;
  band text;
begin
  if raw_birth !~ '^\d{4}-\d{2}-\d{2}$' then return 'unknown'; end if;
  begin
    birth_year:=extract(year from raw_birth::date)::int;
  exception when others then
    return 'unknown';
  end;
  decade:=((birth_year % 100) / 10) * 10;
  band:=case
    when (birth_year % 10)<=3 then 'early'
    when (birth_year % 10)<=6 then 'mid'
    else 'late'
  end;
  return lpad(decade::text,2,'0')||'_'||band;
end;
$$;

create or replace function roundy_private.public_job_group(p_profile jsonb)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  work text:=lower(
    case
      when coalesce(p_profile->>'public_job','')<>'' and lower(coalesce(p_profile->>'public_job',''))<>'professional'
        then coalesce(p_profile->>'public_job','')||' '||coalesce(p_profile->>'public_workplace','')
      else coalesce(p_profile->>'job_title','')||' '||coalesce(p_profile->>'workplace','')
    end
  );
begin
  if work ~ '(software|developer|engineer|programmer|data|technology)' then return 'developer'; end if;
  if work ~ '(doctor|physician|nurse|medical|healthcare|pharmac|dentist|hospital)' then return 'medical'; end if;
  if work ~ '(finance|bank|banking|investment|securit|insurance|asset management)' then return 'finance'; end if;
  if work ~ '(government|public sector|civil servant|public institution|public organization)' then return 'public'; end if;
  if work ~ '(large company|large corporation|conglomerate)' then return 'large_company'; end if;
  if work ~ '(lawyer|attorney|accountant|tax|consultant|researcher|professor|architect|professional)' then return 'professional'; end if;
  if work ~ '(teacher|education|school|university|academy)' then return 'education'; end if;
  if work ~ '(designer|design|artist|creative|content|media|writer|editor)' then return 'creative'; end if;
  if work ~ '(student)' then return 'student'; end if;
  if work ~ '(founder|owner|freelance|self-employed|entrepreneur)' then return 'self_employed'; end if;
  if work ~ '(sales|marketing|product manager|manager|business|strategy|operations|human resources|hr)' then return 'business'; end if;
  return 'office';
end;
$$;

create or replace function roundy_private.event_public_roster(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  e public.events;
  women jsonb;
  men jsonb;
  women_count int:=0;
  men_count int:=0;
  last_update timestamptz;
begin
  select * into e from public.events where id=p_event;
  if e.id is null or e.status<>'live' or e.deleted_at is not null then
    raise exception 'Event unavailable';
  end if;

  with confirmed as (
    select b.id,b.created_at,p.profile
    from public.bookings b
    left join public.event_payment_orders o on o.order_number=b.payment_order_number
    join public.profiles p on p.user_id=b.user_id
    where b.event_id=p_event
      and (b.payment_order_number is null or o.status='completed')
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'age_band',roundy_private.public_age_band(profile),
          'job_group',roundy_private.public_job_group(profile)
        )
        order by created_at,id
      ) filter(where profile->>'gender'='female'),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'age_band',roundy_private.public_age_band(profile),
          'job_group',roundy_private.public_job_group(profile)
        )
        order by created_at,id
      ) filter(where profile->>'gender'='male'),
      '[]'::jsonb
    ),
    count(*) filter(where profile->>'gender'='female')::int,
    count(*) filter(where profile->>'gender'='male')::int,
    max(created_at)
  into women,men,women_count,men_count,last_update
  from confirmed;

  return jsonb_build_object(
    'women',women,
    'men',men,
    'women_count',women_count,
    'men_count',men_count,
    'total',women_count+men_count,
    'updated_at',last_update
  );
end;
$$;

create or replace function public.event_public_roster(p_event uuid)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select roundy_private.event_public_roster(p_event);
$$;

revoke all on function roundy_private.public_age_band(jsonb),
  roundy_private.public_job_group(jsonb),
  roundy_private.event_public_roster(uuid),
  public.event_public_roster(uuid)
from public,anon,authenticated,service_role;

grant execute on function public.event_public_roster(uuid)
to anon,authenticated,service_role;

commit;
