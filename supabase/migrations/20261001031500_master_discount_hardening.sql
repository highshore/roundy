begin;

create index if not exists marketing_promo_codes_allowed_user_idx
  on public.marketing_promo_codes(allowed_user_id)
  where allowed_user_id is not null;

create or replace function roundy_private.complete_event_payment_order(
  p_order text,
  p_user uuid,
  p_billing_key text,
  p_authorization jsonb,
  p_payment_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  booking_id uuid;
begin
  if not exists(
    select 1 from public.event_payment_orders
    where order_number=p_order and user_id=p_user and status in('charging','completed')
  ) then raise exception 'Payment order is not in a completable state'; end if;

  update public.event_payment_orders
  set status='completed',
      billing_key_used=p_billing_key,
      authorization_response=p_authorization,
      payment_result=p_payment_result,
      paid_at=case when amount>0 then coalesce(paid_at,now()) else paid_at end,
      updated_at=now(),
      error_code=null,
      error_message=null
  where order_number=p_order and user_id=p_user;

  update public.checkout_discount_redemptions
  set status='consumed',consumed_at=coalesce(consumed_at,now())
  where payment_order_number=p_order;

  select id into booking_id
  from public.bookings
  where payment_order_number=p_order;

  return booking_id;
end;
$$;

commit;
