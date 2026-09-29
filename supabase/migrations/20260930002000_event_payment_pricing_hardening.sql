begin;

create index if not exists checkout_discount_redemptions_event_idx
  on public.checkout_discount_redemptions(event_id);
create index if not exists checkout_discount_redemptions_user_idx
  on public.checkout_discount_redemptions(user_id);

drop policy if exists checkout_discount_no_direct_access on public.checkout_discount_redemptions;
create policy checkout_discount_no_direct_access
on public.checkout_discount_redemptions
for all
to authenticated
using (false)
with check (false);

commit;
