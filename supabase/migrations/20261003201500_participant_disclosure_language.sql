begin;

alter table public.events
  add column if not exists participant_disclosures jsonb not null
    default '{"age":true,"job":true,"nationality":false,"height":false,"smoking":false}'::jsonb,
  add column if not exists event_language text not null default 'either';

alter table public.events
  drop constraint if exists events_participant_disclosures_valid,
  add constraint events_participant_disclosures_valid check (
    jsonb_typeof(participant_disclosures)='object'
    and jsonb_typeof(participant_disclosures->'age')='boolean'
    and jsonb_typeof(participant_disclosures->'job')='boolean'
    and jsonb_typeof(participant_disclosures->'nationality')='boolean'
    and jsonb_typeof(participant_disclosures->'height')='boolean'
    and jsonb_typeof(participant_disclosures->'smoking')='boolean'
  ),
  drop constraint if exists events_event_language_valid,
  add constraint events_event_language_valid check (event_language in ('either','en','ko'));

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
  disclosures jsonb;
begin
  select * into e from public.events where id=p_event;
  if e.id is null or e.status<>'live' or e.deleted_at is not null then
    raise exception 'Event unavailable';
  end if;

  disclosures:=coalesce(
    e.participant_disclosures,
    '{"age":true,"job":true,"nationality":false,"height":false,"smoking":false}'::jsonb
  );

  with confirmed as (
    select b.id,b.created_at,p.profile
    from public.bookings b
    join public.event_payment_orders o on o.order_number=b.payment_order_number
    join public.profiles p on p.user_id=b.user_id
    where b.event_id=p_event
      and o.status='completed'
  ),
  safe_entries as (
    select
      id,
      created_at,
      profile,
      jsonb_strip_nulls(jsonb_build_object(
        'age_band',
          case when coalesce((disclosures->>'age')::boolean,false)
            then roundy_private.public_age_band(profile) end,
        'job_group',
          case when coalesce((disclosures->>'job')::boolean,false)
            then roundy_private.public_job_group(profile) end,
        'nationality',
          case when coalesce((disclosures->>'nationality')::boolean,false) then
            case coalesce(profile->>'nationality','')
              when 'Korean' then 'KR'
              when '한국' then 'KR'
              when '대한민국' then 'KR'
              when 'American' then 'US'
              when 'Japanese' then 'JP'
              when 'Chinese' then 'CN'
              when 'British' then 'GB'
              else case
                when coalesce(profile->>'nationality','') ~ '^[A-Z]{2}$'
                  then profile->>'nationality'
                else null
              end
            end
          end,
        'height_cm',
          case when coalesce((disclosures->>'height')::boolean,false)
                 and coalesce(profile->>'height_cm','') ~ '^\d{3}$'
            then (profile->>'height_cm')::int end,
        'smoking_frequency',
          case when coalesce((disclosures->>'smoking')::boolean,false)
                 and coalesce(profile->>'smoking_frequency','') in ('never','socially','sometimes','daily')
            then profile->>'smoking_frequency' end
      )) as public_profile
    from confirmed
  )
  select
    coalesce(
      jsonb_agg(public_profile order by created_at,id)
        filter(where profile->>'gender'='female'),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(public_profile order by created_at,id)
        filter(where profile->>'gender'='male'),
      '[]'::jsonb
    ),
    count(*) filter(where profile->>'gender'='female')::int,
    count(*) filter(where profile->>'gender'='male')::int,
    max(created_at)
  into women,men,women_count,men_count,last_update
  from safe_entries;

  return jsonb_build_object(
    'women',women,
    'men',men,
    'women_count',women_count,
    'men_count',men_count,
    'total',women_count+men_count,
    'updated_at',last_update,
    'disclosures',disclosures
  );
end;
$$;

commit;
