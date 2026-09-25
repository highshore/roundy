import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 const appkey=Deno.env.get('KAKAO_APPKEY'),secret=Deno.env.get('KAKAO_SECRET_KEY'),senderKey=Deno.env.get('KAKAO_SENDER_KEY'),templateCode=Deno.env.get('KAKAO_TEMPLATE_CODE');
 const configured=Boolean(appkey&&secret&&senderKey&&templateCode);
 // The gateway verifies JWTs. This endpoint can only dispatch server-selected, due, admin-scheduled reminders.
 if(req.method==='GET')return response({configured});
 if(req.method!=='POST')return response({error:'Method not allowed'},405);
 if(!configured)return response({error:'Kakao Alimtalk credentials and a Roundy-approved template are required.'},503);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data:jobs,error}=await db.rpc('claim_reminders');if(error)return response({error:'Could not claim reminder jobs'},500);
 let sent=0,failed=0;
 for(const job of jobs||[]){
  const phone=String(job.phone||'').replace(/^\+82/,'0').replace(/\D/g,'');
  if(!/^01[016789]\d{7,8}$/.test(phone)){await db.from('reminder_deliveries').update({status:'failed',last_error:'A Korean mobile number is required for this Alimtalk sender',updated_at:new Date().toISOString()}).eq('id',job.id);failed++;continue;}
  try{
   const r=await fetch(`https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.2/appkeys/${appkey}/messages`,{method:'POST',headers:{'Content-Type':'application/json;charset=UTF-8','X-Secret-Key':secret!,'X-NC-API-IDEMPOTENCY-KEY':job.id},body:JSON.stringify({senderKey,templateCode,senderGroupingKey:job.id,recipientList:[{recipientNo:phone,resendParameter:{isResend:false},templateParameter:{'meetup-time':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'full',timeStyle:'short'}).format(new Date(job.starts_at)),'meetup-location':`${job.venue} (${job.address})`,'meetup-link':`https://roundy.team/events/${job.slug}`}}]}),signal:AbortSignal.timeout(12000)});
   const data=await r.json();const recipient=data.message?.sendResults?.[0];
   if(!r.ok||data.header?.isSuccessful!==true||!recipient||Number(recipient.resultCode)!==0)throw new Error('Provider did not confirm acceptance; check provider logs before retrying');
   const {error:saveError}=await db.from('reminder_deliveries').update({status:'sent',provider_reference:String(data.message?.requestId||job.id),updated_at:new Date().toISOString()}).eq('id',job.id);
   if(saveError)throw new Error('Provider accepted delivery, but receipt persistence failed; reconcile before retrying');
   sent++;
  }catch{
   // An ambiguous network result is never automatically retried (could duplicate a paid message).
   await db.from('reminder_deliveries').update({status:'failed',last_error:'Delivery not confirmed. Reconcile the provider request before retrying.',updated_at:new Date().toISOString()}).eq('id',job.id);failed++;
  }
 }
 return response({sent,failed});
});
