begin;
alter table public.events add column deleted_at timestamptz;
-- Deletion removes an event from the product without breaking historical references.
drop policy live_events on public.events;
create policy live_events on public.events for select to anon,authenticated using(status='live' and deleted_at is null);
create function roundy_private.admin_delete_event(p_event uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; b record; refunded int:=0;
begin
 if auth.uid() is null or not roundy_private.is_admin() then raise exception 'Administrator access required'; end if;
 select * into e from public.events where id=p_event for update;
 if e.id is null then raise exception 'Event not found'; end if;
 if e.deleted_at is not null then return jsonb_build_object('deleted',true,'tickets_returned',0); end if;
 -- Lock the event first, as redeem and cancel_booking do, to serialize ticket changes.
 if e.starts_at>now() then
  for b in select credit_lot_id,user_id,count(*)::int quantity from public.bookings
   where event_id=p_event and checked_in_at is null and credit_lot_id is not null
   group by credit_lot_id,user_id order by credit_lot_id
  loop
   update public.credit_lots set remaining=least(quantity,remaining+b.quantity)
    where id=b.credit_lot_id and user_id=b.user_id;
   refunded:=refunded+b.quantity;
  end loop;
 end if;
 update public.events set status='draft',deleted_at=now() where id=p_event;
 update public.reminder_deliveries set status='cancelled',updated_at=now()
  where event_id=p_event and status in('queued','processing');
 return jsonb_build_object('deleted',true,'tickets_returned',refunded);
end;
$$;
create function public.admin_delete_event(p_event uuid) returns jsonb
language sql security invoker set search_path='' as $$select roundy_private.admin_delete_event(p_event);$$;
revoke all on function roundy_private.admin_delete_event(uuid),public.admin_delete_event(uuid) from public,anon;
grant execute on function roundy_private.admin_delete_event(uuid),public.admin_delete_event(uuid) to authenticated;
create or replace function roundy_private.cancel_booking(p_event uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  e public.events;
  b public.bookings;
begin
  if u is null then raise exception 'Sign in required'; end if;

  select * into e
  from public.events
  where id=p_event
  for update;

  if e.id is null or e.deleted_at is not null then raise exception 'Event unavailable'; end if;

  select * into b
  from public.bookings
  where event_id=p_event and user_id=u
  for update;

  if b.id is null then raise exception 'Booking not found'; end if;
  if b.checked_in_at is not null then raise exception 'Checked-in bookings cannot be cancelled'; end if;
  if now()>=e.starts_at-make_interval(mins=>e.lockdown_minutes) then
    raise exception 'Event cancellation is locked';
  end if;

  delete from public.bookings
  where id=b.id;

  if b.credit_lot_id is not null then
    update public.credit_lots
    set remaining=least(quantity,remaining+1)
    where id=b.credit_lot_id and user_id=u;
  end if;

  update public.reminder_deliveries
  set status='cancelled',updated_at=now()
  where event_id=p_event
    and user_id=u
    and status in('queued','processing');

  return true;
end;
$$;


commit;
