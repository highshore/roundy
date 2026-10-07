import 'server-only';
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { bankSettings, decryptIdentity } from './bank-transfer.server';
import { bankAmount, bankTimestamp, koreaDate, receiptState, taxAmounts } from './bank-transfer';
import { providerCall, ProviderError } from './popbill.server';

type Db = ReturnType<typeof createServiceRoleClient>;
const call = providerCall;
const errorCode = (e: unknown) => e instanceof ProviderError ? e.code : 'storage_or_validation_error';
async function must<T>(result: PromiseLike<{data:T;error:unknown}>) { const r=await result; if(r.error)throw r.error; return r.data; }

async function collect(db: Db) {
 const config = bankSettings();
 const corp = process.env.POPBILL_CORP_NUM!; const user = process.env.POPBILL_USER_ID!;
 let state = await must(db.from('bank_transfer_sync').select('*').eq('id',true).single());
 if (state.account_number && state.account_number !== config.account) throw new ProviderError('account_changed_requires_reconciliation');
 if (state.job_id && Date.now()-Date.parse(state.job_started_at)>50*60_000) {
  await must(db.from('bank_transfer_sync').update({job_id:null,next_page:1}).eq('id',true));
  state={...state,job_id:null};
 }
 if (!state.job_id) {
  const start = new Date(state.scanned_through ? Date.parse(state.scanned_through)-86400_000 : Date.now()-86400_000);
  if (Date.now()-start.getTime()>85*86400_000) throw new ProviderError('bank_history_gap_manual_backfill_required');
  const end = new Date(Math.min(Date.now(),start.getTime()+27*86400_000));
  const started = new Date().toISOString();
  const job = await call<string>('bank','requestJob',[corp,'0004',config.account,koreaDate(start),koreaDate(end),user]);
  if (!/^\d{18}$/.test(job)) throw new ProviderError('invalid_job_id');
  await must(db.from('bank_transfer_sync').update({account_number:config.account,job_id:job,job_started_at:started,job_end_date:koreaDate(end),next_page:1,last_error:null}).eq('id',true));
  return 'collection_requested';
 }
 const job = await call<{jobState:string;errorCode:number}>('bank','getJobState',[corp,state.job_id,user]);
 if (String(job.jobState)!=='3') return 'collecting';
 if (Number(job.errorCode)!==1) {
  await must(db.from('bank_transfer_sync').update({job_id:null,next_page:1}).eq('id',true));
  throw new ProviderError(String(job.errorCode));
 }
 type Transaction = {tid:string;trdt:string;accIn:string;accOut:string;remark1?:string};
 const result=await call<{code:number;pageCount:number;list:Transaction[]}>('bank','search',[corp,state.job_id,['I'],'',state.next_page,1000,'A',user]);
 if (Number(result.code)!==1 || !Array.isArray(result.list)) throw new ProviderError('invalid_collection_response');
 const rows=result.list.map(t=>{
  if (!t.tid || t.tid.length>32 || bankAmount(t.accOut)!==0 || bankAmount(t.accIn)<=0) throw new ProviderError('invalid_transaction');
  return {tid:t.tid,account_number:config.account,occurred_at:bankTimestamp(t.trdt),amount:bankAmount(t.accIn),memo:(t.remark1??'').slice(0,500)};
 });
 if (rows.length) {
  // Overlapping scans never replace the prior match/review decision.
  await must(db.from('bank_transfer_transactions').upsert(rows,{onConflict:'tid',ignoreDuplicates:true}));
  await must(db.rpc('bank_transfer_match_batch',{p_tids:rows.map(r=>r.tid)}));
 }
 if (state.next_page<result.pageCount) {
  await must(db.from('bank_transfer_sync').update({next_page:state.next_page+1}).eq('id',true));
  return 'page_collected';
 }
 const through=new Date(Math.min(Date.parse(state.job_started_at),Date.parse(bankTimestamp(state.job_end_date+'235959')))).toISOString();
 await must(db.rpc('bank_transfer_expire',{p_scanned_through:through}));
 await must(db.from('bank_transfer_sync').update({job_id:null,next_page:1,last_success_at:new Date().toISOString(),scanned_through:through,last_error:null}).eq('id',true));
 return 'collected';
}

