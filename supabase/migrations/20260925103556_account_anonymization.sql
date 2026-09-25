begin;

create table if not exists public.wis_members(
  id uuid primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.wis_members enable row level security;
revoke all on public.wis_members from anon,authenticated;

insert into public.wis_members(id,auth_user_id)
select id,id from auth.users
on conflict(id) do update set auth_user_id=excluded.auth_user_id
where public.wis_members.deleted_at is null;

create or replace function wis_private.ensure_member_from_auth()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.wis_members(id,auth_user_id)
  values(new.id,new.id)
  on conflict(id) do update
    set auth_user_id=excluded.auth_user_id,
        deleted_at=null;
  return new;
end;
$$;

drop trigger if exists wis_create_member on auth.users;
create trigger wis_create_member
after insert on auth.users
for each row execute function wis_private.ensure_member_from_auth();

alter table public.wis_applications drop constraint if exists wis_applications_user_id_fkey;
alter table public.wis_applications
  add constraint wis_applications_user_id_fkey foreign key(user_id) references public.wis_members(id);

alter table public.wis_credit_lots drop constraint if exists wis_credit_lots_user_id_fkey;
alter table public.wis_credit_lots
  add constraint wis_credit_lots_user_id_fkey foreign key(user_id) references public.wis_members(id);

alter table public.wis_bookings drop constraint if exists wis_bookings_user_id_fkey;
alter table public.wis_bookings
  add constraint wis_bookings_user_id_fkey foreign key(user_id) references public.wis_members(id);

alter table public.wis_encounters drop constraint if exists wis_encounters_user_a_fkey;
alter table public.wis_encounters
  add constraint wis_encounters_user_a_fkey foreign key(user_a) references public.wis_members(id);
alter table public.wis_encounters drop constraint if exists wis_encounters_user_b_fkey;
alter table public.wis_encounters
  add constraint wis_encounters_user_b_fkey foreign key(user_b) references public.wis_members(id);

alter table public.wis_choices drop constraint if exists wis_choices_user_id_fkey;
alter table public.wis_choices
  add constraint wis_choices_user_id_fkey foreign key(user_id) references public.wis_members(id);
alter table public.wis_choices drop constraint if exists wis_choices_recipient_id_fkey;
alter table public.wis_choices
  add constraint wis_choices_recipient_id_fkey foreign key(recipient_id) references public.wis_members(id);

alter table public.wis_matches drop constraint if exists wis_matches_user_a_fkey;
alter table public.wis_matches
  add constraint wis_matches_user_a_fkey foreign key(user_a) references public.wis_members(id);
alter table public.wis_matches drop constraint if exists wis_matches_user_b_fkey;
alter table public.wis_matches
  add constraint wis_matches_user_b_fkey foreign key(user_b) references public.wis_members(id);

alter table public.wis_reports drop constraint if exists wis_reports_user_id_fkey;
alter table public.wis_reports
  add constraint wis_reports_user_id_fkey foreign key(user_id) references public.wis_members(id);

alter table public.wis_pair_exclusions drop constraint if exists wis_pair_exclusions_user_a_fkey;
alter table public.wis_pair_exclusions
  add constraint wis_pair_exclusions_user_a_fkey foreign key(user_a) references public.wis_members(id);
alter table public.wis_pair_exclusions drop constraint if exists wis_pair_exclusions_user_b_fkey;
alter table public.wis_pair_exclusions
  add constraint wis_pair_exclusions_user_b_fkey foreign key(user_b) references public.wis_members(id);

alter table public.wis_staff drop constraint if exists wis_staff_user_id_fkey;
alter table public.wis_staff
  add constraint wis_staff_user_id_fkey foreign key(user_id) references public.wis_members(id);

alter table public.wis_seating_plans drop constraint if exists wis_seating_plans_generated_by_fkey;
alter table public.wis_seating_plans
  add constraint wis_seating_plans_generated_by_fkey foreign key(generated_by) references public.wis_members(id);

alter table public.wis_reminder_deliveries drop constraint if exists wis_reminder_deliveries_user_id_fkey;
alter table public.wis_reminder_deliveries
  add constraint wis_reminder_deliveries_user_id_fkey foreign key(user_id) references public.wis_members(id);

create or replace function wis_private.anonymize_account()
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
begin
  if u is null then raise exception 'Sign in required'; end if;

  insert into public.wis_members(id,auth_user_id)
  values(u,u)
  on conflict(id) do nothing;

  -- A deleted account must not keep an active future seat.
  delete from public.wis_bookings b
  using public.wis_events e
  where b.user_id=u
    and b.event_id=e.id
    and e.starts_at>now();

  delete from public.wis_applications a
  using public.wis_events e
  where a.user_id=u
    and a.event_id=e.id
    and e.starts_at>now();

  update public.wis_reminder_deliveries
  set status='cancelled',updated_at=now()
  where user_id=u and status in('queued','processing');

  -- Remove identity-bearing and authorization data before Auth is deleted.
  delete from public.wis_verifications where user_id=u;
  delete from public.wis_profiles where user_id=u;
  delete from public.wis_user_roles where user_id=u;
  delete from public.wis_staff where user_id=u;

  update public.wis_members
  set auth_user_id=null,
      deleted_at=now()
  where id=u;

  return true;
end;
$$;

create or replace function public.wis_anonymize_account()
returns boolean
language sql
security invoker
set search_path=''
as $$
  select wis_private.anonymize_account();
$$;

revoke all on function wis_private.ensure_member_from_auth() from public,anon,authenticated;
revoke all on function wis_private.anonymize_account(),public.wis_anonymize_account() from public,anon;
grant execute on function wis_private.anonymize_account(),public.wis_anonymize_account() to authenticated;

commit;
