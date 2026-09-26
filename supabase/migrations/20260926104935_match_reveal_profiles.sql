begin;

-- One authorized, allowlisted payload for the reveal and rich profile screens.
-- Contacts, birth dates, verification handles and exact work details are excluded.
create function roundy_private.match_cards(p_match uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select coalesce(jsonb_agg(card order by created_at desc,id),'[]'::jsonb) into result
 from (
  select m.id,m.created_at,jsonb_build_object(
   'id',m.id,'full_name',p.profile->>'full_name',
   'age',extract(year from age((now() at time zone 'Asia/Seoul')::date,nullif(p.profile->>'birth_date','')::date)),
   'nationality',p.profile->>'nationality','height_cm',p.profile->'height_cm',
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

create function public.match_cards(p_match uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select roundy_private.match_cards(p_match);$$;

create function roundy_private.match_contact(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); card jsonb; phone text;
begin
 card:=roundy_private.match_cards(p_match)->0;
 if card is null then raise exception 'Match unavailable'; end if;
 if card->>'contact_available' is distinct from 'true' then raise exception 'Contact details unavailable'; end if;
 select p.profile->>'phone' into phone from public.matches m
 join public.profiles p on p.user_id=case when m.user_a=u then m.user_b else m.user_a end
 where m.id=p_match and (m.user_a=u or m.user_b=u) and p.profile->>'contact_consent'='true';
 if nullif(phone,'') is null then raise exception 'Contact details unavailable'; end if;
 return jsonb_build_object('full_name',card->>'full_name','phone',phone);
end;
$$;
create function public.match_contact(p_match uuid)
returns jsonb language sql security invoker set search_path='' as $$select roundy_private.match_contact(p_match);$$;

-- Keep existing attendee preview access, and allow mutual matches to load private
-- photos after the event, including when the six-hour attendee window has ended.
create or replace function roundy_private.can_view_attendee_photo(p_member uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then return false; end if;
 if u=p_member or roundy_private.is_admin() then return true; end if;
 return exists(select 1 from public.bookings b join public.events e on e.id=b.event_id
  where b.user_id=p_member and e.status='live' and e.starts_at>now()-interval '6 hours')
 or exists(select 1 from public.matches m join public.events e on e.id=m.event_id
  left join public.event_sessions s on s.event_id=m.event_id
  join public.members a on a.id=u and a.deleted_at is null
  join public.members b on b.id=p_member and b.deleted_at is null
  where ((m.user_a=u and m.user_b=p_member) or (m.user_b=u and m.user_a=p_member))
  and (s.state='finished' or e.ends_at<=now()));
end;
$$;
revoke all on function roundy_private.match_cards(uuid),public.match_cards(uuid),roundy_private.match_contact(uuid),public.match_contact(uuid) from public,anon;
grant execute on function roundy_private.match_cards(uuid),public.match_cards(uuid),roundy_private.match_contact(uuid),public.match_contact(uuid) to authenticated;
commit;
