import 'server-only';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {createServiceRoleClient} from './supabase/service';
import {parseRegenerationRequest,targetedSlideIndices,estimatedUsd,applySelectiveRewrite,immutableContentSnapshot,unapprovedQuality,type RegenerationRequest,type Rewrite} from './marketing-regeneration-contract';
import {listStockSelections,approvedStockCardAssets,requiredStockSlots,stockReady} from './marketing-stock-photos';
import {supportedPhotoSources,providerConfigured,searchLicensedPhotos} from './marketing-photo-providers';
import {validLicensedPhoto} from './marketing-photo-rights';
import {photoCreditCaption} from './marketing-stock-photo-policy';
import {photoCardSourceLabel} from './marketing-photo-rights';
import {loadEditorialAssets} from './marketing-render-assets';
import {editorialCard,draftQuality} from './marketing-editorial';
import {campaignDraftQuality} from './marketing-campaign';
import {eventCampaignDraftQuality} from './marketing-event-campaign';
import {renderPrelaunchCampaign,renderLiveEventCampaign} from './marketing-visuals';
import {CAMPAIGN_PRESET,EVENT_CAMPAIGN_PRESET} from './marketing-presentation';
import {reviewMarketingDraft,mergePreflightQuality} from './marketing-preflight-service';

type DB=ReturnType<typeof createServiceRoleClient>;
type Row=Record<string,any>;
const ok=(result:{data:any;error:any})=>{if(result.error)throw result.error;return result.data;};
const uuid=(v:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const cloneColumns=[
 'draft_date','event_id','content_pillar','caption','cta','destination_url','images',
 'generation_reason','recommended_time_kst','window_start_kst','window_end_kst',
 'content_mode','draft_kind','growth_topic_type','carousel_slides','research_sources',
 'research_status','content_language','content_document','visual_source','trend_id','render_style',
 'campaign_pattern','campaign_tone','campaign_version','launch_date','event_campaign_stage',
 'event_campaign_pattern','event_campaign_version','event_facts_snapshot'
];
const COPY_MODEL='gpt-6-luna',IMAGE_MODEL='gpt-image-2.5-flare';
function fromSource(source:Row){
 const row:Row={};
 for(const name of cloneColumns)if(source[name]!==undefined)row[name]=source[name];
 return row;
}
function serializableSnapshot(source:Row,photos:Row[]){return immutableContentSnapshot(source,photos);}
function sourceSlides(row:Row):Row[]{
 const slides=Array.isArray(row.carousel_slides)?row.carousel_slides:[];
 if(!slides.length||slides.length>10)throw new Error('REGENERATION_REQUIRES_CAROUSEL');
 return slides;
}
function photosAsAssignments(photos:Row[],draftId:string){
 return photos.map(p=>({draft_id:draftId,asset_id:p.asset_id,slot:p.slot}));
}
async function rootLineage(db:DB,row:Row){
 const root=String(row.regeneration_root_id||row.id);
 const versions=ok(await db.from('instagram_post_drafts')
  .select('id,regeneration_version').eq('regeneration_root_id',root).order('regeneration_version',{ascending:false}).limit(1)) as Row[];
 return {root,version:Number(versions[0]?.regeneration_version||1)+1};
}
async function insertVersion(db:DB,source:Row,sourceSnapshot:Row,photos:Row[],options:{
 requestKey:string;mode:string;scope:string;indices:number[];instruction:string;visible:boolean
}){
 const {root,version}=await rootLineage(db,source);
 const now=new Date().toISOString(),row={
  ...fromSource(source),status:'needs_approval',draft_role:'candidate',generation_source:'manual',
  eligible_for_optimization:false,revision:1,generated_at:now,updated_at:now,
  imported_at:options.visible?now:null,scheduled_for:null,published_at:null,approved_at:null,approved_by:null,
  marketing_run_id:null,source_generation_job_id:null,quality_report:unapprovedQuality(),quality_revision:null,
  last_regeneration_mode:options.mode==='render'||options.mode==='restore'?null:options.mode,
  last_regeneration_instruction:options.instruction,regenerated_at:now,
  regeneration_root_id:root,regeneration_parent_id:source.id,regeneration_version:version,
  regeneration_source_revision:source.revision,regeneration_request_key:options.requestKey,
  regeneration_mode:options.mode,regeneration_scope:options.scope,
  regeneration_slide_indices:options.indices,regeneration_instruction:options.instruction,
  regeneration_before:sourceSnapshot,regeneration_saved_snapshot:null
 };
 const child=ok(await db.from('instagram_post_drafts').insert(row).select('*').single()) as Row;
 try{if(photos.length)ok(await db.from('marketing_draft_photos').insert(photosAsAssignments(photos,child.id)));}
 catch(error){await db.from('instagram_post_drafts').delete().eq('id',child.id).eq('status','needs_approval');throw error;}
 return child;
}
async function copyViaModel(source:Row,request:RegenerationRequest):Promise<{rewrite:Rewrite;usage:Row}>{
 const slides=sourceSlides(source),indices=targetedSlideIndices(request,slides.length);
 const key=process.env.OPENAI_API_KEY?.trim();
 if(!key)throw new Error('OPENAI_KEY_MISSING');
 const system=[
 'You edit a saved Roundy magazine editorial Instagram carousel; return a JSON object only.',
 'Change ONLY exactly the requested fields. Never invent dates, prices, statistics, venues, attributions, quotes, people, or sources.',
 'Keep the same topic, factual meaning, referenced sources, slide ordering and editorial roles.',
 'Keep concise answer-first information density: a short magazine heading and 1-3 compact body lines per slide.',
 'No fake buttons, advertising CTA, Dark overlays, or claims without evidence.',
 'Format {"slides":[{"index":0,"title":"...","body":"...","highlight":"..."}],"caption":"..."}',
 'For caption-only, slides must be []. For other scopes, include exactly the selected indices.',
 'For cover_title update title only; for body update body only and exclude slide 0.',
 'For all/slides provide title and body for each index. For scopes other than all/caption, omit caption.',
 'Keep all values UTF-8 plain strings; do not output markdown fences.'
 ].join(' ');
 const payload={
  language:source.content_language||'ko',mode:request.mode,scope:request.scope,
  selected_indices:indices,admin_instruction:request.instruction,
  current_caption:source.caption,current_slides:slides,
  preserved_sources:source.research_sources,topic:source.content_document?.editorial_type,
  verified_context:source.event_facts_snapshot||null,
  photo_credits_are_managed_by_server:true
 };
 let response:Response;
 try{response=await fetch('https://api.openai.com/v1/chat/completions',{
  method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify({model:COPY_MODEL,reasoning_effort:'none',max_completion_tokens:2600,
   response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(payload)}]}),
  cache:'no-store',redirect:'error',signal:AbortSignal.timeout(65000)
 });}catch{throw new Error('UPSTREAM_OUTCOME_UNKNOWN');}
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error('OPENAI_'+response.status+': '+String(body.error?.message||'request failed').slice(0,160));
 const raw=body.choices?.[0]?.message?.content;
 if(typeof raw!=='string')throw new Error('INVALID_MODEL_RESPONSE');
 let rewrite:Rewrite;
 try{rewrite=JSON.parse(raw);}catch{throw new Error('INVALID_MODEL_JSON');}
 return {rewrite,usage:body.usage||{}};
}
const providers=['pexels','wikimedia','openverse','unsplash','pixabay'] as const;
async function replacementAsset(db:DB,source:Row,slot:number,excluded:Set<string>,instruction:string){
 const baseTitle=String(source.carousel_slides?.[slot]?.title||'Seoul city lifestyle').slice(0,80);
 const query=(instruction||baseTitle+' candid editorial lifestyle photography Seoul').replace(/[\r\n]+/g,' ').slice(0,170);
 const topic=String(source.growth_topic_type||'conversation_prompt').slice(0,80);
 for(const provider of providers){
  if(!supportedPhotoSources.includes(provider)||!providerConfigured(provider))continue;
  let candidates:Row[]=[];
  try{candidates=(await searchLicensedPhotos(provider,query,topic)).photos as Row[];}
  catch{continue;}
  for(const candidate of candidates.slice(0,8)){
   if(!validLicensedPhoto(candidate))continue;
   const existing=ok(await db.from('marketing_photo_assets').select('*')
    .eq('provider',candidate.provider).eq('provider_photo_id',candidate.provider_photo_id).maybeSingle()) as Row|null;
   if(existing&&excluded.has(existing.id))continue;
   if(existing?.review_status==='rejected')continue;
   if(existing)return existing;
   // Discovery is not copyright approval. Every new source remains pending.
   ok(await db.from('marketing_photo_assets').upsert(
    {...candidate,review_status:'pending',reviewed_by:null,reviewed_at:null},
    {onConflict:'provider,provider_photo_id',ignoreDuplicates:true}));
   const saved=ok(await db.from('marketing_photo_assets').select('*')
    .eq('provider',candidate.provider).eq('provider_photo_id',candidate.provider_photo_id).single()) as Row;
   if(saved.review_status!=='rejected'&&!excluded.has(saved.id))return saved;
  }
 }
 throw new Error('NO_LICENSE_VERIFIABLE_REPLACEMENT: 승인 가능한 다른 실사 사진을 찾지 못해 기존 이미지를 변경하지 않았습니다.');
}
async function regenerateAiCover(db:DB,draft:Row,request:RegenerationRequest){
 const key=process.env.OPENAI_API_KEY?.trim();if(!key)throw new Error('OPENAI_KEY_MISSING');
 const cover=String(draft.carousel_slides?.[0]?.title||'Seoul lifestyle');
 let response:Response;
 try{response=await fetch('https://api.openai.com/v1/images/generations',{
  method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify({model:IMAGE_MODEL,n:1,size:'1024x1280',quality:'low',
   output_format:'jpeg',output_compression:85,background:'opaque',
   prompt:'Original text-free portrait 4:5 lifestyle editorial cover photography in Seoul. Natural anonymous subjects, negative space for typography. No letters, branded signage, logos, real-person likeness, or purported documentary evidence. Context: '+cover+'. '+request.instruction.slice(0,300)}),
  signal:AbortSignal.timeout(150000),redirect:'error',cache:'no-store'
 });}catch{throw new Error('UPSTREAM_OUTCOME_UNKNOWN');}
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error('OPENAI_IMAGE_'+response.status);
 const encoded=payload.data?.[0]?.b64_json;
 if(typeof encoded!=='string'||encoded.length>8*1024*1024)throw new Error('INVALID_AI_COVER');
 const bytes=Buffer.from(encoded,'base64');
 const meta=await sharp(bytes).metadata();
 if(!meta.width||!meta.height||bytes.length>6*1024*1024)throw new Error('INVALID_AI_COVER');
 const path=draft.id+'/versioned-cover-'+randomUUID()+'.jpg';
 ok(await db.storage.from('marketing-images').upload(path,bytes,{contentType:'image/jpeg',upsert:false}));
 return path;
}
async function renderVersionCards(db:DB,draft:Row,indices:number[]){
 const slides=sourceSlides(draft),photos=await listStockSelections(db,draft.id);
 if(!['pexels','stock'].includes(draft.visual_source))throw new Error('RENDER_SOURCE_UNAVAILABLE: 원본 실사 승인 자료가 없어 안전하게 재렌더링할 수 없습니다.');
 if(!stockReady(draft,photos))return {draft,ready:false};
 const assets=await loadEditorialAssets();
 Object.assign(assets,await approvedStockCardAssets(db,draft));
 assets.cardCredits=Object.fromEntries(photos.map(p=>[Number(p.slot),photoCardSourceLabel(p)]));
 const coverPath=String(draft.content_document?.regeneration_ai_cover_path||'');
 if(coverPath){
  const download=ok(await db.storage.from('marketing-images').download(coverPath));
  const source=Buffer.from(await download.arrayBuffer());
  if(source.length>6*1024*1024)throw new Error('AI_COVER_ARCHIVE_INVALID');
  const cover='data:image/jpeg;base64,'+source.toString('base64');
  assets.photo=cover;assets.cardPhotos={...(assets.cardPhotos||{}),0:cover};assets.reusePhotos=false;
 }
 const policy=draft.content_document?.photo_sourcing;
 if(indices.includes(0)&&policy?.ai_thumbnail_enabled===true&&!coverPath
  &&!photos.some(p=>p.slot===0))
  throw new Error('ORIGINAL_AI_COVER_SOURCE_UNAVAILABLE: 이미지 재생성 모드로 새 표지를 만들어야 합니다.');
 const images=Array.isArray(draft.images)?[...draft.images]:[];
 for(const index of indices){
  const doc={...draft.content_document,slides};
  const render=doc.design_preset===CAMPAIGN_PRESET?renderPrelaunchCampaign(slides[index],index,slides.length,doc,assets)
   :doc.design_preset===EVENT_CAMPAIGN_PRESET?renderLiveEventCampaign(slides[index],index,slides.length,doc,assets)
   :editorialCard(slides[index],index,slides.length,doc,assets);
  let buffer:ArrayBuffer;
  try{buffer=await Promise.race([render.arrayBuffer(),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('CARD_RENDER_TIMEOUT')),23000))]);}
  catch{throw new Error('CARD_RENDER_TIMEOUT');}
  const jpeg=await sharp(Buffer.from(buffer)).jpeg({quality:87}).toBuffer();
  if(jpeg.length>5*1024*1024)throw new Error('CARD_RENDER_TOO_LARGE');
  const file=draft.id+'/'+randomUUID()+'.jpg';
  ok(await db.storage.from('wis-event-images').upload(file,jpeg,{contentType:'image/jpeg',upsert:false}));
  images[index]=db.storage.from('wis-event-images').getPublicUrl(file).data.publicUrl;
 }
 const nextDocument={...draft.content_document,thumbnail_render_pending:false,slides};
 const saved=ok(await db.from('instagram_post_drafts').update({images,content_document:nextDocument,updated_at:new Date().toISOString()}).eq('id',draft.id).eq('status','needs_approval').select('*').single());
 return {draft:saved as Row,ready:true};
}
async function recheck(db:DB,draft:Row){
 const report=draft.content_document?.design_preset===CAMPAIGN_PRESET?campaignDraftQuality(draft):
  draft.content_document?.design_preset===EVENT_CAMPAIGN_PRESET?eventCampaignDraftQuality(draft):draftQuality(draft);
 try{
  const preflight=await reviewMarketingDraft(db,draft);
  const quality=mergePreflightQuality(report,preflight,false);
  return ok(await db.rpc('set_marketing_quality',{p_draft:draft.id,p_revision:draft.revision,p_report:quality})) as Row;
 }catch{
  return ok(await db.rpc('set_marketing_quality',{p_draft:draft.id,p_revision:draft.revision,
   p_report:{version:2,status:'rejected',issues:['Review saved copy, source image approvals and the seven publishing checks.']}})) as Row;
 }
}
export async function versionHistory(id:string){
 const db=createServiceRoleClient();
 const source=ok(await db.from('instagram_post_drafts').select('*').eq('id',id).single()) as Row;
 const root=String(source.regeneration_root_id||source.id);
 const [base,children]=await Promise.all([
  db.from('instagram_post_drafts').select('*').eq('id',root).single(),
  db.from('instagram_post_drafts').select('*').eq('regeneration_root_id',root).order('regeneration_version',{ascending:true}).limit(100)
 ]);
 const original=ok(base) as Row,records=ok(children) as Row[];
 return {root_id:root,versions:[original,...records].map(d=>({
  id:d.id,version:d.regeneration_version||1,parent_id:d.regeneration_parent_id||null,
  mode:d.regeneration_mode||'original',scope:d.regeneration_scope||null,
  slide_indices:d.regeneration_slide_indices||[],instruction:d.regeneration_instruction||'',
  created_at:d.generated_at,status:d.status,revision:d.revision,images:d.images,caption:d.caption,
  carousel_slides:d.carousel_slides,visual_source:d.visual_source,content_document:d.content_document,
  content_language:d.content_language,draft_kind:d.draft_kind,
  before:d.regeneration_before||null,snapshot:d.regeneration_saved_snapshot||null
 }))};
}
export async function regenerateVersion(id:string,value:unknown,actor:string){
 const db=createServiceRoleClient(),source=ok(await db.from('instagram_post_drafts').select('*').eq('id',id).single()) as Row;
 const slides=sourceSlides(source);
 const input=parseRegenerationRequest(value,slides.length);
 if(input.revision!==source.revision)throw new Error('DRAFT_CHANGED_REFRESH_FIRST');
 const previous=ok(await db.from('instagram_post_drafts').select('id,imported_at,status')
  .eq('regeneration_request_key',input.request_key).maybeSingle()) as Row|null;
 if(previous)return {draft:ok(await db.from('instagram_post_drafts').select('*').eq('id',previous.id).single()),deduplicated:true};
 const indices=targetedSlideIndices(input,slides.length),oldPhotos=await listStockSelections(db,id);
 const imageSource=(value as Row)?.image_source==='ai'?'ai':'online';
 if((value as Row)?.image_source!==undefined&&!['ai','online'].includes(String((value as Row).image_source)))throw new Error('INVALID_IMAGE_SOURCE');
 const photoSlots=requiredStockSlots(source);
 const aiCover=imageSource==='ai'&&indices.includes(0)&&['image','both'].includes(input.mode)
  &&source.content_document?.photo_sourcing?.ai_thumbnail_enabled===true
  &&!photoSlots.includes(0);
 if(imageSource==='ai'&&['image','both'].includes(input.mode)
  &&(!aiCover||indices.some(i=>i!==0)))
  throw new Error('AI_COVER_ONLY: 현재 실사 사진 최소 개수 정책에 따라 AI 생성은 AI 표지가 설정된 콘텐츠의 첫 번째 카드만 지원합니다.');
 if(['image','both'].includes(input.mode)){
  // The editorial closing is text-only. Whole-post image regeneration updates
  // every photograph but must preserve text-only cards, not reject the operation.
  const photoTargets=indices.filter(i=>photoSlots.includes(i)||(i===0&&aiCover));
  if(input.mode==='image'&&!photoTargets.length)
   throw new Error('SLIDE_HAS_NO_REPLACEABLE_IMAGE');
  if(input.mode==='image'&&input.scope==='slides'&&photoTargets.length!==indices.length)
   throw new Error('SELECTED_SLIDE_HAS_NO_REPLACEABLE_IMAGE');
  if(!['stock','pexels'].includes(source.visual_source))throw new Error('LICENSED_PHOTO_SOURCE_REQUIRED');
  if(input.scope==='slides'&&indices.some(i=>!photoSlots.includes(i)&&!(i===0&&aiCover)))
   throw new Error('SLIDE_HAS_NO_REPLACEABLE_IMAGE');
 }
 if((input.mode==='text'||input.mode==='render')&&indices.includes(0)
  &&source.content_document?.photo_sourcing?.ai_thumbnail_enabled===true
  &&!source.content_document?.regeneration_ai_cover_path&&!photoSlots.includes(0))
  throw new Error('ORIGINAL_AI_COVER_SOURCE_UNAVAILABLE: 새 AI 표지가 필요한 경우 텍스트 + 이미지 재생성을 사용하세요.');
 const snapshot=serializableSnapshot(source,oldPhotos);
 const draft=await insertVersion(db,source,snapshot,oldPhotos,{requestKey:input.request_key,
  mode:input.mode,scope:input.scope,indices,instruction:input.instruction,visible:false});
 const needsCopy=input.mode==='text'||input.mode==='both';
 const op=aiCover?(needsCopy?'copy_photo':'photo'):(needsCopy?'copy':'render');
 const estimated=estimatedUsd(input.mode,input.scope,aiCover);
 const hash=createHash('sha256').update(JSON.stringify({id,revision:input.revision,mode:input.mode,scope:input.scope,
  indices,instruction:input.instruction,child:draft.id})).digest('hex');
 let job:Row|null=null,changed=draft;
 try{
  const reservation=ok(await db.rpc('reserve_marketing_generation',{p_key:input.request_key,p_fingerprint:hash,
   p_draft:draft.id,p_revision:1,p_operation:op,p_actor:actor,p_automatic:false})) as Row;
  job=reservation.job as Row;
  if(!reservation.accepted)return {draft,job,deduplicated:true};
  let nextSlides=slides.map(s=>({...s})),caption=String(source.caption||'');
  if(needsCopy){
   const {rewrite,usage}=await copyViaModel(source,input);
   const result=applySelectiveRewrite(slides,caption,input,rewrite,source.content_language==='en'?'en':'ko');
   nextSlides=result.slides;caption=result.caption;
   await db.from('marketing_generation_jobs').update({input_tokens:usage.prompt_tokens||0,
    output_tokens:usage.completion_tokens||0,stage:'copy_written'}).eq('id',job.id);
  }
  const changingPhotoSlots=imageSource==='ai'?[]:indices.filter(index=>photoSlots.includes(index)&&['image','both'].includes(input.mode));
  const claimed=new Set(oldPhotos.map(p=>String(p.asset_id)));
  for(const slot of changingPhotoSlots){
   const next=await replacementAsset(db,source,slot,claimed,input.instruction);
   claimed.add(next.id);
   ok(await db.from('marketing_draft_photos').update({asset_id:next.id})
    .eq('draft_id',draft.id).eq('slot',slot));
  }
  let document:Row={...source.content_document,slides:nextSlides,thumbnail_render_pending:true};
  if(aiCover){const path=await regenerateAiCover(db,{...draft,carousel_slides:nextSlides},input);document={...document,regeneration_ai_cover_path:path};}
  // Restore mandatory source credits after caption rewrites. Image-only requests may
  // update the credits solely to reflect changed photographer/license metadata.
  const selectedPhotos=await listStockSelections(db,draft.id);
  if(selectedPhotos.length&&(changingPhotoSlots.length||(needsCopy&&['all','caption'].includes(input.scope))))
   caption=photoCreditCaption(caption,selectedPhotos);
  const renderIndices=indices.filter(i=>input.mode!=='image'||photoSlots.includes(i)||i===0&&aiCover);
  const previousPending=source.content_document?.thumbnail_render_pending===true;
  const missingBefore=Array.isArray(source.images)?source.images.map((url:unknown,i:number)=>!url?i:-1).filter((i:number)=>i>=0):[];
  const allPending=[...new Set([...renderIndices,...missingBefore])];
  const images=[...(source.images||[])];
  if(needsCopy||input.mode==='image'||input.mode==='render')
   for(const i of renderIndices)images[i]='';
  changed=ok(await db.from('instagram_post_drafts').update({
   caption,carousel_slides:nextSlides,content_document:document,images,
   revision:2,updated_at:new Date().toISOString(),quality_revision:null,
   quality_report:unapprovedQuality(),regenerated_at:new Date().toISOString()
  }).eq('id',draft.id).eq('status','needs_approval').select('*').single()) as Row;
  if(renderIndices.length){
   const rendered=await renderVersionCards(db,changed,renderIndices);
   changed=rendered.draft;
  }else if(input.scope==='caption'){
   changed=ok(await db.from('instagram_post_drafts').update({
    content_document:{...document,thumbnail_render_pending:false}
   }).eq('id',draft.id).select('*').single()) as Row;
  }
  changed=await recheck(db,changed);
  const finalPhotos=await listStockSelections(db,draft.id),now=new Date().toISOString();
  changed=ok(await db.from('instagram_post_drafts').update({
   imported_at:now,regeneration_saved_snapshot:serializableSnapshot(changed,finalPhotos)
  }).eq('id',draft.id).eq('status','needs_approval').select('*').single()) as Row;
  ok(await db.from('marketing_generation_jobs').update({status:'completed',stage:changed.images.every(Boolean)?'complete':'photo_review_required',
   result_revision:changed.revision,result_snapshot:{...serializableSnapshot(changed,finalPhotos),
    draft_id:draft.id,estimated_usd:estimated,scope:input.scope,changed_indices:indices},
   quality_report:changed.quality_report,updated_at:now}).eq('id',job.id));
  return {draft:changed,job:{...job,status:'completed'},new_version:true,requires_photo_review:!changed.images.every(Boolean),estimated_usd:estimated};
 }catch(error){
  const message=error instanceof Error?error.message:'REGENERATION_FAILED';
  if(job)await db.from('marketing_generation_jobs').update({
   status:message==='UPSTREAM_OUTCOME_UNKNOWN'?'uncertain':'failed',stage:'stopped',
   error_code:message==='UPSTREAM_OUTCOME_UNKNOWN'?'UPSTREAM_OUTCOME_UNKNOWN':'REGENERATION_FAILED',
   error_message:message.slice(0,400),updated_at:new Date().toISOString()
  }).eq('id',job.id).eq('status','running');
  else await db.from('instagram_post_drafts').delete().eq('id',draft.id).eq('status','needs_approval');
  throw error;
 }
}
export async function restoreVersion(id:string,targetId:string,revision:number,actor:string,confirmed:boolean){
 if(!uuid(id)||!uuid(targetId)||confirmed!==true)throw new Error('RESTORE_CONFIRMATION_REQUIRED');
 const db=createServiceRoleClient();
 const source=ok(await db.from('instagram_post_drafts').select('*').eq('id',id).single()) as Row;
 const target=ok(await db.from('instagram_post_drafts').select('*').eq('id',targetId).single()) as Row;
 if(source.revision!==revision)throw new Error('DRAFT_CHANGED_REFRESH_FIRST');
 if(String(source.regeneration_root_id||source.id)!==String(target.regeneration_root_id||target.id))
  throw new Error('VERSION_LINEAGE_MISMATCH');
 const prev=await listStockSelections(db,id),snapshot=serializableSnapshot(source,prev);
 const saved=(target.regeneration_saved_snapshot||target) as Row;
 const fields=fromSource(saved);
 // Older root snapshots can be restored from the draft row itself.
 if(!Array.isArray(fields.carousel_slides)||!Array.isArray(fields.images))throw new Error('VERSION_SNAPSHOT_MISSING');
 const photoSelections=Array.isArray(saved.stock_photo_selections)?saved.stock_photo_selections:await listStockSelections(db,targetId);
 const child=await insertVersion(db,{...source,...fields},snapshot,photoSelections as Row[],{
  requestKey:'restore:'+randomUUID(),mode:'restore',scope:'all',
  indices:[],instruction:'Restored from version '+String(target.regeneration_version||1),visible:true
 });
 const restored=ok(await db.from('instagram_post_drafts').update({
  regeneration_saved_snapshot:serializableSnapshot(child,photoSelections as Row[])
 }).eq('id',child.id).select('*').single()) as Row;
 return {draft:restored,restored_from:target.id,actor};
}


