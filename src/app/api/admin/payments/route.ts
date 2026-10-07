import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { bankSettings } from '@/lib/payments/bank-transfer.server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function handle(req:NextRequest) {
 if(req.method!=='GET'&&req.headers.get('origin')!==req.nextUrl.origin)return json({error:'Invalid origin'},403);
 const client=await createClient();const {data:{user},error}=await client.auth.getUser();
 if(error||!user)return json({error:'Sign in required'},401);
 const admin=await client.rpc('is_admin');if(admin.error||admin.data!==true)return json({error:'Admin required'},403);
 const db=createServiceRoleClient();
 try {
  if(req.method==='GET') {
   const page=Number(req.nextUrl.searchParams.get('page')??0);
   if(!Number.isInteger(page)||page<0||page>10000)return json({error:'Invalid page'},400);
   const results=await Promise.all([
    db.from('bank_transfer_transactions').select('tid,occurred_at,amount,memo,state,review_reason,order_number',{count:'exact'}).in('state',['unmatched','review']).order('occurred_at',{ascending:false}).range(page*30,page*30+29),
    db.from('bank_cash_receipts').select('order_number,status,confirm_num,trade_date,nts_code,last_error,attempts,updated_at',{count:'exact'}).order('created_at',{ascending:false}).range(page*30,page*30+29),
    db.from('bank_transfer_sync').select('last_success_at,last_error,job_started_at').eq('id',true).single(),
    db.from('event_payment_orders').select('order_number,event_id,amount,status,created_at').eq('provider','kb_transfer').eq('status','charging').order('created_at',{ascending:false}).limit(100),
   ]);
   if(results.some(r=>r.error))throw new Error('Payment tables unavailable. Apply the migration first.');
   return json({enabled:bankSettings().enabled,transactions:results[0].data,transactionCount:results[0].count,receipts:results[1].data,receiptCount:results[1].count,sync:results[2].data,orders:results[3].data});
  }
  const body=await req.json().catch(()=>null);if(!body)return json({error:'Invalid request'},400);
  if(body.action==='match' && typeof body.tid==='string' && typeof body.orderNumber==='string') {
   const result=await db.rpc('bank_transfer_match',{p_tid:body.tid,p_order:body.orderNumber,p_admin:user.id});
   if(result.error)throw new Error('입금액, 계좌, 입금기한과 예약 상태를 다시 확인해 주세요.');
   return json({matched:result.data==='matched'});
  }
  if(body.action==='ignore' && typeof body.tid==='string') {
   const {error:writeError}=await db.from('bank_transfer_transactions').update({state:'ignored',reviewed_by:user.id,reviewed_at:new Date().toISOString()}).eq('tid',body.tid).is('order_number',null).in('state',['unmatched','review']);
   if(writeError)throw writeError;return json({saved:true});
  }
  if(body.action==='retry-receipt' && typeof body.orderNumber==='string') {
   // Same immutable management key; retry can never generate a second receipt.
   const {error:writeError}=await db.from('bank_cash_receipts').update({status:'queued',attempts:0,next_attempt_at:new Date().toISOString()}).eq('order_number',body.orderNumber).eq('status','review');
   if(writeError)throw writeError;return json({saved:true});
  }
  return json({error:'Unknown action'},400);
 } catch(e) {return json({error:e instanceof Error?e.message:'Payment operation failed'},400);}
}
export const GET=handle;export const POST=handle;
