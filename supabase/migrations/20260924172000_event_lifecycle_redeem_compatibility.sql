begin;

create or replace function wis_private.redeem(p_event uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); e public.wis_events; credit uuid; booking uuid;
begin
  if u is null then raise exception 'Sign in required';end if;
  select * into e from public.wis_events where id=p_event for update;
  select id into booking from public.wis_bookings where event_id=p_event and user_id=u;
  if booking is not null then return booking;end if;
  if e.id is null or e.status<>'live' or e.starts_at<=now() or e.seats_remaining<1 then raise exception 'No place available';end if;
  if not exists(select 1 from public.wis_applications where event_id=p_event and user_id=u and status='Approved') then raise exception 'Approval required';end if;
  select id into credit from public.wis_credit_lots where user_id=u and remaining>0 and expires_at>now() order by expires_at for update limit 1;
  if credit is null then raise exception 'No valid ticket available';end if;
  update public.wis_credit_lots set remaining=remaining-1 where id=credit;
  insert into public.wis_bookings(event_id,user_id,credit_lot_id) values(p_event,u,credit) returning id into booking;
  return booking;
end;
$$;

commit;
