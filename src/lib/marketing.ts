import { NextRequest,NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { marketingAdministrationApi } from './marketing-admin-api';
import { CAMPAIGN_VERSION } from './marketing-campaign';
import { contentWorkflowApi,startContentWorkflow } from './marketing-content-controller';
import { draftQuality } from './marketing-editorial';
import { generationOverview } from './marketing-generation';
import { growthOverview } from './marketing-growth';
import { providerConfigured,supportedPhotoSources } from './marketing-photo-providers';
import { fullReviewPhotoUrl } from './marketing-photo-rights';
import { mergePreflightQuality,reviewMarketingDraft } from './marketing-preflight-service';
import { reelsApi } from './marketing-reels';
import { listStockSelections,requiredStockSlots,reviewStockAsset,stockReady } from './marketing-stock-photos';
import { marketingStoryApi } from './marketing-stories';
import { factPackReady } from './marketing-trend-guide';
import { runTrendRadar,trendOverview } from './marketing-trend-radar';
import type { createClient } from './supabase/server';
import { createServiceRoleClient } from './supabase/service';
type Client=Awaited<ReturnType<typeof createClient>>;
type Row=Record<string,any>;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const checked=(r:any)=>{if(r.error)throw r.error;return r.data;};
function campaignMetaFromSnapshot(snapshot:Row|null|undefined){
 const doc=snapshot?.content_document||{},pattern=String(snapshot?.campaign_pattern||doc.campaign_pattern||''),tone=String(snapshot?.campaign_tone||doc.campaign_tone||'');
 if(String(snapshot?.render_style||'')!=='campaign'&&doc.design_preset!=='roundy_prelaunch_campaign_v1')return null;
 if(!['poster','problem_solution','how_it_works','benefit_stack','countdown'].includes(pattern)||!['modern_premium','soft_romantic','bold_teaser'].includes(tone))return null;
 return {render_style:'campaign',campaign_pattern:pattern,campaign_tone:tone,campaign_version:String(snapshot?.campaign_version||doc.campaign_version||CAMPAIGN_VERSION),launch_date:snapshot?.launch_date||doc.launch_date||null};
}
function eventCampaignMetaFromSnapshot(snapshot:Row|null|undefined){
 const doc=snapshot?.content_document||{},stage=String(snapshot?.event_campaign_stage||doc.event_campaign_stage||''),pattern=String(snapshot?.event_campaign_pattern||doc.event_campaign_pattern||'');
 if(doc.design_preset!=='roundy_live_event_campaign_v1'&&!stage)return null;
 if(!['launch','experience','venue','participants','momentum','imminent','last_call'].includes(stage)||!['event_poster','experience','social_proof','offer','last_call'].includes(pattern))return null;
 return {render_style:'campaign',event_campaign_stage:stage,event_campaign_pattern:pattern,event_campaign_version:String(snapshot?.event_campaign_version||doc.campaign_version||'live_event_campaign_v1'),event_facts_snapshot:snapshot?.event_facts_snapshot||doc.event_facts||null,event_id:snapshot?.event_id||doc.event_id||null};
}
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
 // Retired draft mutations must not reach an old paid writer or bypass current approvals.
 if(id==='draft'){
  if(path.length===2&&path[1]==='generate'&&req.method==='POST'){
   const actor=(await db.auth.getUser()).data.user;if(!actor)return json({error:'Sign in required'},401);
   return json(await startContentWorkflow(service,await req.json(),actor.id),202);
  }
  return json({error:'CONTENT_WORKFLOW_REQUIRED',message:'Use the content library workflow. Saved records are preserved.'},410);
 }
 if(id==='generation'&&path[1]==='jobs'&&req.method!=='GET')return json({error:'CONTENT_WORKFLOW_REQUIRED'},410);
 if(id==='contents'){const actor=(await db.auth.getUser()).data.user;if(!actor)return json({error:'Sign in required'},401);return contentWorkflowApi(req,service,path.slice(1),actor.id);}

 async function recheckForPublishing(draft:Row){
  const preflight=await reviewMarketingDraft(service,draft),report=mergePreflightQuality(draftQuality(draft),preflight);
  const stored=checked(await service.rpc('set_marketing_quality',{
   p_draft:draft.id,p_revision:draft.revision,p_report:report
  }));
  return {preflight,report,draft:stored};
 }
 if(id==='quality'&&path[1]==='preflight'&&path.length===2&&req.method==='GET'){
  const draftId=String(req.nextUrl.searchParams.get('draft_id')||'');
  if(!uuid(draftId))return json({error:'INVALID_DRAFT_ID'},400);
  const d=checked(await service.from('instagram_post_drafts').select('*').eq('id',draftId).maybeSingle());
  if(!d)return json({error:'DRAFT_NOT_FOUND'},404);
  const preflight=await reviewMarketingDraft(service,d);
  return json({draft_id:d.id,preflight,quality_report:mergePreflightQuality(draftQuality(d),preflight),revision:d.revision});
 }
 if(id==='reels')return reelsApi(req,db,path.slice(1));
 if(id==='stories')return marketingStoryApi(req,db,path.slice(1));
 if(id==='runs'&&path.length===3&&uuid(path[1])&&path[2]==='attempts'&&req.method==='GET'){
  const run=checked(await service.from('marketing_runs').select('id,channel,status,snapshot,scheduled_for,message').eq('id',path[1]).maybeSingle());
  if(!run||run.channel!=='instagram'||run.snapshot?.media_kind==='reel')return json({error:'FEED_RUN_NOT_FOUND'},404);
  const [attempts,reviews]=await Promise.all([
   service.from('marketing_feed_publish_attempts').select('id,attempt_no,state,started_at,external_requested_at,finished_at,error_message,external_id')
    .eq('run_id',run.id).order('attempt_no',{ascending:true}),
   service.from('marketing_feed_retry_reviews').select('attempt_no,reviewed_at,review_note,confirmed_not_published')
    .eq('run_id',run.id).order('attempt_no',{ascending:true})
  ]);
  return json({run_id:run.id,attempts:checked(attempts),reviews:checked(reviews)});
 }
 if(id==='runs'&&path.length===3&&uuid(path[1])&&path[2]==='retry'&&req.method==='POST'){
  const body=await req.json().catch(()=>null);
  if(body?.confirm_no_post!==true||typeof body.note!=='string'||body.note.trim().length<12||body.note.length>500)
   return json({error:'CONFIRM_NOT_PUBLISHED_AND_REVIEW_NOTE_REQUIRED'},400);
  const user=(await db.auth.getUser()).data.user;if(!user)return json({error:'Sign in required'},401);
  try{
   const result=checked(await service.rpc('retry_marketing_feed_after_review',{
    p_run:path[1],p_actor:user.id,p_confirm_no_post:true,p_note:body.note.trim()
   }));
   return json(result);
  }catch(error){return json({error:error instanceof Error?error.message:'FEED_RETRY_NOT_ALLOWED'},409);}
 }

 if(id==='quality'&&path[1]==='recheck'&&path.length===2&&req.method==='POST'){
  const body=await req.json();if(!uuid(body.draft_id||'')||!Number.isInteger(body.revision))return json({error:'INVALID_REVIEW_REQUEST'},400);
  const d=checked(await service.from('instagram_post_drafts').select('*').eq('id',body.draft_id).single());
  if(d.revision!==body.revision)return json({error:'DRAFT_CHANGED_REFRESH_FIRST'},409);
  const {report,preflight,draft}=await recheckForPublishing(d);
  return json({draft,quality_report:report,preflight});
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
 // The existing reviewed licensed-photo library is shared across drafts. Read-only browse;
 // approval/rejection reuses the protected /photos/:id/review route below.
 if(id==='photos'&&path.length===2&&path[1]==='assets'&&req.method==='GET'){
  const onlyApproved=req.nextUrl.searchParams.get('status')==='approved';
  let photoQuery=service.from('marketing_photo_assets')
   .select('id,provider,provider_photo_id,source_url,image_url,preview_url,photographer,photographer_url,license_name,license_url,license_evidence_url,license_checked_at,commercial_use_allowed,modifications_allowed,attribution_required,search_query,review_status,review_note,reviewed_by,reviewed_at,storage_path,content_sha256,topic_key,created_at');
  if(onlyApproved)photoQuery=photoQuery.eq('review_status','approved');
  const all=checked(await photoQuery.order(onlyApproved?'reviewed_at':'created_at',{ascending:false}).limit(200)) as Row[];
  // Always preview the actual archived bytes that were approved, not a
  // provider hotlink that may have changed since human review.
  const stored=all.filter(asset=>asset.review_status==='approved'&&asset.storage_path);
  const signedResult=stored.length?await service.storage.from('marketing-images')
   .createSignedUrls(stored.map(asset=>String(asset.storage_path)),3600):null;
  const signed:Row[]=signedResult?.error?[]:(signedResult?.data||[]);
  const previews=new Map(signed.map((item,index)=>[stored[index]?.id,String(item.signedUrl||'')]));
  const previewAssets:Row[]=all.map((asset:Row):Row=>({...asset,
   preview_url:previews.get(asset.id)||asset.preview_url||asset.image_url,
   // Full original image for review; preserve the archived cropped thumbnail
   // separately for comparing the approved card render.
   review_preview_url:fullReviewPhotoUrl(asset)||asset.preview_url||asset.image_url}));
  const ids=previewAssets.map(asset=>asset.id);
  const usage=ids.length
   ?checked(await service.from('marketing_draft_photos')
     .select('asset_id,draft_id,slot').in('asset_id',ids).limit(2000)) as Row[]:[];
  const byAsset=new Map<string,Row[]>();
  for(const linked of usage){
   const key=String(linked.asset_id),previous=byAsset.get(key)||[];
   byAsset.set(key,[...previous,linked]);
  }
  return json({assets:previewAssets.map(asset=>({
   ...asset,used_by_count:(byAsset.get(asset.id)||[]).length,
   used_by_drafts:(byAsset.get(asset.id)||[]).slice(0,20)
  })),counts:{
   all:previewAssets.length,
   approved:previewAssets.filter(x=>x.review_status==='approved').length,
   pending:previewAssets.filter(x=>x.review_status==='pending').length,
   rejected:previewAssets.filter(x=>x.review_status==='rejected').length
  },limit:200,photo_policy:'Verified original source, commercial rights, modifications and human approval required'});
 }
 if(id==='photos'&&path.length===2&&path[1]==='attempts'&&req.method==='GET'){
   const draftId=String(req.nextUrl.searchParams.get('draft_id')||'');
   if(draftId&&!uuid(draftId))return json({error:'INVALID_DRAFT_ID'},400);
   let query=service.from('marketing_photo_source_attempts')
    .select('id,draft_id,provider,search_query,status,error_code,result_count,created_at')
    .order('created_at',{ascending:false}).limit(80);
   if(draftId)query=query.eq('draft_id',draftId);
   return json({attempts:checked(await query),limit:80});
 }
 // All photo actions are routed through the existing authenticated admin API.
 if(id==='photos'&&path.length===1&&req.method==='GET'){
  const draftId=String(req.nextUrl.searchParams.get('draft_id')||'');
  if(!uuid(draftId))return json({error:'INVALID_DRAFT_ID'},400);
  const draft=checked(await service.from('instagram_post_drafts').select('id,content_document,carousel_slides').eq('id',draftId).maybeSingle());
  if(!draft)return json({error:'DRAFT_NOT_FOUND'},404);
  const photos=await listStockSelections(service,draftId);
  const archived=photos.filter(photo=>photo.review_status==='approved'&&photo.storage_path);
  const archiveUrls=archived.length?await service.storage.from('marketing-images')
   .createSignedUrls(archived.map(photo=>String(photo.storage_path)),3600):null;
  const archivedPreview=new Map<string,string>((archiveUrls?.data||[]).map((photo,index)=>[
    String(archived[index].asset_id),String(photo.signedUrl||'')
  ]));
  const displayPhotos=photos.map(photo=>({...photo,preview_url:archivedPreview.get(String(photo.asset_id))||photo.preview_url}));
  const policy=draft.content_document?.photo_sourcing||null;
  const required=requiredStockSlots(draft).length;
  const minimum=Number(policy?.min_real_photos||required);
  const approved=photos.filter((photo:Row)=>photo.review_status==='approved'&&!!photo.storage_path).length;
  return json({photos:displayPhotos,ready:stockReady(draft,photos),required,minimum,approved,
   awaiting_review:!stockReady(draft,photos),
   missing:Math.max(0,minimum-approved),policy,
   provider:'Licensed stock',providers:supportedPhotoSources.map(provider=>({name:provider,configured:providerConfigured(provider)})),configured:true});
 }
 if(id==='photos'&&path.length===3&&uuid(path[1])&&path[2]==='review'&&req.method==='POST'){
  const body=await req.json().catch(()=>({})),status=String(body.status||'');
  if(!['approved','rejected'].includes(status)||body.confirm_rights_reviewed!==true)return json({error:'PHOTO_REVIEW_CONFIRMATION_REQUIRED'},400);
  const user=(await db.auth.getUser()).data.user;if(!user)return json({error:'Sign in required'},401);
  try{
   const photo=await reviewStockAsset(service,path[1],status as 'approved'|'rejected',user.id,String(body.note||''));
   return json({photo});
  }catch(error){return json({error:error instanceof Error?error.message:'PHOTO_REVIEW_FAILED'},400);}
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
  const response=await marketingAdministrationApi(req,db,path);if(!response.ok)return response;
  const data=await response.json();
  const [generation,trend,liveEvents,eventCampaignHistory]=await Promise.all([
   generationOverview(),
   trendOverview(),
   service.from('events').select('id,slug,title,title_ko,starts_at,venue,capacity,seats_remaining,price_gents,price_ladies,event_language,images,marketing_enabled').eq('status','live').is('deleted_at',null).eq('marketing_enabled',true).gt('starts_at',new Date().toISOString()).order('starts_at').limit(20),
   service.from('marketing_event_campaign_history').select('*').order('generated_at',{ascending:false}).limit(100)
  ]);
  if(liveEvents.error)throw liveEvents.error;if(eventCampaignHistory.error)throw eventCampaignHistory.error;
  const managedIds=(data.drafts||[]).length?checked(await service.from('marketing_contents').select('id').in('id',data.drafts.map((d:Row)=>d.id))):[];
  const managedSet=new Set(managedIds.map((d:Row)=>d.id));
  return json({...data,drafts:(data.drafts||[]).filter((d:Row)=>!managedSet.has(d.id)),generation:{...generation,jobs:(generation.jobs||[]).filter((j:Row)=>!j.content_id)},trend,live_events:(liveEvents.data||[]).filter((event:Row)=>!/^\s*\((?:test|테스트)\)/i.test(String(event.title||event.title_ko||''))),event_campaign_history:eventCampaignHistory.data||[]});
 }
 if(id==='generation'&&path.length===1&&req.method==='GET')return json(await generationOverview());
 if(id==='generation'&&path[1]==='control'&&path.length===2&&req.method==='PUT'){
  const body=await req.json();
  if(typeof body.enabled!=='boolean'||body.enabled&&body.confirm_resume!==true)return json({error:'Confirm the account/configuration has been checked before resuming.'},400);
  const patch=body.enabled?{enabled:true,blocked_reason:null,updated_at:new Date().toISOString()}:{enabled:false,updated_at:new Date().toISOString()};
  checked(await service.from('marketing_ai_control').update(patch).eq('singleton',true));return json(await generationOverview());
 }
 if(id==='growth'&&path.length===1&&req.method==='GET')return json(await growthOverview());
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
  if(!factPackReady(trend))return json({error:'TREND_FACT_PACK_NOT_READY',details:'The cached trend needs three sourced facts and a valid event date before generating content.'},409);
  const recentSince=new Date(Date.now()-30*1000).toISOString();
  const recent=checked(await service.from('marketing_generation_jobs').select('id,status').contains('request_payload',{trend_id:trendId}).gte('created_at',recentSince).limit(1));
  if(recent.length)return json({error:'GENERATION_COOLDOWN_30_SECONDS'},429);
  const user=(await db.auth.getUser()).data.user;if(!user)return json({error:'Sign in required'},401);
  return json(await startContentWorkflow(service,{request_key:'trend-manual:'+trendId+':'+randomUUID(),revision:1,
   mode:'both',visual_mode:'cards',visual_source:'stock',content_mode:'growth_carousel',topic_type:'seoul_trend',language,
   instruction:[trend.display_name,trend.content_angle||trend.summary||''].filter(Boolean).join(': ').slice(0,500)},user.id,'manual',{trend_id:trendId}),202);

 }
 if(path.some(p=>['generate','regenerate','growth-generate','render-uploaded','generation'].includes(p)))return json({error:'Invalid generation route'},404);
 return marketingAdministrationApi(req,db,path);
}
