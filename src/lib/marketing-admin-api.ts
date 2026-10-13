import { NextRequest, NextResponse } from 'next/server';
import type { createClient } from './supabase/server';
import { createServiceRoleClient } from './supabase/service';
import { parseEditorialSettingsPatch } from './marketing-editorial-settings';

type Client=Awaited<ReturnType<typeof createClient>>;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});

async function invokeMarketingWorker(db:Client,body:Record<string,unknown>,timeout=45000){
 const {data:{session},error:sessionError}=await db.auth.getSession();
 if(sessionError||!session?.access_token)throw new Error('Sign in required');
 const result=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/roundy-marketing',{
  method:'POST',
  headers:{Authorization:'Bearer '+session.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},
  body:JSON.stringify(body),
  signal:AbortSignal.timeout(timeout)
 });
 const payload=await result.json().catch(()=>({}));
 if(!result.ok)throw new Error(typeof payload.error==='string'?payload.error:'Marketing request failed');
 return payload;
}

export async function marketingAdministrationApi(req:NextRequest,db:Client,path:string[]){
 const id=path[0];
 if(!id&&req.method==='GET'){
  const [templates,runs,settings,inbox,webhook,drafts,contentRecords,recommendations,insights]=await Promise.all([
   db.from('marketing_templates').select('*').order('updated_at',{ascending:false}),
   db.from('marketing_runs').select('*').order('created_at',{ascending:false}).limit(100),
   db.from('marketing_automation_settings').select('*').eq('singleton',true).single(),
   db.from('instagram_inbox').select('*').in('status',['new','needs_review','failed']).order('received_at',{ascending:false}).limit(100),
   createServiceRoleClient().rpc('instagram_webhook_setup_service'),
   db.from('instagram_post_drafts').select('*').eq('draft_role','candidate').eq('status','needs_approval').not('imported_at','is',null).order('imported_at',{ascending:false}).order('updated_at',{ascending:false}).limit(100),
   createServiceRoleClient().from('instagram_post_drafts').select('id,status,source_generation_job_id,marketing_run_id,content_language,content_mode,draft_kind,growth_topic_type,caption,content_document,carousel_slides,images,imported_at,updated_at,scheduled_for,approved_at').eq('draft_role','candidate').not('imported_at','is',null).order('updated_at',{ascending:false}).limit(200),
   db.from('instagram_posting_time_recommendations').select('*').order('dow'),
   db.from('instagram_post_insights').select('*').order('captured_at',{ascending:false}).limit(30)
  ]);
  for(const result of [templates,runs,settings,inbox,webhook,drafts,contentRecords,recommendations,insights])if(result.error)throw result.error;
  const {data:{session}}=await db.auth.getSession();
  const connection=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/roundy-marketing',{headers:{Authorization:'Bearer '+session?.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!},signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():null).catch(()=>null);
  const setup=webhook.data as {callback_key?:string;verify_token?:string;verified_at?:string|null;last_received_at?:string|null}|null;
  const callbackUrl=setup?.callback_key?process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/instagram-webhook?key='+encodeURIComponent(setup.callback_key):'';
  return json({
   templates:templates.data,
   runs:runs.data,
   settings:settings.data,
   drafts:drafts.data,
   content_records:contentRecords.data,
   recommendations:recommendations.data,
   insights:insights.data,
   inbox:inbox.data,
   webhook:{callback_url:callbackUrl,verify_token:setup?.verify_token??'',verified_at:setup?.verified_at??null,last_received_at:setup?.last_received_at??null},
   connection:connection??{instagram:false,koreapas:false,unavailable:true}
  });
 }
 // A standalone read endpoint and partial write route keep old automation forms/clients intact.
 if(id==='settings'&&path.length===1&&req.method==='GET'){
  const {data,error}=await db.from('marketing_automation_settings').select('*').eq('singleton',true).single();
  if(error)throw error;
  return json({settings:data});
 }
 if(id==='settings'&&path.length===1&&req.method==='PATCH'){
  const body=await req.json().catch(()=>null);
  const parsed=parseEditorialSettingsPatch(body);
  if(!parsed.ok)return json({error:parsed.error},400);
  const {data,error}=await db.from('marketing_automation_settings')
   .update(parsed.patch).eq('singleton',true).select('*').single();
  if(error)throw error;
  return json({settings:data});
 }
 if(id==='settings'&&req.method==='PUT'){
  const body=await req.json().catch(()=>null);
  const timePattern=/^([01]\d|2[0-3]):[0-5]\d(:00)?$/;
  const growthDays:number[]=Array.isArray(body?.growth_days)?body.growth_days.map((value:unknown)=>Number(value)):[];
  const growthCount=Number(body?.growth_posts_per_week),trendThreshold=Number(body?.trend_override_score??80),eventMax=Number(body?.event_campaign_max_posts??5);
  const trendRadar=body?.trend_radar_enabled??true,trendOverride=body?.trend_override_enabled??true,eventCampaign=body?.event_campaign_enabled??true,growthMode=body?.growth_mode_enabled??false;
  if(!body||typeof body.daily_instagram_enabled!=='boolean'||typeof body.auto_reply_enabled!=='boolean'||typeof body.optimization_enabled!=='boolean'||typeof body.growth_carousel_enabled!=='boolean'||typeof trendRadar!=='boolean'||typeof trendOverride!=='boolean'||typeof eventCampaign!=='boolean'||typeof growthMode!=='boolean'||typeof body.daily_time_kst!=='string'||typeof body.draft_generation_time_kst!=='string'||!['prelaunch','live_event'].includes(body.content_mode)||!timePattern.test(body.daily_time_kst)||!timePattern.test(body.draft_generation_time_kst)||!Number.isInteger(growthCount)||growthCount<0||growthCount>7||growthDays.some(day=>!Number.isInteger(day)||day<0||day>6)||new Set(growthDays).size!==growthDays.length||growthDays.length!==growthCount||!Number.isInteger(trendThreshold)||trendThreshold<60||trendThreshold>100||!Number.isInteger(eventMax)||eventMax<1||eventMax>5)return json({error:'Invalid automation settings'},400);
  const {data,error}=await db.from('marketing_automation_settings').update({
   daily_instagram_enabled:body.daily_instagram_enabled,
   daily_time_kst:body.daily_time_kst.slice(0,5),
   draft_generation_time_kst:body.draft_generation_time_kst.slice(0,5),
   optimization_enabled:body.optimization_enabled,
   auto_reply_enabled:body.auto_reply_enabled,
   content_mode:body.content_mode,
   growth_carousel_enabled:body.growth_carousel_enabled,
   growth_mode_enabled:growthMode,
   growth_posts_per_week:growthCount,
   growth_days:growthDays,
   trend_radar_enabled:trendRadar,
   trend_scan_interval_hours:168,
   trend_override_enabled:trendOverride,
   trend_override_score:trendThreshold,
   event_campaign_enabled:eventCampaign,
   event_campaign_max_posts:eventMax
  }).eq('singleton',true).select('*').single();
  if(error)throw error;return json({settings:data});
 }
 if(id==='inbox'&&path[1]==='reply'&&req.method==='POST'){
  const body=await req.json().catch(()=>null);
  if(!body||typeof body.inbox_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.inbox_id)||typeof body.reply!=='string'||!body.reply.trim()||body.reply.length>2000)return json({error:'Invalid inbox reply'},400);
  await invokeMarketingWorker(db,{action:'reply_inbox',inbox_id:body.inbox_id,reply:body.reply.trim()});
  return json({ok:true});
 }
 if(id==='inbox'&&path[1]==='ignore'&&req.method==='POST'){
  const body=await req.json().catch(()=>null);
  if(!body||typeof body.inbox_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.inbox_id))return json({error:'Invalid inbox item'},400);
  const {data,error}=await db.from('instagram_inbox').update({status:'ignored',decision_reason:'Dismissed by Roundy admin'}).eq('id',body.inbox_id).in('status',['new','needs_review','failed']).select('id').maybeSingle();
  if(error)throw error;if(!data)return json({error:'Inbox item is no longer waiting for review'},409);return json({ok:true});
 }
 if(id==='publish'&&req.method==='POST'){
  const body=await req.json();if(!/^[0-9a-f-]{36}$/i.test(body.template_id)||!/^[0-9a-f-]{36}$/i.test(body.request_key))return json({error:'Invalid publish request'},400);
  const result=await invokeMarketingWorker(db,{template_id:body.template_id,request_key:body.request_key},140000);
  return json(result);
 }
 if(id==='resolve'&&req.method==='POST'){
  const body=await req.json();if(typeof body.published!=='boolean'||!/^[0-9a-f-]{36}$/i.test(body.run_id))return json({error:'Invalid review'},400);
  const {error}=await db.rpc('resolve_marketing_run',{p_run:body.run_id,p_published:body.published});if(error)throw error;return json({ok:true});
 }
 if(id&&!/^[0-9a-f-]{36}$/i.test(id))return json({error:'Not found'},404);
 if(id&&req.method==='DELETE'){const {error}=await db.from('marketing_templates').delete().eq('id',id);if(error)throw error;return json({ok:true});}
 if((!id&&req.method==='POST')||(id&&req.method==='PUT')){
  const v=await req.json();
  const text=(key:string,max:number)=>{if(typeof v[key]!=='string'||v[key].length>max)throw new Error('Invalid '+key);return v[key].trim();};
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL+'/storage/v1/object/public/wis-event-images/';
  const input={channel:text('channel',20),name:text('name',100),title:text('title',120),caption:text('caption',2000),cta:text('cta',80),destination_url:text('destination_url',2000),images:v.images,days:v.days,time_kst:text('time_kst',8),enabled:v.enabled};
  if(!['instagram','koreapas'].includes(input.channel)||!input.name||typeof input.enabled!=='boolean'||!Array.isArray(input.days)||input.days.some((d:unknown)=>!Number.isInteger(d)||Number(d)<0||Number(d)>6)||!/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(input.time_kst))throw new Error('Check the template and schedule.');
  if(input.destination_url){const url=new URL(input.destination_url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Use an HTTPS destination URL.');}
  if(!Array.isArray(input.images)||input.images.length>10||input.images.some((src:unknown)=>typeof src!=='string'||!src.startsWith(base)||!/^[-a-f0-9]+\/[-a-f0-9]+\.jpg$/.test(src.slice(base.length))))throw new Error('Choose up to 10 uploaded JPEG images.');
  input.days=[...new Set(input.days)];if(!input.days.length)input.enabled=false;
  const q=id?db.from('marketing_templates').update(input).eq('id',id):db.from('marketing_templates').insert(input);
  const {data,error}=await q.select('*').single();if(error)throw error;return json({template:data},id?200:201);
 }
 return json({error:'Not found'},404);
}
