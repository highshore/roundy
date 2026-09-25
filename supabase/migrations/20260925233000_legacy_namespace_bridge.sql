begin;

-- Transitional clean names. These views/RPCs let the application deploy before
-- the physical table rename, avoiding a production cut-over gap.

create view public.events with (security_invoker=true) as select * from public.wis_events;
create view public.profiles with (security_invoker=true) as select * from public.wis_profiles;
create view public.verifications with (security_invoker=true) as select * from public.wis_verifications;
create view public.applications with (security_invoker=true) as select * from public.wis_applications;
create view public.credit_lots with (security_invoker=true) as select * from public.wis_credit_lots;
create view public.bookings with (security_invoker=true) as select * from public.wis_bookings;
create view public.encounters with (security_invoker=true) as select * from public.wis_encounters;
create view public.choices with (security_invoker=true) as select * from public.wis_choices;
create view public.matches with (security_invoker=true) as select * from public.wis_matches;
create view public.reports with (security_invoker=true) as select * from public.wis_reports;
create view public.pair_exclusions with (security_invoker=true) as select * from public.wis_pair_exclusions;
create view public.staff with (security_invoker=true) as select * from public.wis_staff;
create view public.user_roles with (security_invoker=true) as select * from public.wis_user_roles;
create view public.seating_plans with (security_invoker=true) as select * from public.wis_seating_plans;
create view public.reminder_deliveries with (security_invoker=true) as select * from public.wis_reminder_deliveries;
create view public.members with (security_invoker=true) as select * from public.wis_members;
create view public.referral_codes with (security_invoker=true) as select * from public.wis_referral_codes;
create view public.referral_redemptions with (security_invoker=true) as select * from public.wis_referral_redemptions;

grant select on public.events to anon;
grant select,insert,update,delete on public.events to authenticated;
grant select,insert,update on public.profiles,public.verifications to authenticated;
grant select on public.applications,public.credit_lots,public.bookings,public.choices,public.matches,public.user_roles,public.reminder_deliveries to authenticated;
grant select,insert on public.reports to authenticated;
grant all on public.events,public.profiles,public.verifications,public.applications,public.credit_lots,
  public.bookings,public.encounters,public.choices,public.matches,public.reports,public.pair_exclusions,
  public.staff,public.user_roles,public.seating_plans,public.reminder_deliveries,public.members,
  public.referral_codes,public.referral_redemptions to service_role;

create or replace function public.is_admin()
returns boolean language sql stable set search_path='' as $$select public.wis_is_admin();$$;

create or replace function public.admin_members()
returns jsonb language sql set search_path='' as $$select public.wis_admin_members();$$;

create or replace function public.admin_review_member(p_member uuid,p_status text,p_rejection_reason text default '')
returns jsonb language sql set search_path='' as $$select public.wis_admin_review_member(p_member,p_status,p_rejection_reason);$$;

create or replace function public.anonymize_account()
returns boolean language sql set search_path='' as $$select public.wis_anonymize_account();$$;

create or replace function public.apply(p_event uuid)
returns uuid language sql set search_path='' as $$select public.wis_apply(p_event);$$;

create or replace function public.choose(p_encounter uuid,p_choice text)
returns void language sql set search_path='' as $$select public.wis_choose(p_encounter,p_choice);$$;

create or replace function public.claim_reminders()
returns jsonb language sql set search_path='' as $$select public.wis_claim_reminders();$$;

create or replace function public.finalize(p_event uuid)
returns integer language sql set search_path='' as $$select public.wis_finalize(p_event);$$;

create or replace function public.generate_seating(p_event uuid)
returns jsonb language sql set search_path='' as $$select public.wis_generate_seating(p_event);$$;

create or replace function public.get_my_referral_code()
returns text language sql set search_path='' as $$select public.wis_get_my_referral_code();$$;

create or replace function public.get_or_create_referral_code()
returns text language sql set search_path='' as $$select public.wis_get_or_create_referral_code();$$;

create or replace function public.get_seating(p_event uuid)
returns jsonb language sql set search_path='' as $$select public.wis_get_seating(p_event);$$;

create or replace function public.match_profile(p_match uuid)
returns jsonb language sql set search_path='' as $$select public.wis_match_profile(p_match);$$;

create or replace function public.redeem(p_event uuid)
returns uuid language sql set search_path='' as $$select public.wis_redeem(p_event);$$;

create or replace function public.redeem(p_event uuid,p_terms_accepted boolean)
returns uuid language sql set search_path='' as $$select public.wis_redeem(p_event,p_terms_accepted);$$;

create or replace function public.redeem_referral(p_event uuid,p_quantity integer,p_code text,p_terms_accepted boolean)
returns jsonb language sql set search_path='' as $$select public.wis_redeem_referral(p_event,p_quantity,p_code,p_terms_accepted);$$;

create or replace function public.referral_quote(p_code text,p_quantity integer)
returns jsonb language sql set search_path='' as $$select public.wis_referral_quote(p_code,p_quantity);$$;

revoke all on function public.is_admin(),public.admin_members(),public.admin_review_member(uuid,text,text),
  public.anonymize_account(),public.apply(uuid),public.choose(uuid,text),public.claim_reminders(),
  public.finalize(uuid),public.generate_seating(uuid),public.get_my_referral_code(),
  public.get_or_create_referral_code(),public.get_seating(uuid),public.match_profile(uuid),
  public.redeem(uuid),public.redeem(uuid,boolean),public.redeem_referral(uuid,integer,text,boolean),
  public.referral_quote(text,integer) from public,anon,authenticated,service_role;

grant execute on function public.is_admin(),public.admin_members(),public.admin_review_member(uuid,text,text),
  public.anonymize_account(),public.apply(uuid),public.choose(uuid,text),public.finalize(uuid),
  public.generate_seating(uuid),public.get_my_referral_code(),public.get_or_create_referral_code(),
  public.get_seating(uuid),public.match_profile(uuid),public.redeem(uuid,boolean),
  public.redeem_referral(uuid,integer,text,boolean),public.referral_quote(text,integer)
  to authenticated,service_role;

grant execute on function public.claim_reminders(),public.redeem(uuid) to service_role;

commit;
