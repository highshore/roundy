import { NextRequest, NextResponse } from 'next/server';
import type { createClient } from './supabase/server';
import { createServiceRoleClient } from './supabase/service';
import { marketingApi as legacyMarketingApi } from './marketing-legacy';
import { generationOverview, runGeneration, todayDraft } from './marketing-generation';
type Client=Awaited<ReturnType<typeof createClient>>;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const checked=(r:any)=>{if(r.error)throw r.error;return r.data;};
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
  if(path.length===3&&path[2]==='approve'&&req.method==='POST'){
   const body=await req.json();if(!Number.isInteger(body.revision))return json({error:'Refresh and review the current draft before approving.'},400);
   const user=(await db.auth.getUser()).data.user;if(!user)return json({error:'Sign in required'},401);
   return json(checked(await service.rpc('approve_marketing_draft',{p_id:path[1],p_revision:body.revision,p_actor:user.id})));
  }
 }
 return legacyMarketingApi(req,db,path);
}
