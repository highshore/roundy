import {savedCtaRecoverySource} from './marketing-output-recovery';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {draftQuality} from './marketing-editorial';
import type { createClient } from './supabase/server';
import { createServiceRoleClient } from './supabase/service';
import { marketingApi as legacyMarketingApi } from './marketing-legacy';
import { generationOverview, runGeneration, todayDraft } from './marketing-generation';
import {runTrendRadar,trendOverview} from './marketing-trend-radar';
type Client=Awaited<ReturnType<typeof createClient>>;
type Row=Record<string,any>;
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
 if(id==='quality'&&path[1]==='recheck'&&path.length===2&&req.method==='POST'){
  const body=await req.json();if(!uuid(body.draft_id||'')||!Number.isInteger(body.revision))return json({error:'INVALID_REVIEW_REQUEST'},400);
  const d=checked(await service.from('instagram_post_drafts').select('*').eq('id',body.draft_id).single());
  if(d.revision!==body.revision)return json({error:'DRAFT_CHANGED_REFRESH_FIRST'},409);
  const report=draftQuality(d),draft=checked(await service.rpc('set_marketing_quality',{p_draft:d.id,p_revision:d.revision,p_report:report}));
  return json({draft,quality_report:report});
 }
 if(id==='generation'&&path[1]==='jobs'&&path.length===4&&uuid(path[2])&&path[3]==='reject'&&req.method==='POST'){
  const body=await req.json();if(body.confirm_reject!==true)return json({error:'REJECT_CONFIRMATION_REQUIRED'},400);
  const result=checked(await service.rpc('reject_marketing_content',{p_job:path[2],p_reason:typeof body.reason==='string'?body.reason.slice(0,500):'관리자 품질 검토에서 재작업 요청'}));
  return json(result);
 }

 async function manualCandidate(draftId:string){
  const draft=checked(await service.from('instagram_post_drafts').select('id,status,revision,draft_role,generation_source,visual_source,content_mode,draft_kind,growth_topic_type,content_language').eq('id',draftId).maybeSingle());
  if(!draft)return null;
  if(draft.status!=='needs_approval'||draft.draft_role!=='candidate')throw new Error('DRAFT_NOT_EDITABLE');
  if(draft.generation_source!=='manual')throw new Error('UPLOAD_VISUALS_MANUAL_ONLY');
  return draft;
 }
 async function signedUploads(draftId:string){
  const rows=checked(await service.from('marketing_uploaded_images').select('*').eq('draft_id',draftId).order('sort_order',{ascending:true})) as Row[];
  return await Promise.all(rows.map(async(row:Row)=>{
   const signed=await service.storage.from('marketing-images').createSignedUrl(row.storage_path,3600);
   return {...row,signed_url:signed.data?.signedUrl||null};
  }));
 }
 if(id==='uploads'&&path.length===1&&req.method==='GET'){
  const draftId=req.nextUrl.searchParams.get('draft_id')||'';
  if(!uuid(draftId))return json({error:'INVALID_DRAFT_ID'},400);
  await manualCandidate(draftId);
  return json({images:await signedUploads(draftId)});
 }
 if(id==='uploads'&&path[1]==='register'&&path.length===2&&req.method==='POST'){
  const body=await req.json().catch(()=>({})),draftId=String(body.draft_id||''),storagePath=String(body.storage_path||''),assetType=String(body.asset_type||'photo'),role=String(body.role||'flexible');
  if(!uuid(draftId)||!storagePath||!['photo','completed_card'].includes(assetType)||!['cover','body','flexible'].includes(role))return json({error:'INVALID_UPLOAD_METADATA'},400);
  await manualCandidate(draftId);
  const active=checked(await service.from('marketing_generation_jobs').select('id').eq('draft_id',draftId).eq('status','running').gt('created_at',new Date(Date.now()-300000).toISOString()).limit(1));
  if(active.length)return json({error:'GENERATION_ALREADY_RUNNING'},409);
  const user=(await db.auth.getUser()).data.user;if(!user)return json({error:'Sign in required'},401);
  const expectedPrefix=user.id+'/'+draftId+'/';
  if(!storagePath.startsWith(expectedPrefix)||storagePath.includes('..'))return json({error:'INVALID_MARKETING_STORAGE_PATH'},400);
  const existing=checked(await service.from('marketing_uploaded_images').select('id').eq('draft_id',draftId).order('sort_order',{ascending:true})) as Row[];
  if(existing.length>=6){await service.storage.from('marketing-images').remove([storagePath]);return json({error:'MAXIMUM_6_MARKETING_IMAGES'},400);}
  const downloaded=await service.storage.from('marketing-images').download(storagePath);
  if(downloaded.error||!downloaded.data){await service.storage.from('marketing-images').remove([storagePath]);return json({error:'MARKETING_UPLOAD_NOT_FOUND'},400);}
  const raw=Buffer.from(await downloaded.data.arrayBuffer());
  if(!raw.length||raw.length>10*1024*1024){await service.storage.from('marketing-images').remove([storagePath]);return json({error:'Use JPEG, PNG or WebP, max 10 MB.'},400);}
  let meta;try{meta=await sharp(raw).metadata();}catch{await service.storage.from('marketing-images').remove([storagePath]);return json({error:'INVALID_IMAGE_FILE'},400);}
  const width=Number(meta.width||0),height=Number(meta.height||0),mimeType=meta.format==='png'?'image/png':meta.format==='webp'?'image/webp':meta.format==='jpeg'?'image/jpeg':'';
  if(!width||!height||!mimeType){await service.storage.from('marketing-images').remove([storagePath]);return json({error:'INVALID_IMAGE_FILE'},400);}
  if(assetType==='completed_card'&&Math.abs(width/height-.8)>.035){await service.storage.from('marketing-images').remove([storagePath]);return json({error:'COMPLETED_CARD_MUST_BE_4_5'},400);}
  try{
   const row=checked(await service.from('marketing_uploaded_images').insert({draft_id:draftId,storage_path:storagePath,sort_order:existing.length,role,asset_type:assetType,width,height,file_size:raw.length,mime_type:mimeType,created_by:user.id}).select('*').single());
   const signed=await service.storage.from('marketing-images').createSignedUrl(storagePath,3600);
   const warnings:string[]=[];if(Math.min(width,height)<800)warnings.push('IMAGE_RESOLUTION_LOW');
   return json({image:{...row,signed_url:signed.data?.signedUrl||null},warnings},201);
  }catch(error){
   await service.storage.from('marketing-images').remove([storagePath]);
   throw error;
  }
 }
 if(id==='uploads'&&path[1]==='order'&&path.length===2&&req.method==='PATCH'){
  const body=await req.json().catch(()=>({})),draftId=String(body.draft_id||''),ids=Array.isArray(body.ids)?body.ids.map(String):[];
  if(!uuid(draftId)||!ids.length||ids.length>6||ids.some((x:string)=>!uuid(x)))return json({error:'INVALID_MARKETING_IMAGE_ORDER'},400);
  await manualCandidate(draftId);
  checked(await service.rpc('reorder_marketing_uploaded_images',{p_draft:draftId,p_ids:ids}));
  return json({images:await signedUploads(draftId)});
 }
 if(id==='uploads'&&path.length===2&&uuid(path[1])&&req.method==='PATCH'){
  const body=await req.json().catch(()=>({})),row=checked(await service.from('marketing_uploaded_images').select('*').eq('id',path[1]).maybeSingle());
  if(!row)return json({error:'MARKETING_IMAGE_NOT_FOUND'},404);
  await manualCandidate(row.draft_id);
  const role=body.role===undefined?row.role:String(body.role),assetType=body.asset_type===undefined?row.asset_type:String(body.asset_type);
  if(!['cover','body','flexible'].includes(role)||!['photo','completed_card'].includes(assetType))return json({error:'INVALID_UPLOAD_METADATA'},400);
  if(assetType==='completed_card'&&Math.abs(Number(row.width)/Number(row.height)-.8)>.035)return json({error:'COMPLETED_CARD_MUST_BE_4_5'},400);
  checked(await service.from('marketing_uploaded_images').update({role,asset_type:assetType,updated_at:new Date().toISOString()}).eq('id',row.id));
  return json({images:await signedUploads(row.draft_id)});
 }
 if(id==='uploads'&&path.length===2&&uuid(path[1])&&req.method==='DELETE'){
  const row=checked(await service.from('marketing_uploaded_images').select('*').eq('id',path[1]).maybeSingle());
  if(!row)return json({error:'MARKETING_IMAGE_NOT_FOUND'},404);
  await manualCandidate(row.draft_id);
  checked(await service.storage.from('marketing-images').remove([row.storage_path]));
  checked(await service.from('marketing_uploaded_images').delete().eq('id',row.id));
  const remaining=checked(await service.from('marketing_uploaded_images').select('id').eq('draft_id',row.draft_id).order('sort_order',{ascending:true})) as Row[];
  if(remaining.length)checked(await service.rpc('reorder_marketing_uploaded_images',{p_draft:row.draft_id,p_ids:remaining.map((x:Row)=>x.id)}));
  return json({images:await signedUploads(row.draft_id)});
 }
 if(!id&&req.method==='GET'){
  const response=await legacyMarketingApi(req,db,path);if(!response.ok)return response;
  const data=await response.json();const [generation,trend]=await Promise.all([generationOverview(),trendOverview()]);return json({...data,generation,trend});
 }
 if(id==='generation'&&path.length===1&&req.method==='GET')return json(await generationOverview());
 if(id==='generation'&&path[1]==='control'&&path.length===2&&req.method==='PUT'){
  const body=await req.json();
  if(typeof body.enabled!=='boolean'||body.enabled&&body.confirm_resume!==true)return json({error:'Confirm the account/configuration has been checked before resuming.'},400);
  const patch=body.enabled?{enabled:true,blocked_reason:null,updated_at:new Date().toISOString()}:{enabled:false,updated_at:new Date().toISOString()};
  checked(await service.from('marketing_ai_control').update(patch).eq('singleton',true));return json(await generationOverview());
 }
 if(id==='trend-radar'&&path.length===1&&req.method==='GET')return json(await trendOverview());
 if(id==='trend-radar'&&path[1]==='run'&&path.length===2&&req.method==='POST'){
  const body=await req.json().catch(()=>({}));if(body.confirm_paid_scan!==true)return json({error:'TREND_SCAN_CONFIRMATION_REQUIRED'},400);
  const cooldownSince=new Date(Date.now()-10*60*1000).toISOString();
  const recentManual=checked(await service.from('marketing_trend_scans').select('id,created_at,status').like('scan_key','radar:manual:%').gte('created_at',cooldownSince).order('created_at',{ascending:false}).limit(1));
  if(recentManual.length)return json({error:'TREND_SCAN_MANUAL_COOLDOWN_10_MINUTES'},429);
  try{return json(await runTrendRadar('radar:manual:'+randomUUID()));}
  catch(error){return json({error:error instanceof Error?error.message:'Trend radar scan failed'},400);}
 }

 if(id==='trend-radar'&&path[1]==='generate'&&path.length===2&&req.method==='POST'){
  const body=await req.json().catch(()=>({})),trendId=String(body.trend_id||''),language=body.language==='en'?'en':body.language==='ko'?'ko':'';
  if(!uuid(trendId)||!language||body.confirm_generate!==true)return json({error:'INVALID_TREND_GENERATION_REQUEST'},400);
  const trend=checked(await service.from('marketing_trends').select('*').eq('id',trendId).maybeSingle());
  if(!trend)return json({error:'TREND_NOT_FOUND'},404);
  if(!['emerging','rising','peak'].includes(String(trend.status)))return json({error:'TREND_NOT_ACTIVE'},409);
  const recentSince=new Date(Date.now()-30*1000).toISOString();
  const recent=checked(await service.from('marketing_generation_jobs').select('id,status').contains('request_payload',{trend_id:trendId}).gte('created_at',recentSince).limit(1));
  if(recent.length)return json({error:'GENERATION_COOLDOWN_30_SECONDS'},429);
  const user=(await db.auth.getUser()).data.user;if(!user)return json({error:'Sign in required'},401);
  const workspace=await todayDraft(trend);
  const draft=workspace.trend_id===trendId&&workspace.content_language===language?workspace:checked(await service.from('instagram_post_drafts').insert({
   draft_date:new Date().toISOString().slice(0,10),draft_role:'candidate',status:'needs_approval',generation_source:'manual',visual_source:'auto_ai',
   content_language:language,content_mode:'prelaunch',draft_kind:'growth_carousel',growth_topic_type:String(trend.route_type||'seoul_trend'),
   trend_id:trendId,content_pillar:'seoul',caption:'',cta:'Follow @roundy.meet',destination_url:'https://roundy.team',images:[],carousel_slides:[],
   research_sources:[],research_status:'pending',generation_reason:'Manual Trend Radar content: '+String(trend.display_name),revision:1
  }).select('*').single());
  const instruction=[String(trend.display_name),String(trend.content_angle||trend.summary||'')].filter(Boolean).join(': ').slice(0,500);
  const result=await runGeneration(draft.id,{request_key:'trend-manual:'+trendId+':'+language+':'+randomUUID(),revision:draft.revision,mode:'both',visual_mode:'cards',visual_source:'auto_ai',content_mode:'growth_carousel',topic_type:String(trend.route_type||'seoul_trend'),language,instruction},user.id,false);
  if(result.job?.status==='completed')checked(await service.from('marketing_trends').update({used_at:new Date().toISOString(),cooldown_until:new Date(Date.now()+60*86400000).toISOString(),material_change:false,updated_at:new Date().toISOString()}).eq('id',trendId));
  return json(result,result.error?400:200);
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
  const threadId=original.generation_thread_id||original.id;
  const latest=checked(await service.from('marketing_generation_jobs').select('*').eq('generation_thread_id',threadId).order('attempt_number',{ascending:false}).order('created_at',{ascending:false}).limit(1).maybeSingle())||original;
  if(latest.id!==original.id||latest.status!=='failed')return json({error:'GENERATION_THREAD_NOT_RETRYABLE'},409);
  const currentDraft=checked(await service.from('instagram_post_drafts').select('id,status,revision').eq('id',original.draft_id).maybeSingle());
  if(!currentDraft)return json({error:'Draft not found'},404);
  if(currentDraft.status!=='needs_approval')return json({error:'DRAFT_NOT_EDITABLE'},409);
  const user=(await db.auth.getUser()).data.user;if(!user)return json({error:'Sign in required'},401);
  const recoverySourceJobId=savedCtaRecoverySource(latest);
  if(confirmation.recover_saved_result===true&&!recoverySourceJobId)return json({error:'SAVED_RESULT_RECOVERY_UNAVAILABLE'},409);
  const retryPayload={...latest.request_payload,request_key:(recoverySourceJobId?'recover:':'retry:')+randomUUID(),revision:currentDraft.revision,confirm_photo:isPhoto};
  const nextAttempt=Math.max(1,Number(latest.attempt_number||1))+1;
  try{
   const result=await runGeneration(currentDraft.id,retryPayload,user.id,false,{threadId,attemptNumber:nextAttempt,retryOfJobId:latest.id,...(recoverySourceJobId?{recoverySourceJobId}:{})});
   return json({...result,recovered_without_ai:false,recovered_saved_copy:!!recoverySourceJobId,fresh_visuals_generated:!!recoverySourceJobId,generation_thread_id:threadId,attempt_number:nextAttempt,retry_of_job_id:latest.id},result.error?400:200);
  }catch(error){return json({error:error instanceof Error?error.message:'Recovery or retry could not start'},400);}
 }
 if(id==='generation'&&path[1]==='jobs'&&path.length===4&&uuid(path[2])&&path[3]==='import'&&req.method==='POST'){
  const body=await req.json().catch(()=>({}));
  if(body.confirm_import!==true)return json({error:'IMPORT_CONFIRMATION_REQUIRED'},400);
  try{
   let imported=checked(await service.rpc('create_marketing_candidate_from_generation',{p_job_id:path[2]}));
   if(imported.status!=='needs_approval')return json({error:'RESULT_ALREADY_USED'},409);
   const source=checked(await service.from('marketing_generation_jobs').select('result_snapshot').eq('id',path[2]).single()),trendId=source?.result_snapshot?.trend_id;
   if(trendId){imported=checked(await service.from('instagram_post_drafts').update({trend_id:trendId,updated_at:new Date().toISOString()}).eq('id',imported.id).select('*').single());}
   return json({draft:imported});
  }catch(error){
   const message=error instanceof Error?error.message:String((error as {message?:unknown})?.message||'Import failed');
   return json({error:message.slice(0,500)},400);
  }
 }
 if(id==='generation'&&path[1]==='jobs'&&path.length===4&&uuid(path[2])&&path[3]==='restore'&&req.method==='POST'){
  const body=await req.json().catch(()=>({}));
  if(body.confirm_restore!==true)return json({error:'RESTORE_CONFIRMATION_REQUIRED'},400);
  const restored=checked(await service.rpc('restore_marketing_generation_snapshot',{p_job_id:path[2]}));
  return json({draft:restored});
 }
 if(id==='draft'&&path.length===3&&uuid(path[1])&&path[2]==='render-uploaded'&&req.method==='POST'){
  const body=await req.json().catch(()=>({})),draft=await manualCandidate(path[1]);
  if(!draft)return json({error:'Draft not found'},404);
  if(!Number.isInteger(body.revision)||body.revision!==draft.revision)return json({error:'DRAFT_CHANGED_REFRESH_FIRST'},409);
  const countResult=await service.from('marketing_uploaded_images').select('id',{count:'exact',head:true}).eq('draft_id',draft.id);
  if(countResult.error)throw countResult.error;
  if(Number(countResult.count||0)<1)return json({error:'UPLOADED_IMAGES_REQUIRED'},400);
  const user=(await db.auth.getUser()).data.user;if(!user)return json({error:'Sign in required'},401);
  const result=await runGeneration(draft.id,{
   request_key:typeof body.request_key==='string'?body.request_key:'upload-render:'+randomUUID(),
   revision:draft.revision,
   mode:'image',
   render_only:true,
   visual_mode:'cards',
   visual_source:'uploaded',
   content_mode:draft.draft_kind==='growth_carousel'?'growth_carousel':draft.content_mode,
   topic_type:draft.growth_topic_type||undefined,
   language:draft.content_language==='en'?'en':'ko',
   instruction:''
  },user.id,false);
  return json(result,result.error?400:200);
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
 if(path.some(p=>['generate','regenerate','growth-generate','render-uploaded','generation'].includes(p)))return json({error:'Invalid generation route'},404);
 if(id==='draft'&&path[1]&&uuid(path[1])){
  if(req.method!=='GET'){
   const active=checked(await service.from('marketing_generation_jobs').select('id').eq('draft_id',path[1]).eq('status','running').gt('created_at',new Date(Date.now()-300000).toISOString()).limit(1));
   if(active.length)return json({error:'GENERATION_ALREADY_RUNNING'},409);
  }
  if(path.length===2&&req.method==='PUT'){
   const v=await req.json();
   if(!Number.isInteger(v.revision)||typeof v.caption!=='string'||!v.caption.trim()||v.caption.length>2000||typeof v.cta!=='string'||v.cta.trim().length>70||!v.cta.trim()||typeof v.destination_url!=='string')return json({error:'Check the caption, CTA and draft revision.'},400);
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
