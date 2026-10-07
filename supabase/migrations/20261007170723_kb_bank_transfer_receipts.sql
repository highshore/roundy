begin;
alter table public.event_payment_orders drop constraint if exists event_payment_orders_provider_check;
alter table public.event_payment_orders add constraint event_payment_orders_provider_check
 check(provider is null or provider in ('payple','payapp','kb_transfer'));

-- No browser role can read receipt identifiers or bank activity. Receipt identity
-- is AES-GCM encrypted by the application; only a masked hint is exposed by API.
create table public.bank_transfer_requests (
 order_number text primary key references public.event_payment_orders(order_number),
 match_code text not null unique check(match_code ~ '^R[A-F0-9]{7}$'),
 account_number text not null,
 account_holder text not null,
 expires_at timestamptz not null,
 receipt_kind text not null check(receipt_kind in ('personal','business','self')),
 identity_cipher text not null,
 identity_hint text not null,
 tax_mode text not null check(tax_mode in ('taxable','taxfree')),
 created_at timestamptz not null default now()
);
create table public.bank_transfer_transactions (
 tid text primary key,
 account_number text not null,
 occurred_at timestamptz not null,
 amount integer not null check(amount>0),
 memo text not null,
 order_number text unique references public.event_payment_orders(order_number),
 state text not null default 'unmatched' check(state in ('unmatched','matched','review','ignored')),
 review_reason text,
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index bank_transfer_unmatched on public.bank_transfer_transactions(state,occurred_at);
create table public.bank_cash_receipts (
 order_number text primary key references public.event_payment_orders(order_number),
 mgt_key text not null unique check(length(mgt_key)<=24),
 status text not null default 'queued' check(status in ('queued','issuing','issued','reported','review')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 confirm_num text,
 trade_date text,
 nts_code text,
 provider_state integer,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index bank_cash_receipts_due on public.bank_cash_receipts(status,next_attempt_at);
create table public.bank_transfer_sync (
 id boolean primary key default true check(id),
 account_number text,
 job_id text,
 job_started_at timestamptz,
 job_end_date text,
 next_page integer not null default 1,
 last_success_at timestamptz,
 scanned_through timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 last_error text
);
insert into public.bank_transfer_sync(id) values(true);

alter table public.bank_transfer_requests enable row level security;
alter table public.bank_transfer_transactions enable row level security;
alter table public.bank_cash_receipts enable row level security;
alter table public.bank_transfer_sync enable row level security;
revoke all on public.bank_transfer_requests,public.bank_transfer_transactions,public.bank_cash_receipts,public.bank_transfer_sync from public,anon,authenticated;
grant all on public.bank_transfer_requests,public.bank_transfer_transactions,public.bank_cash_receipts,public.bank_transfer_sync to service_role;

-- All RPCs below are SECURITY INVOKER and service_role-only. No public definer
-- wrapper, no user_metadata authorization, no client-supplied payment amount.
create function public.bank_transfer_create(
 p_user uuid,p_event uuid,p_order text,p_code text,p_quote jsonb,p_match_code text,
 p_account text,p_holder text,p_kind text,p_cipher text,p_hint text,p_tax text
) returns text language plpgsql security invoker set search_path='' as $$
declare existing public.event_payment_orders; deadline timestamptz; q jsonb:=p_quote;
begin
 -- Serialize against both concurrent checkout requests and seat claims.
 select least(now()+interval '1 hour',starts_at) into deadline from public.events where id=p_event for update;
 if deadline is null or deadline<=now() then raise exception 'Event unavailable'; end if;
 select * into existing from public.event_payment_orders where event_id=p_event and user_id=p_user
 and status in ('pending_auth','charging','refunding') for update;
 if existing.order_number is not null then
   if existing.provider='kb_transfer' and existing.status='charging' then return existing.order_number; end if;
   raise exception 'Another payment or refund is in progress';
 end if;
 if (q->>'final_amount')::int<0 or (q->>'base_amount')::int<=0 then raise exception 'Invalid quote'; end if;
 if p_code is not null and (q->>'code_valid')::boolean is distinct from true then raise exception 'Invalid discount code'; end if;
 insert into public.event_payment_orders(order_number,charge_order_number,event_id,user_id,provider,status,gender,
 base_amount,code_kind,discount_code,code_discount_amount,gender_balance_discount_amount,time_discount_amount,time_discount_kind,
 boomerang_discount_amount,discount_amount,amount,pricing_snapshot,terms_accepted_at)
 values(p_order,p_order,p_event,p_user,'kb_transfer','pending_auth',q->>'gender',
 (q->>'base_amount')::int,q->>'code_kind',p_code,(q->>'code_discount_amount')::int,
 (q->>'gender_balance_discount_amount')::int,(q->>'time_discount_amount')::int,q->>'time_discount_kind',
 (q->>'boomerang_discount_amount')::int,(q->>'discount_amount')::int,(q->>'final_amount')::int,q,now());
 perform public.claim_event_payment_order(p_order,p_user);
 insert into public.bank_transfer_requests(order_number,match_code,account_number,account_holder,expires_at,receipt_kind,identity_cipher,identity_hint,tax_mode)
 values(p_order,p_match_code,p_account,p_holder,deadline,p_kind,p_cipher,p_hint,p_tax);
 if (q->>'final_amount')::int=0 then
  perform public.complete_event_payment_order(p_order,p_user,null,'{"free_checkout":true}','{"free_checkout":true}');
 end if;
 return p_order;
end; $$;

-- The transaction comes only from authenticated provider collection. A manual
-- assignment may override a mistyped memo but never amount, time, account, seat
-- availability or payment state. Expired/cancelled payments require a refund or
-- explicit new booking outside this automatic pipeline.
create function public.bank_transfer_match(p_tid text,p_order text default null,p_admin uuid default null)
returns text language plpgsql security invoker set search_path='' as $$
declare t public.bank_transfer_transactions; r public.bank_transfer_requests; o public.event_payment_orders; candidate text;
begin
 select * into t from public.bank_transfer_transactions where tid=p_tid for update;
 if t.tid is null then raise exception 'Transaction not found'; end if;
 if t.order_number is not null then
  if p_order is not null and p_order<>t.order_number then raise exception 'Transaction already assigned'; end if;
  return 'matched';
 end if;
 if t.state='ignored' then return 'ignored'; end if;
 if p_order is not null then
  if p_admin is null or not exists(select 1 from public.user_roles where user_id=p_admin and role='admin') then raise exception 'Admin required'; end if;
  candidate:=p_order;
 else
  select order_number into candidate from public.bank_transfer_requests
   where match_code=upper(regexp_replace(t.memo,'\s','','g')) and account_number=t.account_number;
 end if;
 if candidate is null then return t.state; end if;
 -- Keep order lock first across match/expire/abandon paths.
 select * into o from public.event_payment_orders where order_number=candidate for update;
 select * into r from public.bank_transfer_requests where order_number=candidate;
 if o.provider is distinct from 'kb_transfer' or r.account_number<>t.account_number or o.amount<>t.amount
 or t.occurred_at<r.created_at-interval '5 seconds' or t.occurred_at>r.expires_at
 or o.status<>'charging' or not exists(select 1 from public.bookings where payment_order_number=candidate)
 or not exists(select 1 from public.events where id=o.event_id and status='live' and starts_at>now()) then
  if p_order is not null then raise exception 'Amount, account, deadline or reservation does not match'; end if;
  update public.bank_transfer_transactions set state='review',review_reason='amount_deadline_or_reservation_mismatch' where tid=p_tid;
  return 'review';
 end if;
 perform public.complete_event_payment_order(candidate,o.user_id,null,
 jsonb_build_object('bank','0004','tid',t.tid),jsonb_build_object('bank','0004','tid',t.tid));
 update public.event_payment_orders set paid_at=t.occurred_at,provider_payment_id=t.tid,provider_feedback_at=now() where order_number=candidate;
 update public.bank_transfer_transactions set order_number=candidate,state='matched',review_reason=null,reviewed_by=p_admin,
 reviewed_at=case when p_admin is not null then now() end where tid=p_tid;
 insert into public.bank_cash_receipts(order_number,mgt_key)
 values(candidate,'RB'||substr(md5(candidate),1,22)) on conflict(order_number) do nothing;
 return 'matched';
end; $$;

create function public.bank_transfer_abandon(p_order text,p_user uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare o public.event_payment_orders;
begin
 select * into o from public.event_payment_orders where order_number=p_order and user_id=p_user for update;
 if o.order_number is null or o.provider<>'kb_transfer' then raise exception 'Bank transfer not found'; end if;
 if o.status='failed' then return true; end if;
 if o.status not in ('pending_auth','charging') then raise exception 'Payment already confirmed; contact support for a refund'; end if;
 perform public.fail_event_payment_order(p_order,p_user,'bank-request-cancelled','Bank transfer request cancelled',null,null);
 return true;
end; $$;

create function public.bank_transfer_expire(p_scanned_through timestamptz)
returns integer language plpgsql security invoker set search_path='' as $$
declare o record; expired integer:=0;
begin
 -- Only after every page has been ingested/matched, and only through the bank
 -- request timestamp (with ten minutes of collection lag). Never expire during
 -- a bank outage. A late/unmatched deposit remains in the review inbox.
 for o in select e.order_number,e.user_id from public.event_payment_orders e
 join public.bank_transfer_requests r using(order_number)
 where e.provider='kb_transfer' and e.status in ('charging','pending_auth')
 and r.expires_at < least(p_scanned_through,now())-interval '10 minutes'
 for update of e skip locked loop
  perform public.fail_event_payment_order(o.order_number,o.user_id,'bank-deadline-expired','Bank transfer deadline expired',null,null);
  expired:=expired+1;
 end loop;
 return expired;
end; $$;

create function public.bank_transfer_lease(p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.bank_transfer_sync set lease_token=p_token,lease_until=now()+interval '5 minutes'
 where id and (lease_until is null or lease_until<now());
 return found;
end; $$;

revoke all on function public.bank_transfer_create(uuid,uuid,text,text,jsonb,text,text,text,text,text,text,text),
 public.bank_transfer_match(text,text,uuid),public.bank_transfer_abandon(text,uuid),public.bank_transfer_expire(timestamptz),public.bank_transfer_lease(uuid)
 from public,anon,authenticated;
grant execute on function public.bank_transfer_create(uuid,uuid,text,text,jsonb,text,text,text,text,text,text,text),
 public.bank_transfer_match(text,text,uuid),public.bank_transfer_abandon(text,uuid),public.bank_transfer_expire(timestamptz),public.bank_transfer_lease(uuid)
 to service_role;
create function public.bank_transfer_match_batch(p_tids text[])
returns void language plpgsql security invoker set search_path='' as $$
declare tid text;
begin
 if cardinality(p_tids)>1000 then raise exception 'Batch too large'; end if;
 foreach tid in array p_tids loop perform public.bank_transfer_match(tid); end loop;
end; $$;
revoke all on function public.bank_transfer_match_batch(text[]) from public,anon,authenticated;
grant execute on function public.bank_transfer_match_batch(text[]) to service_role;
commit;
