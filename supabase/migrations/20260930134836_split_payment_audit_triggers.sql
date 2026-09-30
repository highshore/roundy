begin;
drop trigger if exists audit_event_payment_order on public.event_payment_orders;
drop trigger if exists audit_event_payment_order_insert on public.event_payment_orders;
drop trigger if exists audit_event_payment_order_update on public.event_payment_orders;

create trigger audit_event_payment_order_insert
after insert on public.event_payment_orders
for each row execute function roundy_private.audit_event_payment_order();

create trigger audit_event_payment_order_update
after update on public.event_payment_orders
for each row execute function roundy_private.audit_event_payment_order();
commit;
