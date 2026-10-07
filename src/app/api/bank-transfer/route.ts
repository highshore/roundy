import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { isMemberUser } from '@/lib/auth-user';
import { bankOrder, createBankOrder } from '@/lib/payments/bank-transfer.server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:NextRequest) {
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'Invalid origin'},403);
 const client=await createClient();const {data:{user},error}=await client.auth.getUser();
 if(error||!user||!isMemberUser(user))return json({error:'Sign in required'},401);
 const body=await req.json().catch(()=>null);
 if(!body||JSON.stringify(body).length>4096)return json({error:'Invalid request'},400);
 try {
  if(body.action==='create')return json(await createBankOrder(client,user.id,body));
  if(!/^RNDY-B-[0-9a-f-]{36}$/i.test(String(body.orderNumber??'')))return json({error:'Invalid order'},400);
  if(body.action==='status')return json(await bankOrder(user.id,body.orderNumber));
  if(body.action==='abandon') {
   const {error:cancelError}=await createServiceRoleClient().rpc('bank_transfer_abandon',{p_order:body.orderNumber,p_user:user.id});
   if(cancelError)throw cancelError;return json({abandoned:true});
  }
  return json({error:'Unknown action'},400);
 } catch(e) {return json({error:e instanceof Error?e.message:'Could not process bank transfer. Please contact support.'},400);}
}
