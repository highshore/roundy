begin;
-- Hosted Supabase default grants must not override the column-level contract.
revoke all on table public.wis_events, public.wis_profiles, public.wis_verifications,
 public.wis_applications, public.wis_credit_lots, public.wis_bookings,
 public.wis_encounters, public.wis_choices, public.wis_matches, public.wis_reports,
 public.wis_pair_exclusions, public.wis_staff from public, anon, authenticated;
grant select on public.wis_events to anon, authenticated;
grant select, insert, update on public.wis_profiles to authenticated;
grant select on public.wis_verifications to authenticated;
grant insert(user_id,instagram,linkedin), update(instagram,linkedin) on public.wis_verifications to authenticated;
grant select on public.wis_applications, public.wis_credit_lots, public.wis_bookings,
 public.wis_choices, public.wis_matches to authenticated;
grant select, insert(user_id,context,reason) on public.wis_reports to authenticated;
-- Infrastructure event triggers are not application RPCs.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
 end if;
end $$;
-- Only verified venue coordinates should be published; never guess a pin.
alter table public.wis_events
 add column latitude double precision,
 add column longitude double precision,
 add constraint venue_coordinates_valid check (
  (latitude is null and longitude is null) or
  (latitude is not null and longitude is not null and
   latitude between -90 and 90 and longitude between -180 and 180)
 );
commit;