type ReceiptInfo = {stateCode:number;confirmNum:string;tradeDate:string;ntsresultCode?:string;totalAmount:string;orderNumber:string};
async function processReceipt(db:Db, row:Record<string,unknown>, deadline:number) {
 const order = String(row.order_number), key=String(row.mgt_key);
 const corp = process.env.POPBILL_CORP_NUM!, user=process.env.POPBILL_USER_ID!;
 const now=new Date().toISOString();
 const payment=await must(db.from('event_payment_orders').select('status,amount').eq('order_number',order).single());
 if(!payment || payment.status!=='completed') {
  await must(db.from('bank_cash_receipts').update({status:'review',last_error:'payment_state_requires_review',updated_at:now}).eq('order_number',order));return;
 }
 try {
  const exists=await call<boolean>('receipt','checkMgtKeyInUse',[corp,key]);
  if (!exists) {
   // Never re-create a receipt we previously confirmed as issued/deleted outside Roundy.
   if (row.confirm_num || ['issued','reported'].includes(String(row.status))) throw new ProviderError('previously_issued_receipt_missing');
   if(Date.now()>deadline)return;
   const request=await must(db.from('bank_transfer_requests').select('receipt_kind,identity_cipher,tax_mode').eq('order_number',order).single());
   if(!request)throw new ProviderError('receipt_request_missing');
   await must(db.from('bank_cash_receipts').update({status:'issuing',attempts:Number(row.attempts)+1,updated_at:now}).eq('order_number',order));
   // No email/hp fields: issuing a receipt must not unexpectedly send messages.
   await call('receipt','registIssue',[corp,{
    mgtKey:key,tradeType:'승인거래',tradeUsage:request.receipt_kind==='business'?'지출증빙용':'소득공제용',
    ...taxAmounts(payment.amount,request.tax_mode),franchiseCorpNum:corp,
    franchiseCorpName:process.env.POPBILL_CORP_NAME ?? '',
    identityNum:decryptIdentity(request.identity_cipher,order),itemName:'Roundy event participation',orderNumber:order,smssendYN:false,
   },'Roundy bank transfer',user,'']);
  }
  if(Date.now()>deadline)return; // 'issuing' is recoverable by the same key next tick.
  const info=await call<ReceiptInfo>('receipt','getInfo',[corp,key,user]);
  if (String(info.orderNumber)!==order || Number(info.totalAmount)!==payment.amount) throw new ProviderError('receipt_data_mismatch');
  const status=receiptState(Number(info.stateCode));
  await must(db.from('bank_cash_receipts').update({status,confirm_num:info.confirmNum,trade_date:info.tradeDate,
   provider_state:info.stateCode,nts_code:info.ntsresultCode??null,
   last_error:status==='review'?'provider_state_'+info.stateCode:null,
   next_attempt_at:new Date(Date.now()+6*3600_000).toISOString(),updated_at:now,
  }).eq('order_number',order));
 } catch(error) {
  const attempts=Number(row.attempts)+1;
  await must(db.from('bank_cash_receipts').update({status:attempts>=6?'review':row.confirm_num?'issued':'queued',attempts,
   last_error:errorCode(error),next_attempt_at:new Date(Date.now()+Math.min(360,5*2**attempts)*60_000).toISOString(),updated_at:now,
  }).eq('order_number',order));
 }
}

export async function runBankWorker() {
 if (!bankSettings().enabled) return {enabled:false};
 const db=createServiceRoleClient(), token=randomUUID(), deadline=Date.now()+40_000;
 if (!await must(db.rpc('bank_transfer_lease',{p_token:token}))) return {busy:true};
 let bank='pending';
 try {
  try { bank=await collect(db); }
  catch(error) {
   bank='error';await must(db.from('bank_transfer_sync').update({last_error:errorCode(error)}).eq('id',true));
  }
  const receipts=await must(db.from('bank_cash_receipts').select('*').in('status',['queued','issuing','issued'])
   .lte('next_attempt_at',new Date().toISOString()).order('next_attempt_at').limit(4));
  for (const row of receipts??[]) {if(Date.now()>deadline)break;await processReceipt(db,row,deadline);}
  return {enabled:true,bank};
 } finally {
  await must(db.from('bank_transfer_sync').update({lease_token:null,lease_until:null}).eq('id',true).eq('lease_token',token));
 }
}
