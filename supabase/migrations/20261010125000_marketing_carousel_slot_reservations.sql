-- Reserve planned Feed publishing slots at copy-generation time.
-- This does not modify Instagram publication workers, the scheduler or any existing rows.
begin;
create table if not exists public.marketing_carousel_slot_reservations (
 draft_id uuid primary key references public.instagram_post_drafts(id) on delete cascade,
 sequence_number bigint not null unique check(sequence_number > 0),
 planned_for timestamptz not null,
 created_at timestamptz not null default now()
);
create index if not exists marketing_carousel_slots_planned_order
 on public.marketing_carousel_slot_reservations (planned_for,sequence_number);
alter table public.marketing_carousel_slot_reservations enable row level security;
revoke all on public.marketing_carousel_slot_reservations from public,anon,authenticated;
grant select,insert,update on public.marketing_carousel_slot_reservations to service_role;

create or replace function public.reserve_marketing_carousel_slot(p_draft uuid)
returns bigint language plpgsql security invoker set search_path=''
as $$
declare next_slot bigint; existing_slot bigint; reserved_for timestamptz;
begin
 if p_draft is null then raise exception 'CAROUSEL_DRAFT_REQUIRED'; end if;
 perform pg_advisory_xact_lock(20261010125000);
 select sequence_number into existing_slot
 from public.marketing_carousel_slot_reservations where draft_id=p_draft;
 if found then return existing_slot; end if;
 select scheduled_for into reserved_for
 from public.instagram_post_drafts where id=p_draft and status='needs_approval';
 if not found or reserved_for is null then raise exception 'CAROUSEL_DRAFT_NOT_RESERVABLE'; end if;
 select coalesce(max(sequence_number),0)+1 into next_slot
 from public.marketing_carousel_slot_reservations;
 insert into public.marketing_carousel_slot_reservations(draft_id,sequence_number,planned_for)
 values(p_draft,next_slot,reserved_for)
 on conflict(draft_id) do nothing;
 select sequence_number into existing_slot
 from public.marketing_carousel_slot_reservations where draft_id=p_draft;
 return existing_slot;
end;
$$;
revoke all on function public.reserve_marketing_carousel_slot(uuid) from public,anon,authenticated;
grant execute on function public.reserve_marketing_carousel_slot(uuid) to service_role;
comment on table public.marketing_carousel_slot_reservations is
 'Stable planned Feed reservations for alternating 3 -> 5 cards. Idempotent by draft, created only when alternating is selected. Does not itself schedule or publish posts.';
commit;
