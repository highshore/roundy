begin;
alter table public.events alter column theme set default '1:1 Speed Mingle';
alter table public.events add column nationality_requirements jsonb not null default '{"female":{"mode":"all","countries":[]},"male":{"mode":"all","countries":[]}}';
create function roundy_private.validate_event_nationalities() returns trigger language plpgsql security definer set search_path='' as $$
declare g text; rule jsonb; code text;
begin
 if jsonb_typeof(new.nationality_requirements)<>'object' then raise exception 'Invalid nationality requirements';end if;
 foreach g in array array['female','male'] loop
  rule=new.nationality_requirements->g;
  if rule is null or coalesce(rule->>'mode','') not in ('all','korean','non_korean','selected') or jsonb_typeof(rule->'countries') is distinct from 'array' then raise exception 'Invalid nationality requirements';end if;
  if rule->>'mode'='selected' and jsonb_array_length(rule->'countries')=0 then raise exception 'Select at least one nationality';end if;
  for code in select jsonb_array_elements_text(rule->'countries') loop
   if not(code=any(string_to_array('AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CR CI HR CU CY CZ CD DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT VA HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW',' '))) then raise exception 'Invalid nationality code';end if;
  end loop;
 end loop;
 return new;
end;$$;
create trigger events_nationality_validation before insert or update of nationality_requirements on public.events for each row execute function roundy_private.validate_event_nationalities();
create function roundy_private.enforce_event_nationalities() returns trigger language plpgsql security definer set search_path='' as $$
declare rules jsonb; p jsonb; rule jsonb; nationality text;
begin
 select nationality_requirements into rules from public.events where id=new.event_id for share;
 if rules->'female'->>'mode'='all' and rules->'male'->>'mode'='all' then return new;end if;
 select profile into p from public.profiles where user_id=new.user_id;
 rule=rules->(p->>'gender');
 nationality=case p->>'nationality' when 'Korean' then 'KR' when '한국' then 'KR' when '대한민국' then 'KR' when 'American' then 'US' when 'Japanese' then 'JP' when 'Chinese' then 'CN' when 'British' then 'GB' else p->>'nationality' end;
 if rule is null then raise exception 'Complete your gender and nationality before applying';end if;
 if rule->>'mode'='all' then return new;end if;
 if coalesce(nationality,'')='' or not(nationality=any(string_to_array('AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CR CI HR CU CY CZ CD DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT VA HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW',' '))) then raise exception 'Update your profile nationality before applying';end if;
 if (rule->>'mode'='korean' and nationality<>'KR') or (rule->>'mode'='non_korean' and nationality='KR') or (rule->>'mode'='selected' and not(rule->'countries' ? nationality)) then raise exception 'Your nationality does not meet this event requirement for your group';end if;
 return new;
end;$$;
create trigger applications_nationality before insert or update of event_id,user_id on public.applications for each row execute function roundy_private.enforce_event_nationalities();
create trigger bookings_nationality before insert or update of event_id,user_id on public.bookings for each row execute function roundy_private.enforce_event_nationalities();
-- Lockdown restricts cancellation only; applications remain open until start.
create or replace function roundy_private.application_lockdown() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.events where id=new.event_id and status='live' and now()<starts_at) then raise exception 'Event registration is closed';end if;
 return new;
end;$$;
revoke all on function roundy_private.validate_event_nationalities(),roundy_private.enforce_event_nationalities() from public,anon,authenticated;
create or replace function roundy_private.redeem_with_credit(
  p_event uuid,
  p_terms_accepted boolean,
  p_preferred_credit uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  e public.events;
  credit uuid;
  booking uuid;
  profile_data jsonb;
  verification_status text;
  member_gender text;
  years int;
  same_gender_bookings int;
begin
  if u is null then raise exception 'Sign in required';end if;
  if coalesce(p_terms_accepted,false) is not true then
    raise exception 'Confirm the cancellation guidelines and terms before enrolling';
  end if;

  select * into e
  from public.events
  where id=p_event
  for update;

  select id into booking
  from public.bookings
  where event_id=p_event and user_id=u;

  if booking is not null then return booking;end if;

  if e.id is null or e.status<>'live' or e.starts_at<=now() or e.seats_remaining<1 then
    raise exception 'No place available';
  end if;


  select profile into profile_data
  from public.profiles
  where user_id=u;

  if profile_data is null
    or coalesce(profile_data->>'full_name','')=''
    or coalesce(profile_data->>'birth_date','')=''
    or coalesce(profile_data->>'gender','') not in ('male','female')
    or coalesce(profile_data->>'nationality','')=''
    or coalesce(profile_data->>'job_title','')=''
    or coalesce(profile_data->>'workplace','')=''
    or coalesce((profile_data->>'height_cm')::int,0) not between 100 and 250
    or coalesce(profile_data->>'phone','')!~'^010-[0-9]{4}-[0-9]{4}$'
    or coalesce((profile_data->>'contact_consent')::boolean,false)=false
    or coalesce(jsonb_array_length(profile_data->'photos'),0) not between 1 and 3
    or coalesce(jsonb_array_length(profile_data->'interests'),0) not between 3 and 10 then
    raise exception 'Complete all required profile fields before enrolling';
  end if;

  select status into verification_status
  from public.verifications
  where user_id=u;

  if coalesce(verification_status,'')<>'Verified' then
    raise exception 'Your profile must be approved before enrolling';
  end if;

  years=extract(year from age(current_date,(profile_data->>'birth_date')::date));
  if years not between e.age_min and e.age_max then
    raise exception 'Your age is outside this event range';
  end if;

  member_gender=profile_data->>'gender';

  if e.theme='1:1 Speed Mingle' then
    select count(*) into same_gender_bookings
    from public.bookings b
    join public.profiles p on p.user_id=b.user_id
    where b.event_id=e.id
      and p.profile->>'gender'=member_gender;

    if same_gender_bookings>=e.capacity/2 then
      raise exception 'The % seats for this event are currently full',
        case member_gender when 'female' then 'women''s' else 'men''s' end;
    end if;
  end if;

  select id into credit
  from public.credit_lots
  where user_id=u
    and remaining>0
    and expires_at>now()
  order by case when id=p_preferred_credit then 0 else 1 end,expires_at
  for update
  limit 1;

  if credit is null then
    raise exception 'No valid ticket available';
  end if;

  update public.credit_lots
  set remaining=remaining-1
  where id=credit;

  insert into public.bookings(event_id,user_id,credit_lot_id,terms_accepted_at)
  values(p_event,u,credit,now())
  returning id into booking;

  return booking;
end;
$$;

commit;
