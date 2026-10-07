import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import ts from 'typescript';
const code=await readFile('src/lib/payments/bank-transfer.ts','utf8');
const exports={};new Function('exports',ts.transpile(code,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}))(exports);
assert.equal(exports.receiptIdentity('personal','010-1234-5678'),'01012345678');
assert.equal(exports.receiptIdentity('self',''),'0100001234');
assert.throws(()=>exports.receiptIdentity('personal','9601011234567'),'Never accept resident registration numbers');
assert.throws(()=>exports.receiptIdentity('business','abc1234567'));
assert.throws(()=>exports.taxAmounts(0,'taxable'));
assert.throws(()=>exports.taxAmounts(49000,''));
for(const n of [1000,29000,49000,31350]){const a=exports.taxAmounts(n,'taxable');assert.equal(Number(a.tax)+Number(a.supplyCost),n);}
assert.equal(exports.taxAmounts(49000,'taxfree').tax,'0');
assert.equal(exports.koreaDate(new Date('2026-10-07T15:00:00Z')),'20261008');
assert.equal(exports.bankTimestamp('20261008000000'),'2026-10-07T15:00:00.000Z');
assert.throws(()=>exports.bankTimestamp('20260230000000'));
assert.throws(()=>exports.bankAmount('100.5'));
assert.throws(()=>exports.bankAmount('3000000000'));
assert.equal(exports.receiptState(300),'issued');assert.equal(exports.receiptState(304),'reported');assert.equal(exports.receiptState(305),'review');

const db=new PGlite();
await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema roundy_private;
 create table members(id uuid primary key,deleted_at timestamptz);
 create table profiles(user_id uuid,profile jsonb);
 create table user_roles(user_id uuid,role text);
 create table events(id uuid primary key,status text,starts_at timestamptz,seats_remaining int,capacity int,theme text);
 create table bookings(id uuid primary key default gen_random_uuid(),event_id uuid,user_id uuid,terms_accepted_at timestamptz,payment_order_number text unique,unique(event_id,user_id));
 create table checkout_discount_redemptions(id uuid default gen_random_uuid(),kind text,code text,user_id uuid,event_id uuid,payment_order_number text,discount_amount int,status text,consumed_at timestamptz);
 create table marketing_promo_codes(code text,active boolean,starts_at timestamptz,ends_at timestamptz,allowed_user_id uuid,max_redemptions int,max_redemptions_per_user int);
 create table referral_codes(code text,referrer_user_id uuid,active boolean);
