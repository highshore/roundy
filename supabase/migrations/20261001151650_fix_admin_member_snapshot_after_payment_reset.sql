begin;

create or replace function roundy_private.member_snapshot(p_member uuid)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'profile', coalesce(p.profile, '{}'::jsonb),
    'profile_updated_at', p.updated_at,
    'verification', jsonb_build_object(
      'status', coalesce(v.status, 'Not started'),
      'method', coalesce(v.method, ''),
      'instagram', coalesce(v.instagram, ''),
      'linkedin', coalesce(v.linkedin, ''),
      'document_path', coalesce(v.document_path, ''),
      'rejection_reason', coalesce(v.rejection_reason, ''),
      'updated_at', v.updated_at
    ),
    'payments', jsonb_build_object(
      'completed_orders', (
        select count(*) from public.event_payment_orders o
        where o.user_id=u.id and o.status='completed'
      ),
      'pending_orders', (
        select count(*) from public.event_payment_orders o
        where o.user_id=u.id and o.status in ('pending_auth','charging')
      ),
      'total_paid', coalesce((
        select sum(o.amount) from public.event_payment_orders o
        where o.user_id=u.id and o.status='completed'
      ), 0),
      'total_refunded', coalesce((
        select sum(o.amount) from public.event_payment_orders o
        where o.user_id=u.id and o.status='refunded'
      ), 0),
      'last_paid_at', (
        select max(o.paid_at) from public.event_payment_orders o
        where o.user_id=u.id and o.paid_at is not null
      ),
      'credit_lots', (
        select count(*) from public.event_payment_orders o
        where o.user_id=u.id and o.status='completed'
      ),
      'credits_total', 0,
      'credits_remaining', 0,
      'last_purchased_at', (
        select max(o.paid_at) from public.event_payment_orders o
        where o.user_id=u.id and o.paid_at is not null
      )
    ),
    'applications', '[]'::jsonb,
    'bookings', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'status', 'Confirmed',
          'event_title', e.title,
          'event_slug', e.slug,
          'starts_at', e.starts_at
        )
        order by e.starts_at desc
      )
      from public.bookings b
      join public.events e on e.id=b.event_id
      join public.event_payment_orders o on o.order_number=b.payment_order_number
      where b.user_id=u.id
        and o.status='completed'
    ), '[]'::jsonb)
  )
  from auth.users u
  left join public.profiles p on p.user_id=u.id
  left join public.verifications v on v.user_id=u.id
  where u.id=p_member;
$$;

create or replace function roundy_private.anonymize_account()
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
begin
  if u is null then raise exception 'Sign in required'; end if;

  if exists(
    select 1
    from public.bookings b
    join public.events e on e.id=b.event_id
    join public.event_payment_orders o on o.order_number=b.payment_order_number
    where b.user_id=u
      and e.starts_at>now()
      and o.status in('completed','refunding','refunded_pending_reconcile')
  ) then
    raise exception 'Cancel and refund paid future events before deleting your account';
  end if;

  insert into public.members(id,auth_user_id)
  values(u,u)
  on conflict(id) do nothing;

  delete from public.bookings b
  using public.events e
  where b.user_id=u
    and b.event_id=e.id
    and e.starts_at>now();

  update public.reminder_deliveries
  set status='cancelled',updated_at=now()
  where user_id=u and status in('queued','processing');

  delete from public.verifications where user_id=u;
  delete from public.profiles where user_id=u;
  delete from public.user_roles where user_id=u;
  delete from public.staff where user_id=u;

  update public.members
  set auth_user_id=null,
      deleted_at=now()
  where id=u;

  return true;
end;
$$;

commit;
