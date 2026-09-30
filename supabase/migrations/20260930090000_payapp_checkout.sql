begin;

-- Provider metadata stays on the existing event payment ledger so the current
-- seat, discount and refund transaction helpers remain the single authority.
alter table public.event_payment_orders
  add column if not exists provider text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_payment_url text,
  add column if not exists provider_requested_at timestamptz,
  add column if not exists provider_feedback_at timestamptz;

alter table public.event_payment_orders
  drop constraint if exists event_payment_orders_provider_check;

alter table public.event_payment_orders
  add constraint event_payment_orders_provider_check
  check(provider is null or provider in('payple','payapp'));

create unique index if not exists event_payment_orders_provider_payment_id
  on public.event_payment_orders(provider,provider_payment_id)
  where provider_payment_id is not null;

-- Only the verified PayApp Edge Function (service_role) can invoke this public
-- wrapper. It checks the persisted order amount, PayApp request number and
-- event before changing a booking, which makes repeated feedback idempotent.
create or replace function roundy_private.record_payapp_feedback(
  p_order text,
  p_mul_no text,
  p_pay_state integer,
  p_amount integer,
  p_feedback jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  o public.event_payment_orders;
  feedback jsonb:=coalesce(p_feedback,'{}'::jsonb);
begin
  select * into o
  from public.event_payment_orders
  where order_number=p_order
  for update;

  if o.order_number is null then raise exception 'Payment order not found'; end if;
  if o.provider is distinct from 'payapp' then raise exception 'Payment provider mismatch'; end if;
  if p_amount is null or (p_pay_state not in(70,71) and p_amount<>o.amount) then
    raise exception 'Payment amount mismatch';
  end if;
  if coalesce(feedback->>'event_id','')<>o.event_id::text then raise exception 'Payment event mismatch'; end if;
  if o.provider_payment_id is not null and o.provider_payment_id<>p_mul_no then
    raise exception 'Payment request number mismatch';
  end if;

  update public.event_payment_orders
  set provider_payment_id=coalesce(provider_payment_id,p_mul_no),
      payment_result=coalesce(payment_result,'{}'::jsonb)||jsonb_build_object('payapp_feedback',feedback),
      provider_feedback_at=now(),
      updated_at=now()
  where order_number=p_order;

  if p_pay_state=4 then
    if o.status='charging' then
      if not exists(select 1 from public.bookings where payment_order_number=p_order) then
        raise exception 'Payment hold is missing';
      end if;
      update public.event_payment_orders
      set status='completed',
          paid_at=coalesce(paid_at,now()),
          error_code=null,
          error_message=null,
          updated_at=now()
      where order_number=p_order;
      update public.checkout_discount_redemptions
      set status='consumed',consumed_at=coalesce(consumed_at,now())
      where payment_order_number=p_order;
    elsif o.status in('pending_auth','failed') then
      raise exception 'Payment completed after the reservation hold was released';
    end if;
    return jsonb_build_object('order_number',p_order,'status','completed');
  end if;

  -- PayApp documents request cancellations under several codes. Before payment
  -- completion, free the held seat and any one-time discount reservation.
  if p_pay_state in(8,16,31,32) then
    if o.status in('pending_auth','charging') then
      delete from public.bookings where payment_order_number=p_order;
      delete from public.checkout_discount_redemptions
      where payment_order_number=p_order and status='reserved';
      update public.event_payment_orders
      set status='failed',
          error_code='payapp-request-cancelled',
          error_message='The PayApp payment request was cancelled.',
          updated_at=now()
      where order_number=p_order;
    end if;
    return jsonb_build_object('order_number',p_order,'status','request_cancelled');
  end if;

  -- Approval cancellation may arrive after the synchronous refund request, so
  -- this intentionally accepts both states and never re-issues discounts.
  if p_pay_state in(9,64) then
    if o.status in('pending_auth','charging') then
      delete from public.bookings where payment_order_number=p_order;
      delete from public.checkout_discount_redemptions
      where payment_order_number=p_order and status='reserved';
      update public.event_payment_orders
      set status='failed',
          error_code='payapp-approval-cancelled',
          error_message='The PayApp payment approval was cancelled.',
          updated_at=now()
      where order_number=p_order;
    elsif o.status in('completed','refunding','refunded_pending_reconcile') then
      delete from public.bookings where payment_order_number=p_order;
      update public.reminder_deliveries
      set status='cancelled',updated_at=now()
      where event_id=o.event_id and user_id=o.user_id and status in('queued','processing');
      update public.event_payment_orders
      set status='refunded',
          refund_response=feedback,
          refunded_at=coalesce(refunded_at,now()),
          error_code=null,
          error_message=null,
          updated_at=now()
      where order_number=p_order;
    end if;
    return jsonb_build_object('order_number',p_order,'status','approval_cancelled');
  end if;

  -- Roundy never initiates partial refunds. Preserve the provider notice for
  -- reconciliation without incorrectly removing a still-valid booking.
  if p_pay_state in(70,71) then
    update public.event_payment_orders
    set error_code='payapp-partial-cancellation',
        error_message='PayApp reported a partial cancellation that needs review.',
        updated_at=now()
    where order_number=p_order and status in('completed','refunding');
  end if;

  return jsonb_build_object('order_number',p_order,'status',o.status,'pay_state',p_pay_state);
end;
$$;

create or replace function public.record_payapp_feedback(
  p_order text,
  p_mul_no text,
  p_pay_state integer,
  p_amount integer,
  p_feedback jsonb
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select roundy_private.record_payapp_feedback(p_order,p_mul_no,p_pay_state,p_amount,p_feedback);
$$;

revoke all on function roundy_private.record_payapp_feedback(text,text,integer,integer,jsonb),
  public.record_payapp_feedback(text,text,integer,integer,jsonb)
from public,anon,authenticated;
grant execute on function public.record_payapp_feedback(text,text,integer,integer,jsonb) to service_role;

-- A payment hold reserves capacity, but it is not a confirmed attendee and
-- must not reveal a photo or inflate the public attendee count.
create or replace function roundy_private.event_attendees(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  e public.events;
  women jsonb;
  men jsonb;
  women_count int;
  men_count int;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select * into e from public.events where id=p_event;
  if e.id is null or (e.status<>'live' and not roundy_private.is_admin()) then
    raise exception 'Event unavailable';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object('photo',p.profile->'photos'->>0) order by b.created_at,b.id)
      filter(where p.profile->>'gender'='female'),'[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('photo',p.profile->'photos'->>0) order by b.created_at,b.id)
      filter(where p.profile->>'gender'='male'),'[]'::jsonb),
    count(*) filter(where p.profile->>'gender'='female')::int,
    count(*) filter(where p.profile->>'gender'='male')::int
  into women,men,women_count,men_count
  from public.bookings b
  left join public.event_payment_orders o on o.order_number=b.payment_order_number
  left join public.profiles p on p.user_id=b.user_id
  where b.event_id=p_event
    and (b.payment_order_number is null or o.status='completed');

  return jsonb_build_object(
    'women',women,
    'men',men,
    'women_count',women_count,
    'men_count',men_count,
    'total',women_count+men_count
  );
end;
$$;

create or replace function roundy_private.can_view_attendee_photo(p_member uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
begin
  if u is null then return false; end if;
  if u=p_member or roundy_private.is_admin() then return true; end if;
  return exists(
    select 1
    from public.bookings b
    join public.events e on e.id=b.event_id
    left join public.event_payment_orders o on o.order_number=b.payment_order_number
    where b.user_id=p_member
      and e.status='live'
      and e.starts_at>now()-interval '6 hours'
      and (b.payment_order_number is null or o.status='completed')
  ) or exists(
    select 1
    from public.matches m
    join public.events e on e.id=m.event_id
    left join public.event_sessions s on s.event_id=m.event_id
    join public.members a on a.id=u and a.deleted_at is null
    join public.members b on b.id=p_member and b.deleted_at is null
    where ((m.user_a=u and m.user_b=p_member) or (m.user_b=u and m.user_a=p_member))
      and (s.state='finished' or e.ends_at<=now())
  );
end;
$$;

revoke all on function roundy_private.event_attendees(uuid),
  roundy_private.can_view_attendee_photo(uuid)
from public,anon;
grant execute on function roundy_private.event_attendees(uuid),
  roundy_private.can_view_attendee_photo(uuid)
to authenticated,service_role;

commit;