`);
const pricing=await readFile('supabase/migrations/20260929155543_event_payment_pricing.sql','utf8');
await db.exec(pricing.slice(pricing.indexOf('create table if not exists public.event_payment_orders('),pricing.indexOf('create unique index if not exists event_payment_one_active_order')));
await db.exec(`alter table event_payment_orders add column provider text,add column provider_payment_id text,add column provider_feedback_at timestamptz;
create unique index active_order on event_payment_orders(event_id,user_id) where status in ('pending_auth','charging','refunding');`);
function extract(sql,name){const start=sql.toLowerCase().indexOf('create or replace function '+name);assert.ok(start>=0);const end=sql.indexOf('$$;',start);return sql.slice(start,end+3);}
await db.exec(extract(await readFile('supabase/migrations/20261001030000_master_discount_code.sql','utf8'),'roundy_private.claim_event_payment_order'));
await db.exec(extract(await readFile('supabase/migrations/20261001031500_master_discount_hardening.sql','utf8'),'roundy_private.complete_event_payment_order'));
await db.exec(extract(pricing,'roundy_private.fail_event_payment_order'));
for(const [name,args] of [['claim_event_payment_order','text,uuid'],['complete_event_payment_order','text,uuid,text,jsonb,jsonb'],['fail_event_payment_order','text,uuid,text,text,jsonb,jsonb']]){
 await db.exec(`create function public.${name}(${args}) returns ${name.startsWith('claim')?'jsonb':name.startsWith('complete')?'uuid':'boolean'} language sql as $$select roundy_private.${name}(${args.split(',').map((_,i)=>'$'+(i+1)).join(',')})$$;`);
}
const migration=(await readdir('supabase/migrations')).find(x=>x.endsWith('_kb_bank_transfer_receipts.sql'));
await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const event=uid(100);
await db.query("insert into events values($1,'live',now()+interval '1 day',30,30,'Test')",[event]);
for(let n=1;n<=12;n++){await db.query('insert into members(id) values($1)',[uid(n)]);await db.query('insert into profiles values($1,$2)',[uid(n),{gender:'male'}]);}
await db.query("insert into user_roles values($1,'admin')",[uid(12)]);
const quote={gender:'male',base_amount:49000,code_discount_amount:0,gender_balance_discount_amount:0,time_discount_amount:0,boomerang_discount_amount:0,discount_amount:0,final_amount:49000};
const order=n=>'RNDY-B-'+uid(n);
const create=async(n,q=quote)=>db.query('select bank_transfer_create($1,$2,$3,null,$4,$5,$6,$7,$8,$9,$10,$11) result',[uid(n),event,order(n),q,'R'+String(n).padStart(7,'0'),'111122223333','Test owner','self','encrypted','self','taxable']);
async function deposit(tid,n,amount=49000,memo=null,offset='30 seconds'){
 await db.query(`insert into bank_transfer_transactions(tid,account_number,occurred_at,amount,memo) select $1,'111122223333',created_at+$4::interval,$2,$3 from bank_transfer_requests where order_number=$5`,[tid,amount,memo??'R'+String(n).padStart(7,'0'),offset,order(n)]);
}
const match=async(tid,manual=null,admin=null)=>(await db.query('select bank_transfer_match($1,$2,$3) result',[tid,manual,admin])).rows[0].result;
const status=async(n)=>(await db.query('select status from event_payment_orders where order_number=$1',[order(n)])).rows[0].status;
await create(1);await create(1); // resume has one immutable request and one seat
assert.equal((await db.query('select count(*)::int n from bookings')).rows[0].n,1);
await deposit('t1',1);assert.equal(await match('t1'),'matched');assert.equal(await match('t1'),'matched');assert.equal(await status(1),'completed');
assert.equal((await db.query('select count(*)::int n from bank_cash_receipts')).rows[0].n,1);
await deposit('t1-duplicate',1);assert.equal(await match('t1-duplicate'),'review');
await assert.rejects(db.query('select bank_transfer_abandon($1,$2)',[order(1),uid(1)]));assert.equal(await status(1),'completed');
await create(2);await deposit('t2',2,48000);assert.equal(await match('t2'),'review');assert.equal(await status(2),'charging');
await assert.rejects(match('t2',order(2),uid(12)),/does not match/);
await create(3);await deposit('t3',3,49000,'Sender name');assert.equal(await match('t3'),'unmatched');
await assert.rejects(match('t3',order(3),uid(1)),/Admin required/);
assert.equal(await match('t3',order(3),uid(12)),'matched');
await assert.rejects(match('t3',order(2),uid(12)),/already assigned/);
await create(4);await deposit('t4',4,49000,null,'2 hours');assert.equal(await match('t4'),'review');
await create(5);await db.query('select bank_transfer_abandon($1,$2)',[order(5),uid(5)]);await deposit('t5',5);assert.equal(await match('t5'),'review');assert.equal(await status(5),'failed');
await create(6);await db.query('update bank_transfer_requests set expires_at=now()-interval \'30 minutes\' where order_number=$1',[order(6)]);
await db.query("select bank_transfer_expire(now()-interval '1 hour')");assert.equal(await status(6),'charging','Outage does not expire unscanned requests');
await db.query('select bank_transfer_expire(now())');assert.equal(await status(6),'failed');
await assert.rejects(create(7,{...quote,code_kind:'marketing',code:'FREE',code_valid:true,code_discount_amount:49000,discount_amount:49000,final_amount:0}));
assert.equal((await db.query('select count(*)::int n from event_payment_orders where order_number=$1',[order(7)])).rows[0].n,0,'Invalid quote rolls back the entire order');
await create(7,{...quote,gender_balance_discount_amount:49000,discount_amount:49000,final_amount:0});
assert.equal(await status(7),'completed');
assert.equal((await db.query('select count(*)::int n from bank_cash_receipts where order_number=$1',[order(7)])).rows[0].n,0,'Free reservations do not issue receipts');
await create(11);
await db.query("update bank_transfer_requests set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where order_number=$1",[order(11)]);
await deposit('t11',11,49000,null,'30 minutes');
assert.equal(await match('t11'),'matched','On-time payment confirms even when collection is delayed');
await create(8);await deposit('t8',8,49000,null,'-5 minutes');assert.equal(await match('t8'),'review');
await create(9);await deposit('t9',9);await db.query('delete from bookings where payment_order_number=$1',[order(9)]);assert.equal(await match('t9'),'review');
await create(10);await deposit('t10',10);await db.query("update bank_transfer_transactions set account_number='99999999999' where tid='t10'");assert.equal(await match('t10'),'unmatched');
await db.query("select bank_transfer_match_batch(array['t1','t2','t3'])");
const token1=uid(300),token2=uid(301);
assert.equal((await db.query('select bank_transfer_lease($1) result',[token1])).rows[0].result,true);
assert.equal((await db.query('select bank_transfer_lease($1) result',[token2])).rows[0].result,false);
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 await assert.rejects(db.query('select * from bank_transfer_requests'),/permission denied/);
 await assert.rejects(db.query("select bank_transfer_match('t1')"),/permission denied/);
 await assert.rejects(db.query('select * from bank_cash_receipts'),/permission denied/);
 await db.exec('reset role');
}
const tables=await db.query("select relrowsecurity from pg_class where relname in ('bank_transfer_requests','bank_transfer_transactions','bank_cash_receipts','bank_transfer_sync')");assert.ok(tables.rows.every(r=>r.relrowsecurity));
await db.close();
console.log('PASS KB transfers: identifiers, KRW/KST, resume, exact matches, duplicate deposits, manual authorization, wrong amounts/accounts, late/cancelled/missing reservations, outage-aware expiry, worker lease, receipt states, RLS and RPC grants');
