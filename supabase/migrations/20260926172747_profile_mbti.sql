begin;
-- Optional profile JSON field: preserve existing profiles and reject malformed direct writes.
alter table public.profiles add constraint profiles_mbti_valid check (
 not (profile ? 'mbti') or (jsonb_typeof(profile->'mbti')='string' and (profile->>'mbti'='' or profile->>'mbti' ~ '^[IE][NS][TF][JP]$'))
);
create or replace function roundy_private.match_cards(p_match uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select coalesce(jsonb_agg(card order by created_at desc,id),'[]'::jsonb) into result
 from (
  select m.id,m.created_at,jsonb_build_object(
   'id',m.id,'full_name',p.profile->>'full_name',
   'age',extract(year from age((now() at time zone 'Asia/Seoul')::date,nullif(p.profile->>'birth_date','')::date)),
   'nationality',p.profile->>'nationality','height_cm',p.profile->'height_cm','mbti',nullif(p.profile->>'mbti',''),
   'public_job',p.profile->>'public_job','public_workplace',p.profile->>'public_workplace',
   'interests',coalesce(p.profile->'interests','[]'::jsonb),
   'photos',coalesce((select jsonb_agg(photo) from jsonb_array_elements_text(case when jsonb_typeof(p.profile->'photos')='array' then p.profile->'photos' else '[]'::jsonb end) photo where photo like '/api/photos/'||p.user_id::text||'/%'),'[]'::jsonb),
   'contact_available',coalesce(p.profile->>'contact_consent'='true' and nullif(p.profile->>'phone','') is not null,false),
   'event_id',e.id,'event_title',e.title,'event_starts_at',e.starts_at,
   'round_number',enc.round_number,'table_number',enc.table_number
  ) card
  from public.matches m
  join public.events e on e.id=m.event_id
  left join public.event_sessions s on s.event_id=e.id
  join public.profiles p on p.user_id=case when m.user_a=u then m.user_b else m.user_a end
  join public.members other_member on other_member.id=p.user_id and other_member.deleted_at is null
  join public.members viewer on viewer.id=u and viewer.deleted_at is null
  left join lateral (
   select x.round_number,x.table_number from public.encounters x
   where x.event_id=m.event_id and least(x.user_a,x.user_b)=m.user_a and greatest(x.user_a,x.user_b)=m.user_b
   order by x.round_number limit 1
  ) enc on true
  where (m.user_a=u or m.user_b=u) and (p_match is null or m.id=p_match)
   and (s.state='finished' or e.ends_at<=now())
 ) eligible;
 return result;
end;
$$;


commit;