/**
 * Renders precisely the edited cards once newly sourced stock assets pass the
 * existing human review. No AI image calls, no re-render of untouched cards,
 * and never modifies a reserved or published draft.
 */
export async function finishVersionRendering(id:string,revision:number){
 if(!uuid(id)||!Number.isInteger(revision))throw new Error('INVALID_RENDER_REQUEST');
 const db=createServiceRoleClient();
 const draft=ok(await db.from('instagram_post_drafts').select('*').eq('id',id).single()) as Row;
 if(draft.status!=='needs_approval'||!draft.regeneration_parent_id)
  throw new Error('VERSION_DRAFT_NOT_EDITABLE');
 if(draft.revision!==revision)throw new Error('DRAFT_CHANGED_REFRESH_FIRST');
 const target=Array.isArray(draft.regeneration_slide_indices)?draft.regeneration_slide_indices:[];
 if(!target.length)throw new Error('VERSION_HAS_NO_TARGET_SLIDES');
 const renderIndices=target.filter((i:number)=>typeof draft.images?.[i]!=='string'||!draft.images[i].trim());
 if(!renderIndices.length)throw new Error('VERSION_ALREADY_RENDERED');
 const photos=await listStockSelections(db,id);
 if(!stockReady(draft,photos))throw new Error('STOCK_PHOTOS_NOT_APPROVED');
 const result=await renderVersionCards(db,draft,renderIndices);
 if(!result.ready)throw new Error('STOCK_PHOTOS_NOT_APPROVED');
 const checked=await recheck(db,result.draft);
 const snapshot=serializableSnapshot(checked,await listStockSelections(db,id));
 const saved=ok(await db.from('instagram_post_drafts').update({
  regeneration_saved_snapshot:snapshot,updated_at:new Date().toISOString()
 }).eq('id',id).eq('status','needs_approval').select('*').single()) as Row;
 return {draft:saved,rendered_slide_indices:renderIndices};
}
