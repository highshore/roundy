import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { createClient } from './supabase/server';
import { createServiceRoleClient } from './supabase/service';
import { marketingApi as legacyMarketingApi } from './marketing-legacy';
import { generationOverview, runGeneration, todayDraft } from './marketing-generation';
type Client=Awaited<ReturnType<typeof createClient>>;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const checked=(r:any)=>{if(r.error)throw r.error;return r.data;};
async function invokeMarketingWorker(db:Client,body:Record<string,unknown>,timeout=140000){
 const {data:{session},error:sessionError}=await db.auth.getSession();
 if(sessionError||!session?.access_token)throw new Error('Sign in required');
 const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/roundy-marketing',{
  method:'POST',
  headers:{Authorization:'Bearer '+session.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},
  body:JSON.stringify(body),
  signal:AbortSignal.timeout(timeout),
  cache:'no-store'
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(typeof payload.error==='string'?payload.error:'Publishing worker request failed');
 return payload;
}
// The caller has already checked origin, member session and admin role.
// No generation route, including malformed suffixes, can reach legacy AI code.
export async function marketingApi(req:NextRequest,db:Client,path:string[]){
 const id=path[0],service=createServiceRoleClient();
 if(!id&&req.method==='GET'){
  const response=await legacyMarketingApi(req,db,path);if(!response.ok)return response;
  const data=await response.json();return json({...data,generation:await generationOverview()});
 }
 if(id==='generation'&&path.length===1&&req.method==='GET')return json(await generationOverview());
 if(id==='generation'&&path[1]==='control'&&path.length===2&&req.method==='PUT'){
  const body=await req.json();
  if(typeof body.enabled!=='boolean'||body.enabled&&body.confirm_resume!==true)return json({error:'Confirm the account/configuration has been checked before resuming.'},400);
  const patch=body.enabled?{enabled:true,blocked_reason:null,updated_at:new Date().toISOString()}:{enabled:false,updated_at:new Date().toISOString()};
  checked(await service.from('marketing_ai_control').update(patch).eq('singleton',true));return json(await generationOverview());
 }
 if(id==='generation'&&path[1]==='jobs'&&path.length===4&&uuid(path[2])&&path[3]==='retry'&&req.method==='POST'){
  const confirmation=await req.json().catch(()=>({}));
  if(confirmation.confirm_retry!==true)return json({error:'RETRY_CONFIRMATION_REQUIRED'},400);
  const original=checked(await service.from('marketing_generation_jobs').select('*').eq('id',path[2]).maybeSingle());
  if(!original)return json({error:'Generation job not found'},404);
  if(original.status!=='failed'||original.automatic)return json({error:'RETRY_ONLY_FAILED_MANUAL'},400);
  if(!original.request_payload||typeof original.request_payload!=='object')return json({error:'RETRY_PAYLOAD_UNAVAILABLE'},400);
  const isPhoto=['photo','copy_photo'].includes(original.operation);
  if(isPhoto&&confirmation.confirm_paid_photo!==true)return json({error:'CONFIRM_PAID_PHOTO_FIRST'},400);
  const currentDraft=checked(await service.from('instagram_post_drafts').select('id,status,revision').eq('id',original.draft_id).maybeSingle());
  if(!currentDraft)return json({error:'Draft not found'},404);
  if(currentDraft.status!=='needs_approval')return json({error:'DRAFT_NOT_EDITABLE'},409);
  const user=(await db.auth.getUser()).data.user;if(!user)return json({error:'Sign in required'},401);
  const retryPayload={...original.request_payload,request_key:'retry:'+randomUUID(),revision:currentDraft.revision,confirm_photo:isPhoto};
  const result=await runGeneration(currentDraft.id,retryPayload,user.id);
  const retriedJob=result.job as Record<string,unknown>|undefined;
  if(typeof retriedJob?.id==='string')await service.from('marketing_generation_jobs').update({retry_of_job_id:original.id}).eq('id',retriedJob.id);
  return json({...result,retry_of_job_id:original.id},result.error?400:200);
 }
 if(id==='draft'&&path[1]==='generate'&&path.length===2&&req.method==='POST'){
  const body=await req.json().catch(()=>null);
  if(!body||typeof body.request_key!=='string')return json({error:'Refresh this page to use the cost-protected generator.'},400);
  const old=checked(await service.from('marketing_generation_jobs').select('*').eq('request_key',body.request_key).maybeSingle());
  if(old)return json({job:old,deduplicated:true});
  const draft=await todayDraft(),user=(await db.auth.getUser()).data.user;
  const result=await runGeneration(draft.id,{...body,revision:draft.revision},user?.id||null);return json(result,result.error?400:200);
 }
 if(id==='draft'&&path.length===3&&['regenerate','growth-generate'].includes(path[2])&&req.method==='POST'){
  if(!uuid(path[1]))return json({error:'Invalid draft'},400);
  const body=await req.json(),user=(await db.auth.getUser()).data.user;
  const result=await runGeneration(path[1],path[2]==='growth-generate'?{...body,content_mode:'growth_carousel',visual_mode:'cards'}:body,user?.id||null);return json(result,result.error?400:200);
 }
 if(path.some(p=>['generate','regenerate','growth-generate','generation'].includes(p)))return json({error:'Invalid generation route'},404);
 if(id==='draft'&&path[1]&&uuid(path[1])){
  if(req.method!=='GET'){
   const active=checked(await service.from('marketing_generation_jobs').select('id').eq('draft_id',path[1]).eq('status','running').gt('created_at',new Date(Date.now()-300000).toISOString()).limit(1));
   if(active.length)return json({error:'GENERATION_ALREADY_RUNNING'},409);
  }
  if(path.length===2&&req.method==='PUT'){
   const v=await req.json();
   if(!Number.isInteger(v.revision)||typeof v.caption!=='string'||!v.caption.trim()||v.caption.length>2000||typeof v.cta!=='string'||v.cta.length>80||typeof v.destination_url!=='string')return json({error:'Check the caption, CTA and draft revision.'},400);
   try{const u=new URL(v.destination_url);if(u.protocol!=='https:'||u.username||u.password)throw new Error();}catch{return json({error:'Use a valid HTTPS destination URL.'},400);}
   if(v.images!==undefined)return json({error:'Images are saved by the protected generation worker. Use render saved cards or generate photo.'},400);
   return json({draft:checked(await service.rpc('edit_marketing_draft',{p_id:path[1],p_revision:v.revision,p_patch:{caption:v.caption.trim(),cta:v.cta.trim(),destination_url:v.destination_url.trim()}}))});
  }
  if(path.length===3&&path[2]==='publish-now'&&req.method==='POST'){
   const body=await req.json();if(!Number.isInteger(body.revision))return json({error:'Refresh and review the current draft before publishing.'},400);
   const user=(await db.auth.getUser()).data.user;if(!user)return json({error:'Sign in required'},401);
   const queued=checked(await service.rpc('publish_marketing_draft_now',{p_id:path[1],p_revision:body.revision,p_actor:user.id}));
   let workerWarning='';
   try{await invokeMarketingWorker(db,{action:'process_queue'});}catch(error){workerWarning=error instanceof Error?error.message:'The publish worker response could not be confirmed.';}
   const run=checked(await service.from('marketing_runs').select('*').eq('id',queued.run.id).single());
   const draft=checked(await service.from('instagram_post_drafts').select('*').eq('id',path[1]).single());
   if(run.status==='sent')return json({draft,run,published:true});
   if(run.status==='failed')return json({draft,run,error:run.message||'Instagram publishing failed.'},400);
   if(run.status==='needs_review')return json({draft,run,published:false,needs_review:true,warning:run.message||workerWarning||'Instagram may have received the publish request. Check the account before resolving.'},202);
   return json({draft,run,published:false,pending:true,warning:workerWarning||'The post is queued for immediate processing. Refresh status before trying again.'},202);
  }
  if(path.length===3&&path[2]==='approve'&&req.method==='POST'){
   const body=await req.json();if(!Number.isInteger(body.revision))return json({error:'Refresh and review the current draft before approving.'},400);
   const user=(await db.auth.getUser()).data.user;if(!user)return json({error:'Sign in required'},401);
   return json(checked(await service.rpc('approve_marketing_draft',{p_id:path[1],p_revision:body.revision,p_actor:user.id})));
  }
 }
 return legacyMarketingApi(req,db,path);
}
