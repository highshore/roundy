import 'server-only';
import {createServiceRoleClient} from './supabase/service';
import {validateGenerationInput} from './marketing-generation';
import {resolveCarouselPlan} from './marketing-carousel-template';
import {EDITOR_FIRST_VERSION,seriesForTopic} from './marketing-editor-first';
import {listStockSelections,reviewStockAsset} from './marketing-stock-photos';
import {composeManualMagazineEdit} from './marketing-manual-slide';
import {draftQuality} from './marketing-editorial';
import {buildBilingualCaption} from './marketing-presentation';
import {reviewMarketingDraft,mergePreflightQuality} from './marketing-preflight-service';
import {createHash} from 'node:crypto';
import {factPackReady} from './marketing-trend-guide';
import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';
type Row=Record<string,any>;
type DB=ReturnType<typeof createServiceRoleClient>;
export function contentResult<T extends {data:any;error:any}>(r:T):T['data']{if(r.error)throw r.error;return r.data;}
const id=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const response=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function wakeContentWorkers(db:DB):Promise<void>{
 // The durable task remains queued even if best-effort delivery fails. Cron retries delivery, not AI work.
 try{const r=await db.rpc('dispatch_marketing_content_workflows');
 if(r.error)console.warn('Content worker delivery deferred to cron',r.error.code||'DELIVERY_DEFERRED');}
 catch{console.warn('Content worker delivery deferred to cron');}
}
export async function startContentWorkflow(db:DB,value:unknown,actor:string|null,origin:'manual'|'automatic'='manual',context:Row={}){
 const incoming=value as Row;
 // A server restart or browser refresh must recover the same content, not create another hidden draft.
 const input=validateGenerationInput({...incoming,mode:'both',visual_mode:'cards',visual_source:'stock',revision:1});
 if(origin==='manual'&&!actor)throw new Error('CONTENT_ACTOR_REQUIRED');
 const identity=JSON.stringify([origin,input.content_mode,input.topic_type||null,input.language||'ko',input.instruction||'',input.story_card_count??null,
  input.ai_image_slot===undefined?'default':input.ai_image_slot,input.editorial_series||null,input.event_id||null,input.event_campaign_stage||null,input.event_campaign_pattern||null,context.trend_id||null,context.editorial_idea_id||null]);
 const signature=createHash('sha256').update(identity).digest('hex');
 const prior=contentResult(await db.from('marketing_contents').select('*').eq('request_key',input.request_key).maybeSingle());
 if(prior){
  const first=contentResult(await db.from('marketing_content_versions').select('request_payload').eq('content_id',prior.id).eq('version',1).single());
  if(origin!=='automatic'&&first?.request_payload?.client_signature!==signature)throw new Error('IDEMPOTENCY_KEY_CONFLICT');
  await wakeContentWorkers(db);return {content:prior,deduplicated:true};
 }
 const settings=contentResult(await db.from('marketing_automation_settings').select('*').eq('singleton',true).single());
 const plan=resolveCarouselPlan(settings,settings.carousel_mode==='alternating'?1:null);
 if(!plan)throw new Error('CAROUSEL_SETTINGS_REQUIRED');
 if(context.editorial_idea_id){
  if(!id(context.editorial_idea_id)||![3,5].includes(Number(input.story_card_count)))throw new Error('EDITORIAL_STORY_COUNT_REQUIRED');
  // An explicitly edited source storyboard must not be rewritten by the legacy alternating scheduler.
  plan.mode='fixed';plan.reservation_number=null;plan.slide_count=input.story_card_count as 3|5;
 }else if(settings.carousel_mode==='fixed'&&input.story_card_count)plan.slide_count=input.story_card_count;
 if(input.content_mode==='live_event'){
  if(!id(input.event_id))throw new Error('EVENT_REQUIRED');
  const event=contentResult(await db.from('events').select('id,status,deleted_at,marketing_enabled,starts_at').eq('id',input.event_id).single());
  if(!event||event.status!=='live'||event.deleted_at||event.marketing_enabled===false||Date.parse(event.starts_at)<=Date.now())throw new Error('EVENT_NOT_MARKETABLE');
 }
 if(context.trend_id){
  if(!id(context.trend_id))throw new Error('TREND_NOT_FOUND');
  const trend=contentResult(await db.from('marketing_trends').select('*').eq('id',context.trend_id).single());
  if(!factPackReady(trend)||!['emerging','rising','peak'].includes(trend.status))throw new Error('TREND_FACT_PACK_NOT_READY');
 }
 const ai=plan.slide_count===5?(input.ai_image_slot===undefined?(settings.carousel_ai_thumbnail_enabled?0:null):input.ai_image_slot):null;
 const frozen={client_signature:signature,content_mode:input.content_mode,topic_type:input.topic_type||null,language:input.language||'ko',instruction:input.instruction||'',
  editorial_workflow_version:EDITOR_FIRST_VERSION,editorial_series:input.editorial_series||seriesForTopic(input.topic_type),
  story_card_count:plan.slide_count,carousel_plan:plan,answer_first_enabled:true,brand_outro_enabled:true,
  mode:'both',visual_mode:'cards',visual_source:'stock',ai_image_slot:ai,
  event_id:input.event_id||null,trend_id:context.trend_id||null,event_campaign_stage:input.event_campaign_stage||null,event_campaign_pattern:input.event_campaign_pattern||null,
  editorial_idea_id:context.editorial_idea_id||null,editorial_source_url:context.editorial_source_url||null,editorial_pillar:context.editorial_pillar||null,
  photo_settings:{carousel_min_real_photos_5:settings.carousel_min_real_photos_5,carousel_min_real_photos_3:settings.carousel_min_real_photos_3,
   carousel_ai_thumbnail_enabled:ai!==null}};
 const content=contentResult(await db.rpc('start_marketing_content',{p_key:input.request_key,p_input:frozen,p_origin:origin,p_actor:actor}));
 await wakeContentWorkers(db);
 return {content,deduplicated:false};
}
export async function contentDetail(db:DB,contentId:string){
 const content=contentResult(await db.from('marketing_contents').select('*').eq('id',contentId).single());
 const [draft,versions,steps,photos]=await Promise.all([
  db.from('instagram_post_drafts').select('*').eq('id',contentId).single(),
  db.from('marketing_content_versions').select('*').eq('content_id',contentId).order('version',{ascending:false}).limit(30),
  db.from('marketing_content_steps').select('id,version,step,attempt,status,error_code,error_message,created_at,started_at,finished_at,output,retry_note').eq('content_id',contentId).order('created_at',{ascending:false}).limit(80),
  listStockSelections(db,contentId)
 ]);
 const archived=photos.filter(p=>p.review_status==='approved'&&p.storage_path);
 const signed=archived.length?await db.storage.from('marketing-images').createSignedUrls(archived.map(p=>String(p.storage_path)),3600):null;
 const urls=new Map((signed?.data||[]).map((entry:Row,index:number)=>[archived[index]?.asset_id,entry.signedUrl]));
 return {content,draft:contentResult(draft),versions:contentResult(versions),steps:contentResult(steps),
  photos:photos.map(p=>({...p,preview_url:urls.get(p.asset_id)||p.preview_url||p.image_url}))};
}
/** Invoked only inside the existing origin/member/admin-authenticated marketing API. */
export async function contentWorkflowApi(req:NextRequest,db:DB,path:string[],actor:string){
 const key=path[0];
 if(!key&&req.method==='GET'){
  const cursor=req.nextUrl.searchParams.get('before');
  let query=db.from('marketing_contents').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);
  if(cursor){const [timestamp,rowId]=cursor.split('|'),parsed=Date.parse(timestamp);if(!Number.isFinite(parsed)||!id(rowId))return response({error:'INVALID_CURSOR'},400);if(!/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+]00:00)$/.test(timestamp))return response({error:'INVALID_CURSOR'},400);const at=timestamp;query=query.or('created_at.lt.'+at+',and(created_at.eq.'+at+',id.lt.'+rowId+')');}
  const rows=contentResult(await query) as Row[];
  const contents=rows.slice(0,50),ids=contents.map(c=>c.id);
  const drafts=ids.length?contentResult(await db.from('instagram_post_drafts').select('id,caption,carousel_slides,images,content_language').in('id',ids)):[];
  const byId=new Map((drafts||[]).map((d:Row)=>[d.id,d]));
  const enabled=contentResult(await db.from('marketing_content_workflow_control').select('enabled').eq('singleton',true).single())?.enabled===true;
  return response({enabled,contents:contents.map(c=>({...c,preview:byId.get(c.id)||null})),next_cursor:rows.length>50?contents.at(-1)?.created_at+'|'+contents.at(-1)?.id:null});
 }
 if(!key&&req.method==='POST')return response(await startContentWorkflow(db,await req.json(),actor),202);
 if(key==='adopt'&&path.length===1&&req.method==='POST'){
  const body=await req.json();if(!id(body.draft_id)||!Number.isInteger(body.revision)||body.confirm_adopt!==true)throw new Error('CONTENT_ADOPTION_CONFIRMATION_REQUIRED');
  const old=contentResult(await db.from('instagram_post_drafts').select('*').eq('id',body.draft_id).single());
  if(!old||old.status!=='needs_approval'||old.draft_role!=='candidate'||!old.imported_at||old.revision!==body.revision)throw new Error('DRAFT_CHANGED_REFRESH_FIRST');
  const plan=old.content_document?.carousel_template,policy=old.content_document?.photo_sourcing;
  if(old.content_document?.design_preset!=='roundy_magazine_editorial_v2'||old.content_document?.brand_outro_version!==1||policy?.version!==2||old.visual_source!=='stock')throw new Error('LEGACY_FORMAT_USE_EXISTING_EDITOR');
  const settings=contentResult(await db.from('marketing_automation_settings').select('*').eq('singleton',true).single());
  const input={mode:'both',visual_mode:'cards',visual_source:'stock',content_mode:old.draft_kind==='growth_carousel'?'growth_carousel':old.content_mode,
   topic_type:old.growth_topic_type||null,language:old.content_language,instruction:old.content_document.editorial_subject||'',
   editorial_workflow_version:2,editorial_series:old.content_document.editorial_series||seriesForTopic(old.growth_topic_type),
   carousel_plan:plan,story_card_count:plan.slide_count,ai_image_slot:policy.ai_image_slot??null,answer_first_enabled:true,brand_outro_enabled:true,
   event_id:old.event_id||null,trend_id:old.trend_id||null,adopted_revision:old.revision,photo_settings:{carousel_min_real_photos_5:settings.carousel_min_real_photos_5,carousel_min_real_photos_3:settings.carousel_min_real_photos_3,carousel_ai_thumbnail_enabled:policy.ai_image_slot!=null}};
  const content=contentResult(await db.rpc('start_marketing_content',{p_key:'adopt:'+old.id,p_input:input,p_origin:'adopted',p_actor:actor,p_existing:old.id}));
  await wakeContentWorkers(db);return response({content},202);
 }
 if(!id(key))return response({error:'CONTENT_NOT_FOUND'},404);
 if(path.length===1&&req.method==='GET')return response(await contentDetail(db,key));
 if(path.length!==2||req.method!=='POST')return response({error:'CONTENT_ROUTE_NOT_FOUND'},404);
 const action=path[1],body=await req.json();
 if(!body||!Number.isSafeInteger(body.state_version)||body.state_version<1)return response({error:'CONTENT_STATE_REQUIRED'},400);
 const detail=await contentDetail(db,key),c=detail.content,draft=detail.draft;
 if(c.state_version!==body.state_version)return response({error:'CONTENT_CHANGED_REFRESH'},409);
 let result:Row;
 if(action==='resume'){
  result={content:contentResult(await db.rpc('resume_marketing_content',{p_content:key,p_state:body.state_version,
   p_confirm_paid:body.confirm_paid===true,p_note:typeof body.note==='string'?body.note.slice(0,500):null,p_confirm_unknown:body.confirm_unknown===true,p_step:body.step||null}))};
  await wakeContentWorkers(db);
 }else if(action==='refine'){
  if(typeof body.instruction!=='string'||body.instruction.trim().length<1||body.instruction.length>500)throw new Error('INSTRUCTION_LIMIT_500');
  result={content:contentResult(await db.rpc('refine_marketing_content_subject',{p_content:key,p_state:body.state_version,p_instruction:body.instruction.trim(),p_actor:actor,p_confirm_paid:body.confirm_paid===true}))};
  await wakeContentWorkers(db);
 }else if(action==='edit'){
  if(!Array.isArray(body.edits)||body.edits.length>5||
   (!body.edits.length&&body.caption===undefined&&body.caption_ko===undefined&&body.caption_en===undefined))
   throw new Error('CONTENT_EDITS_REQUIRED');
  let changed={...draft};const seen=new Set<number>();
  for(const edit of body.edits){
   if(!Number.isInteger(edit.index)||seen.has(edit.index))throw new Error('INVALID_MANUAL_SLIDE_INDEX');seen.add(edit.index);
   const safe=composeManualMagazineEdit(changed,{...edit,request_key:'manual:'+crypto.randomUUID(),revision:draft.revision});
   changed={...changed,content_document:safe.document,carousel_slides:safe.slides};
  }
  if(body.caption!==undefined){if(typeof body.caption!=='string'||!body.caption.trim()||body.caption.length>2000)throw new Error('INVALID_CAPTION');changed.caption=body.caption.trim();}
  // Edit both caption bodies without starting a new AI request. Rebuild the
  // footer using server-controlled sources, hashtags and official account.
  const captions:Row={...changed.content_document};let captionEdited=false;
  for(const [field,limit] of [['caption_ko',400],['caption_en',520]] as const){
   if(body[field]===undefined)continue;
   if(typeof body[field]!=='string'||body[field].length>limit)throw new Error('INVALID_'+field.toUpperCase());
   const value=body[field].replace(/\r\n?/g,'\n').trim();
   if(captions[field]!==value){captions[field]=value;captionEdited=true;}
  }
  if(captionEdited){
   const type=String(changed.growth_topic_type||changed.content_mode||'');
   const entertainment=['mbti','dating_archetype','mini_quiz'].includes(type);
   captions.caption=String(captions[changed.content_language==='en'?'caption_en':'caption_ko']||'');
   changed.content_document=captions;
   changed.caption=buildBilingualCaption(captions,Array.isArray(changed.research_sources)?changed.research_sources:[],
    entertainment?'재미와 자기 성찰을 위한 콘텐츠이며 성격이나 궁합을 판정하지 않습니다.':'',
    entertainment?'For entertainment and reflection, not a personality or compatibility assessment.':'');
   if(changed.caption.length>2000)throw new Error('CAPTION_OVER_2000');
  }
  // Persist invalidated downstream artifacts, not user-supplied approvals, roles or source IDs.
  // A previous formatting rejection is not a permanent approval latch. Re-evaluate
  // the edited copy below; keep factual/source and translation gates unchanged.
  changed={...changed,content_document:{...changed.content_document,editorial_review_required:false},images:[],quality_revision:null,approved_at:null,approved_by:null};
  const report=draftQuality({...changed,content_document:{...changed.content_document,thumbnail_render_pending:false}});
  const snapshot={caption:changed.caption,cta:changed.cta,content_document:changed.content_document,carousel_slides:changed.carousel_slides,
   content_language:changed.content_language,research_sources:changed.research_sources,research_status:changed.research_status,
   draft_kind:changed.draft_kind,growth_topic_type:changed.growth_topic_type,content_mode:changed.content_mode,destination_url:changed.destination_url,quality_report:report};
  result={content:contentResult(await db.rpc('edit_marketing_content_copy',{p_content:key,p_state:body.state_version,p_snapshot:snapshot,p_actor:actor}))};
 }else if(action==='review-photo'){
  if(c.status!=='blocked'||c.stage!=='media'||!detail.photos.some((p:Row)=>p.asset_id===body.asset_id))throw new Error('CONTENT_PHOTO_NOT_REVIEWABLE');
  if(body.confirm_rights_reviewed!==true||!['approved','rejected'].includes(body.choice))throw new Error('PHOTO_REVIEW_CONFIRMATION_REQUIRED');
  const photo=await reviewStockAsset(db,body.asset_id,body.choice,actor,String(body.note||'').slice(0,500));
  result={photo,content:contentResult(await db.from('marketing_contents').select('*').eq('id',key).single())};
 }else if(action==='assign-photo'){
  if(!id(body.asset_id)||!Number.isInteger(body.slot))throw new Error('INVALID_PHOTO_ASSIGNMENT');
  result={content:contentResult(await db.rpc('assign_marketing_content_photo',{p_content:key,p_state:body.state_version,p_slot:body.slot,p_asset:body.asset_id}))};
 }else if(action==='approve'){
  if(body.confirm_publish!==true)throw new Error('PUBLICATION_CONFIRMATION_REQUIRED');
  const preflight=await reviewMarketingDraft(db,draft),report=mergePreflightQuality(draftQuality(draft),preflight);
  if(report.status!=='passed')return response({error:'MARKETING_PREFLIGHT_FAILED',report},409);
  result=contentResult(await db.rpc('approve_marketing_content',{p_content:key,p_state:body.state_version,p_actor:actor,p_report:report,p_immediate:body.immediate===true}));
 }else if(action==='archive'){
  if(body.confirm_archive!==true)throw new Error('ARCHIVE_CONFIRMATION_REQUIRED');
  result={content:contentResult(await db.rpc('archive_marketing_content',{p_content:key,p_state:body.state_version}))};
 }else return response({error:'CONTENT_ACTION_NOT_FOUND'},404);
 return response(result,action==='resume'?202:200);
}
