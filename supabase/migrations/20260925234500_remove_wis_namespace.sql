begin;

-- Final namespace cleanup. The bridge migration keeps both naming schemes usable
-- during the application deployment; once the clean-name application is live,
-- replace the bridge views with the physical tables in one transaction.

drop view public.events,public.profiles,public.verifications,public.applications,
  public.credit_lots,public.bookings,public.encounters,public.choices,public.matches,
  public.reports,public.pair_exclusions,public.staff,public.user_roles,public.seating_plans,
  public.reminder_deliveries,public.members,public.referral_codes,public.referral_redemptions;

alter schema wis_private rename to roundy_private;

alter table public.wis_events rename to events;
alter table public.wis_profiles rename to profiles;
alter table public.wis_verifications rename to verifications;
alter table public.wis_applications rename to applications;
alter table public.wis_credit_lots rename to credit_lots;
alter table public.wis_bookings rename to bookings;
alter table public.wis_encounters rename to encounters;
alter table public.wis_choices rename to choices;
alter table public.wis_matches rename to matches;
alter table public.wis_reports rename to reports;
alter table public.wis_pair_exclusions rename to pair_exclusions;
alter table public.wis_staff rename to staff;
alter table public.wis_user_roles rename to user_roles;
alter table public.wis_seating_plans rename to seating_plans;
alter table public.wis_reminder_deliveries rename to reminder_deliveries;
alter table public.wis_members rename to members;
alter table public.wis_referral_codes rename to referral_codes;
alter table public.wis_referral_redemptions rename to referral_redemptions;

-- PL/pgSQL bodies are stored as source text. Rewrite the private functions after
-- the table/schema rename so their fully-qualified references follow the new names.
do $$
declare
  r record;
  definition text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='roundy_private'
  loop
    definition:=pg_get_functiondef(r.oid);
    definition:=replace(definition,'public.wis_','public.');
    definition:=replace(definition,'wis_private.','roundy_private.');
    execute definition;
  end loop;
end;
$$;

-- Clean public RPC surface. These replace the temporary bridge wrappers and point
-- directly at the renamed private schema.
create or replace function public.is_admin()
returns boolean language sql stable set search_path='' as $$select roundy_private.is_admin();$$;

create or replace function public.admin_members()
returns jsonb language sql set search_path='' as $$select roundy_private.admin_members();$$;

create or replace function public.admin_review_member(p_member uuid,p_status text,p_rejection_reason text default '')
returns jsonb language sql set search_path='' as $$select roundy_private.admin_review_member(p_member,p_status,p_rejection_reason);$$;

create or replace function public.anonymize_account()
returns boolean language sql set search_path='' as $$select roundy_private.anonymize_account();$$;

create or replace function public.apply(p_event uuid)
returns uuid language sql set search_path='' as $$select roundy_private.apply(p_event);$$;

create or replace function public.choose(p_encounter uuid,p_choice text)
returns void language sql set search_path='' as $$select roundy_private.choose(p_encounter,p_choice);$$;

create or replace function public.claim_reminders()
returns jsonb language sql set search_path='' as $$select roundy_private.claim_reminders();$$;

create or replace function public.finalize(p_event uuid)
returns integer language sql set search_path='' as $$select roundy_private.finalize(p_event);$$;

create or replace function public.generate_seating(p_event uuid)
returns jsonb language sql set search_path='' as $$select roundy_private.generate_seating(p_event);$$;

create or replace function public.get_my_referral_code()
returns text language sql set search_path='' as $$select roundy_private.get_my_referral_code();$$;

create or replace function public.get_or_create_referral_code()
returns text language sql set search_path='' as $$select roundy_private.get_or_create_referral_code();$$;

create or replace function public.get_seating(p_event uuid)
returns jsonb language sql set search_path='' as $$select roundy_private.get_seating(p_event);$$;

create or replace function public.match_profile(p_match uuid)
returns jsonb language sql set search_path='' as $$select roundy_private.match_profile(p_match);$$;

create or replace function public.redeem(p_event uuid)
returns uuid language plpgsql set search_path='' as $$
begin
  raise exception 'Confirm the cancellation guidelines and terms before enrolling';
end;
$$;

