create or replace function roundy_private.audit_event_payment_order()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  kind text;
  op text:=upper(coalesce(tg_op,''));
begin
  if op='INSERT' then
    kind:='order_created';
  elsif new.status is distinct from old.status then
    kind:='status_changed';
  elsif new.provider_feedback_at is distinct from old.provider_feedback_at then
    kind:='provider_feedback';
  elsif new.provider_payment_id is distinct from old.provider_payment_id then
    kind:='provider_linked';
  elsif new.error_code is distinct from old.error_code then
    kind:='error_changed';
  else
    return new;
  end if;

  insert into public.event_payment_order_events(
    order_number,event_id,user_id,event_type,status_before,status_after,
    provider,provider_payment_id,provider_state,amount,error_code
  ) values(
    new.order_number,new.event_id,new.user_id,kind,
    case when op='INSERT' then null else old.status end,
    new.status,new.provider,new.provider_payment_id,
    new.payment_result->'payapp_feedback'->>'pay_state',
    new.amount,new.error_code
  );
  return new;
end;
$$;

revoke all on function roundy_private.audit_event_payment_order() from public,anon,authenticated;