create or replace function public.redeem(p_event uuid,p_terms_accepted boolean)
returns uuid language sql set search_path='' as $$select roundy_private.redeem(p_event,p_terms_accepted);$$;

create or replace function public.redeem_referral(p_event uuid,p_quantity integer,p_code text,p_terms_accepted boolean)
returns jsonb language sql set search_path='' as $$select roundy_private.redeem_referral(p_event,p_quantity,p_code,p_terms_accepted);$$;

create or replace function public.referral_quote(p_code text,p_quantity integer)
returns jsonb language sql set search_path='' as $$select roundy_private.referral_quote(p_code,p_quantity);$$;

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

-- Policies store function dependencies by OID. Rebuild the policies that used the
-- old public is-admin RPC before dropping that legacy function.
do $$
declare
  r record;
  roles_sql text;
  statement text;
  new_name text;
  clean_qual text;
  clean_check text;
begin
  for r in
    select *
    from pg_policies
    where coalesce(qual,'') ilike '%wis_is_admin%'
       or coalesce(with_check,'') ilike '%wis_is_admin%'
  loop
    roles_sql:=array_to_string(r.roles,',');
    new_name:=regexp_replace(r.policyname,'^wis_','');
    clean_qual:=replace(replace(coalesce(r.qual,''),'wis_is_admin()','public.is_admin()'),'AS wis_is_admin','AS is_admin');
    clean_check:=replace(replace(coalesce(r.with_check,''),'wis_is_admin()','public.is_admin()'),'AS wis_is_admin','AS is_admin');

    execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
    statement:=format(
      'create policy %I on %I.%I as %s for %s to %s',
      new_name,r.schemaname,r.tablename,r.permissive,r.cmd,roles_sql
    );
    if r.qual is not null then statement:=statement||' using ('||clean_qual||')'; end if;
    if r.with_check is not null then statement:=statement||' with check ('||clean_check||')'; end if;
    execute statement;
  end loop;
end;
$$;

-- Drop the old public RPC names. RESTRICT is intentional: if anything still
-- depends on one of them, the migration should fail instead of silently cascading.
do $$
declare
  r record;
begin
  for r in
    select p.proname,pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'wis_%'
  loop
    execute format('drop function public.%I(%s)',r.proname,r.args);
  end loop;
end;
$$;

-- Clean the remaining visible database object names. Auth-owned trigger names are left alone because Supabase does not grant application migrations ownership of auth.users.
do $$
declare
  r record;
  clean_name text;
begin
  for r in
    select conrelid::regclass::text as relation_name,conname
    from pg_constraint
    where conname like 'wis_%'
  loop
    clean_name:=regexp_replace(r.conname,'^wis_','');
    execute format('alter table %s rename constraint %I to %I',r.relation_name,r.conname,clean_name);
  end loop;

  for r in
    select schemaname,indexname
    from pg_indexes
    where indexname like 'wis_%'
  loop
    clean_name:=regexp_replace(r.indexname,'^wis_','');
    execute format('alter index %I.%I rename to %I',r.schemaname,r.indexname,clean_name);
  end loop;

  for r in
    select distinct event_object_schema,event_object_table,trigger_name
    from information_schema.triggers
    where trigger_name like 'wis_%'
      and event_object_schema='public'
  loop
    clean_name:=regexp_replace(r.trigger_name,'^wis_','');
    execute format('alter trigger %I on %I.%I rename to %I',
      r.trigger_name,r.event_object_schema,r.event_object_table,clean_name);
  end loop;

  for r in
    select schemaname,tablename,policyname
    from pg_policies
    where policyname like 'wis_%'
  loop
    clean_name:=regexp_replace(r.policyname,'^wis_','');
    execute format('alter policy %I on %I.%I rename to %I',
      r.policyname,r.schemaname,r.tablename,clean_name);
  end loop;
end;
$$;

-- pg_cron stores its SQL command as text, so schema renames do not rewrite it.
do $$
declare
  r record;
begin
  if exists(select 1 from pg_namespace where nspname='cron') then
    for r in execute 'select jobid,command from cron.job where command like ''%wis_private.%'''
    loop
      execute format(
        'select cron.alter_job(%s, command := %L)',
        r.jobid,
        replace(r.command,'wis_private.','roundy_private.')
      );
    end loop;
  end if;
end;
$$;

commit;
