import {prepareSavedCtaRecovery,SAVED_CTA_RECOVERY_VERSION} from './marketing-output-recovery';
import {loadEditorialAssets} from './marketing-render-assets';
import {photoCreditCaption} from './marketing-stock-photo-policy';
import {approvedStockCardAssets,listStockSelections,pexelsConfigured,photoSelectionSnapshot,prepareStockSelections,stockReady} from './marketing-stock-photos';
import {CONTENT_POLICY_VERSION} from './marketing-content-policy';
import {selectTrendForAutomaticContent,markTrendUsed} from './marketing-trend-radar';
import {growthLearningWeights} from './marketing-growth';
import {planGrowthSlot,type GrowthSlot} from './marketing-growth-planner';
import 'server-only';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import {generateEditorialCopy,draftQuality,editorialCard,editorialPhotoCover} from './marketing-editorial';
import {generateCampaignCopy,campaignDraftQuality,CAMPAIGN_VERSION,CAMPAIGN_PATTERNS,CAMPAIGN_TONES} from './marketing-campaign';
import {generateEventCampaignCopy,eventCampaignDraftQuality,EVENT_CAMPAIGN_VERSION,EVENT_CAMPAIGN_STAGES,EVENT_CAMPAIGN_PATTERNS,selectAutomaticEventCampaign,createAutomaticEventDraft,recordAutomaticEventCampaign,loadEventCampaignFacts} from './marketing-event-campaign';
import {CAMPAIGN_PRESET,EVENT_CAMPAIGN_PRESET} from './marketing-presentation';
import {renderPrelaunchCampaign,renderLiveEventCampaign} from './marketing-visuals';
// EDITORIAL_V2_INTEGRATED
import { createServiceRoleClient } from './supabase/service';
type Row=Record<string,any>;
type DB=ReturnType<typeof createServiceRoleClient>;
type ContentLanguage='ko'|'en';
type VisualSource='auto_ai'|'uploaded'|'none'|'pexels';
export type GenerationInput={request_key:string;revision:number;mode:'text'|'image'|'both';content_mode:'prelaunch'|'live_event'|'growth_carousel';visual_mode:'cards'|'photo';visual_source?:VisualSource;topic_type?:string;instruction?:string;language?:ContentLanguage;confirm_photo?:boolean;render_only?:boolean;campaign_pattern?:'auto'|'poster'|'problem_solution'|'how_it_works'|'benefit_stack'|'countdown';campaign_tone?:'modern_premium'|'soft_romantic'|'bold_teaser';launch_date?:string;event_id?:string;event_campaign_stage?:'auto'|'launch'|'experience'|'venue'|'participants'|'momentum'|'imminent'|'last_call';event_campaign_pattern?:'auto'|'event_poster'|'experience'|'social_proof'|'offer'|'last_call'};
const topics=['mbti','dating_archetype','book_insight','trend_research','meme_remix','dating_myth','conversation_prompt','seoul_dating','korea_life','mini_quiz'];
const allowedTopics=[...topics,'seoul_trend'];
const researchTopics=new Set(['book_insight','trend_research','dating_myth','seoul_dating','seoul_trend']);
const COPY_MODEL='gpt-6-luna',IMAGE_MODEL='gpt-image-2.5-flare',MAX_INPUT_BYTES=16000;
export const kstDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const checked=<T extends {error:unknown}>(r:T):T=>{if(r.error)throw r.error;return r;};
const safeError=(error:unknown)=>(error instanceof Error?error.message:String((error as Row)?.message||'Generation failed')).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').slice(0,500);
export class GenerationError extends Error{constructor(public code:string,message:string,public block=false){super(message);}}
export function validateGenerationInput(value:unknown):GenerationInput{
 const v=value as GenerationInput;
 if(!v||typeof v!=='object'||typeof v.request_key!=='string'||!/^[a-zA-Z0-9:_-]{8,120}$/.test(v.request_key)||!Number.isInteger(v.revision)||v.revision<1||v.revision>98)throw new Error('INVALID_GENERATION_REQUEST');
 if(!['text','image','both'].includes(v.mode)||!['prelaunch','live_event','growth_carousel'].includes(v.content_mode)||!['cards','photo'].includes(v.visual_mode))throw new Error('INVALID_GENERATION_OPTIONS');
 if(v.instruction!==undefined&&(typeof v.instruction!=='string'||v.instruction.trim().length>500))throw new Error('INSTRUCTION_LIMIT_500');
 const topicType=v.content_mode==='growth_carousel'?v.topic_type:undefined;
 if(topicType!=null&&!allowedTopics.includes(topicType))throw new Error('INVALID_GROWTH_TOPIC');
 if(v.language!==undefined&&!['ko','en'].includes(v.language))throw new Error('INVALID_CONTENT_LANGUAGE');
 if(v.visual_source!==undefined&&!['auto_ai','uploaded','none','pexels'].includes(v.visual_source))throw new Error('INVALID_VISUAL_SOURCE');
 if(v.campaign_pattern!==undefined&&!['auto',...CAMPAIGN_PATTERNS].includes(v.campaign_pattern as any))throw new Error('INVALID_CAMPAIGN_PATTERN');
 if(v.campaign_tone!==undefined&&!(CAMPAIGN_TONES as readonly string[]).includes(v.campaign_tone))throw new Error('INVALID_CAMPAIGN_TONE');
 if(v.launch_date!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(v.launch_date)||!Number.isFinite(Date.parse(v.launch_date+'T00:00:00+09:00'))))throw new Error('INVALID_LAUNCH_DATE');
 if(v.content_mode!=='prelaunch'&&(v.campaign_pattern!==undefined||v.campaign_tone!==undefined||v.launch_date!==undefined))throw new Error('CAMPAIGN_OPTIONS_PRELAUNCH_ONLY');
 if(v.content_mode==='prelaunch'&&v.campaign_pattern==='countdown'&&!v.launch_date)throw new Error('COUNTDOWN_REQUIRES_LAUNCH_DATE');
 if(v.event_id!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.event_id))throw new Error('INVALID_EVENT_ID');
 if(v.event_campaign_stage!==undefined&&!['auto',...EVENT_CAMPAIGN_STAGES].includes(v.event_campaign_stage as any))throw new Error('INVALID_EVENT_CAMPAIGN_STAGE');
 if(v.event_campaign_pattern!==undefined&&!['auto',...EVENT_CAMPAIGN_PATTERNS].includes(v.event_campaign_pattern as any))throw new Error('INVALID_EVENT_CAMPAIGN_PATTERN');
 if(v.content_mode!=='live_event'&&(v.event_id!==undefined||v.event_campaign_stage!==undefined||v.event_campaign_pattern!==undefined))throw new Error('EVENT_OPTIONS_LIVE_EVENT_ONLY');
 if(v.visual_mode==='photo'&&(v.content_mode==='growth_carousel'||v.mode==='text'||v.render_only))throw new Error('PHOTO_OPTION_NOT_APPLICABLE');
 if(v.visual_mode==='photo'&&v.confirm_photo!==true)throw new Error('CONFIRM_PAID_PHOTO_FIRST');
 if(v.render_only&&v.mode!=='image')throw new Error('INVALID_RENDER_OPTIONS');
 if(v.visual_source==='pexels'&&v.mode==='text')throw new Error('PEXELS_VISUALS_REQUIRE_IMAGE_MODE');
 // Never silently degrade into AI-only photography if Pexels is unavailable.
 const visualSource:VisualSource=automatic?'pexels':input.visual_source==='auto_ai'?'pexels':input.visual_source!;
 if(automatic&&input.visual_source&&!['auto_ai','pexels'].includes(input.visual_source))throw new Error('AUTOMATION_VISUAL_SOURCE_INVALID');
 let draft=await readDraft(db,draftId);
 let recoveryPatch:Row|null=null,recoverySource:Row|null=null;
 if(thread?.recoverySourceJobId){
  if(automatic||input.visual_mode!=='cards')throw new Error('SAVED_RESULT_RECOVERY_UNAVAILABLE');
  recoverySource=checked(await db.from('marketing_generation_jobs').select('*').eq('id',thread.recoverySourceJobId).single()).data as Row;
  if(!recoverySource||recoverySource.draft_id!==draftId||(recoverySource.generation_thread_id||recoverySource.id)!==thread.threadId)throw new Error('SAVED_RESULT_RECOVERY_MISMATCH');
  const original=recoverySource.request_payload;
  if(!original||original.content_mode!==input.content_mode||(original.topic_type||null)!==(input.topic_type||null)||original.language!==input.language||(original.instruction||'')!==(input.instruction||'')||(original.campaign_pattern||'auto')!==(input.campaign_pattern||'auto')||(original.campaign_tone||'modern_premium')!==(input.campaign_tone||'modern_premium')||(original.launch_date||null)!==(input.launch_date||null))throw new Error('SAVED_RESULT_RECOVERY_MISMATCH');
  recoveryPatch=prepareSavedCtaRecovery(recoverySource);
 }
 // Verify the schema before reserving or calling any provider.
 checked(await db.from('instagram_post_drafts').select('content_document,quality_report,quality_revision').eq('id',draftId).single());
 if(input.mode==='image'&&!recoveryPatch){const q=qualityForDraft(draft);if(q.status!=='passed')throw new Error('품질 검토 필요: '+q.issues.join(' '));}
 input.language=input.mode==='image'?(draft.content_language==='en'?'en':draft.content_language==='ko'?'ko':await nextContentLanguage(db,draft.id)):await resolveContentLanguage(db,draft,input.language);
 const growth=input.content_mode==='growth_carousel',research=growth&&researchTopics.has(input.topic_type||'')&&!input.render_only&&input.mode!=='image';
 const eventFacts=input.content_mode==='live_event'?await loadEventCampaignFacts(db,String(input.event_id||draft.event_id||'')):null;
 const wantsVisuals=Boolean(recoveryPatch||input.render_only||input.mode==='image'||input.mode==='both'||automatic);
 const stockVisuals=wantsVisuals&&visualSource==='pexels';
 if(stockVisuals&&!pexelsConfigured())throw new GenerationError('PEXELS_API_KEY_MISSING','Licensed Pexels photos are required. AI-only fallback is disabled.');
 const uploadedVisuals=(input.render_only||input.mode==='image')&&visualSource==='uploaded';
 const policy=checked(await db.from('marketing_automation_settings').select('ai_cover_enabled').eq('singleton',true).single()).data as Row;
 const generateCover=stockVisuals&&Boolean(policy.ai_cover_enabled)&&(input.mode==='image'||input.render_only);
 const operation=stockVisuals?(generateCover?'photo':input.mode==='image'||input.render_only?'render':research?'research':'copy')
    :uploadedVisuals?'render':research?'research':'copy';
 const fingerprint=createHash('sha256').update(JSON.stringify({id:draftId,revision:input.revision,mode:input.mode,content:input.content_mode,language:input.language,visual:input.visual_mode,visual_source:visualSource,topic:input.topic_type||'',instruction:input.instruction,campaign_pattern:input.campaign_pattern||null,campaign_tone:input.campaign_tone||null,launch_date:input.launch_date||null,event_id:input.event_id||draft.event_id||null,event_campaign_stage:input.event_campaign_stage||null,event_campaign_pattern:input.event_campaign_pattern||null,render:!!input.render_only,saved_recovery_of:thread?.recoverySourceJobId||null})).digest('hex');
 const reservation=checked(await db.rpc('reserve_marketing_generation',{p_key:input.request_key,p_fingerprint:fingerprint,p_draft:draftId,p_revision:input.revision,p_operation:operation,p_actor:actor,p_automatic:automatic})).data as Row,job=reservation.job as Row;
 if(!reservation.accepted)return {draft,job,deduplicated:true};
 let contentQuality:Row|null=null;
 try{
  const requestPayload={mode:input.mode,content_mode:input.content_mode,language:input.language,visual_mode:input.visual_mode,visual_source:visualSource,topic_type:input.topic_type||null,trend_id:draft.trend_id||null,instruction:input.instruction||'',campaign_pattern:input.campaign_pattern||null,campaign_tone:input.campaign_tone||null,launch_date:input.launch_date||null,event_id:input.event_id||draft.event_id||null,event_campaign_stage:input.event_campaign_stage||null,event_campaign_pattern:input.event_campaign_pattern||null,confirm_photo:input.confirm_photo===true,render_only:input.render_only===true,...(recoverySource?{saved_recovery_of:recoverySource.id}: {})};
  const threadId=thread?.threadId||job.id,attemptNumber=thread?.attemptNumber||1,workflowId=await resolveContentWorkflowId(db,draft,job,thread);
  checked(await db.from('marketing_generation_jobs').update({
   request_payload:requestPayload,
   generation_thread_id:threadId,
   content_workflow_id:workflowId,
   attempt_number:attemptNumber,
   retry_of_job_id:thread?.retryOfJobId||null,
   updated_at:new Date().toISOString()
  }).eq('id',job.id));
  if(recoveryPatch){
   contentQuality=recoveryPatch.quality_report;await progress(db,job,'restoring_saved_copy');
   // Preserve failed source snapshots. Recovery reuses copy but generates a fresh paid visual set in the SAME thread.
   checked(await db.from('marketing_generation_jobs').update({quality_report:contentQuality,result_snapshot:{...recoveryPatch,draft_id:draftId,recovery:{version:SAVED_CTA_RECOVERY_VERSION,source_job_id:recoverySource!.id,additional_paid_calls:1}}}).eq('id',job.id).eq('status','running'));
   draft=await savePartial(db,draft,{...recoveryPatch,last_regeneration_mode:input.mode,last_regeneration_instruction:input.instruction});
  }else if(operation!=='photo'&&operation!=='render'){
   const copy=await generateCopy(db,draft,input,job,research);contentQuality=copy.quality_report;await progress(db,job,'saving_copy');
   draft=await savePartial(db,draft,{...copy,generation_source:automatic?'automation':'manual',visual_source:visualSource,last_regeneration_mode:input.mode,last_regeneration_instruction:input.instruction,images:[]});
  }
  let stockPhotos:ReturnType<typeof photoSelectionSnapshot>=[],photoReviewRequired=false;
  if(uploadedVisuals){
   const images=await renderUploadedCards(db,draft,job);await progress(db,job,'saving_images');
   draft=await savePartial(db,draft,{images,generation_source:'manual',visual_source:'uploaded',last_regeneration_mode:input.mode,last_regeneration_instruction:input.instruction});
  }else if(stockVisuals){
   await progress(db,job,'selecting_licensed_photos');
   const selected=(input.mode==='image'||input.render_only)
     ?await listStockSelections(db,draft.id)
     :await prepareStockSelections(db,draft);
   stockPhotos=photoSelectionSnapshot(selected);
   if(!selected.length)photoReviewRequired=true;
   if(stockReady(draft,selected)){
    await progress(db,job,'rendering_approved_photos');
    const assets=await loadEditorialAssets();
    Object.assign(assets,await approvedStockCardAssets(db,draft));
    if(generateCover){const cover=await generateVisualSet(db,draft,input,job,1);assets.cardPhotos={...assets.cardPhotos,0:cover[0]};}
    const images=await renderCardsWithAssets(db,draft,job,assets);
    await progress(db,job,'saving_images');
    // Keep photographer attribution visible in the final draft.
    const captionWithCredit=photoCreditCaption(String(draft.caption||''),selected.map((photo:Row)=>String(photo.photographer||'')));
    draft=await savePartial(db,draft,{images,caption:captionWithCredit,generation_source:automatic?'automation':'manual',visual_source:'pexels',last_regeneration_mode:input.mode,last_regeneration_instruction:input.instruction});
   }else if(input.mode==='image'||input.render_only){
    throw new GenerationError('STOCK_PHOTOS_NOT_APPROVED','Approve all selected photos before rendering.');
   }else{
    // Incomplete photo review leaves the copy available but never publishable.
    photoReviewRequired=true;
   }
  }
  const quality=contentQuality||qualityForDraft(draft);
  if(quality.status!=='passed')throw new Error('품질 검토 필요: '+quality.issues.join(' '));
  draft=checked(await db.rpc('set_marketing_quality',{p_draft:draft.id,p_revision:draft.revision,p_report:quality})).data as Row;
  const resultSnapshot={
   ...(recoverySource?{recovery:{version:SAVED_CTA_RECOVERY_VERSION,source_job_id:recoverySource.id,original_cta:recoverySource.result_snapshot.content_document.cta,additional_paid_calls:1}}:{}),
   content_document:draft.content_document,quality_report:quality,quality_revision:draft.revision,
   draft_id:draft.id,draft_date:draft.draft_date,caption:draft.caption,cta:draft.cta,destination_url:draft.destination_url,
   images:draft.images||[],carousel_slides:draft.carousel_slides||[],research_sources:draft.research_sources||[],
   research_status:draft.research_status,content_language:draft.content_language,draft_kind:draft.draft_kind,
   growth_topic_type:draft.growth_topic_type,content_mode:draft.content_mode,content_pillar:draft.content_pillar,
   generation_reason:draft.generation_reason,event_id:draft.event_id||null,generation_source:automatic?'automation':'manual',visual_source:visualSource,revision:draft.revision,saved_at:new Date().toISOString(),
   render_style:draft.render_style||null,campaign_pattern:draft.campaign_pattern||draft.content_document?.campaign_pattern||null,campaign_tone:draft.campaign_tone||draft.content_document?.campaign_tone||null,campaign_version:draft.campaign_version||draft.content_document?.campaign_version||null,launch_date:draft.launch_date||draft.content_document?.launch_date||null,
   event_campaign_stage:draft.event_campaign_stage||draft.content_document?.event_campaign_stage||null,event_campaign_pattern:draft.event_campaign_pattern||draft.content_document?.event_campaign_pattern||null,event_campaign_version:draft.event_campaign_version||draft.content_document?.campaign_version||null,event_facts_snapshot:draft.event_facts_snapshot||draft.content_document?.event_facts||null,
   generation_recovery:(quality as Row).recovery||draft.content_document?.generation_recovery||null,
   stock_photo_selections:stockPhotos,photos_pending_review:photoReviewRequired
  };
  checked(await db.from('marketing_generation_jobs').update({status:'completed',stage:photoReviewRequired?'photo_review_required':'complete',quality_report:quality,result_snapshot:resultSnapshot,result_revision:draft.revision,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','running'));
  return {draft,job:{...job,status:'completed',stage:photoReviewRequired?'photo_review_required':'complete',result_snapshot:resultSnapshot,result_revision:draft.revision},deduplicated:false};
 }catch(error){
  const message=safeError(error),code=error instanceof GenerationError?error.code:'GENERATION_FAILED',unknown=code==='UPSTREAM_OUTCOME_UNKNOWN';
  await db.from('marketing_generation_jobs').update({status:unknown?'uncertain':'failed',stage:'stopped',error_code:code,error_message:message,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','running');
  if(error instanceof GenerationError&&error.block)await db.from('marketing_ai_control').update({blocked_reason:message,updated_at:new Date().toISOString()}).eq('singleton',true);
  // Only upstream/configuration errors and unknown network outcomes trip the circuit breaker.
  // Deterministic app validation failures remain manual-retryable and never pause all AI work.
  return {draft:await readDraft(db,draftId),job:{...job,status:unknown?'uncertain':'failed',error_code:code,error_message:message},error:message};
 }
}
export async function generationOverview(){
 const db=createServiceRoleClient(),date=kstDate(),month=date.slice(0,7)+'-01';
 const [control,jobs,usage,dispatch]=await Promise.all([readControl(db),db.from('marketing_generation_jobs').select('*').order('created_at',{ascending:false}).limit(100),db.from('marketing_generation_jobs').select('reserved_usd,created_at,operation,status').gte('created_at',month+'T00:00:00+09:00'),db.from('marketing_generation_dispatches').select('dispatch_date,requested_at').eq('dispatch_date',date).maybeSingle()]);
 checked(jobs);checked(usage);checked(dispatch);const rows=usage.data||[],dayStart=Date.parse(date+'T00:00:00+09:00'),todayRows=rows.filter(r=>Date.parse(r.created_at)>=dayStart);
 const temporaryActive=Boolean(control.temporary_daily_budget_usd&&control.temporary_daily_budget_expires_at&&Date.parse(control.temporary_daily_budget_expires_at)>Date.now());
 const dailyBudget=temporaryActive?Number(control.temporary_daily_budget_usd):Number(control.daily_budget_usd);
 return {control,jobs:jobs.data,dispatch:dispatch.data,usage:{daily_reserved_usd:todayRows.reduce((sum,r)=>sum+Number(r.reserved_usd),0),daily_budget_usd:dailyBudget,daily_budget_override_expires_at:temporaryActive?control.temporary_daily_budget_expires_at:null,monthly_reserved_usd:rows.reduce((sum,r)=>sum+Number(r.reserved_usd),0),monthly_budget_usd:Number(control.monthly_budget_usd),daily_attempts:todayRows.filter(r=>Number(r.reserved_usd)>0).length,daily_calls:todayRows.filter(r=>Number(r.reserved_usd)>0&&['running','completed','uncertain'].includes(r.status)).length,daily_call_limit:5,monthly_call_limit:90,photo_daily_limit:5,photo_monthly_limit:90},provider:{configured:!!process.env.OPENAI_API_KEY?.trim(),pexels_configured:pexelsConfigured(),stock_photos_per_carousel:'2-3',stock_review_required:true,stock_cooldown_days:90,copy_model:COPY_MODEL,image_model:IMAGE_MODEL,automatic_photos:true,manual_uploaded_images:true,fresh_visuals_per_generation:3,static_photo_reuse:false,external_retries:0,copy_repair_limit:1,research_search_limit:3,verified_book_catalog:true,research_fallback:true,content_policy_version:CONTENT_POLICY_VERSION,prelaunch_campaign_version:CAMPAIGN_VERSION,prelaunch_campaign_patterns:CAMPAIGN_PATTERNS,research_reservation_usd:0.05}};
}
export async function todayDraft(selectedTrend:Row|null=null,growthSlot:GrowthSlot|null=null){
 const db=createServiceRoleClient(),today=kstDate();
 const existing=checked(await db.from('instagram_post_drafts').select('*').eq('draft_date',today).eq('draft_role','workspace').eq('status','needs_approval').maybeSingle()).data as Row|null;
 const settings=checked(await db.from('marketing_automation_settings').select('*').eq('singleton',true).single()).data as Row,dow=new Date(today+'T12:00:00+09:00').getUTCDay();
 const rec=checked(await db.from('instagram_posting_time_recommendations').select('*').eq('dow',dow).maybeSingle()).data as Row|null;
 const plan=Boolean(settings.growth_mode_enabled)?(growthSlot||planGrowthSlot(today,await growthLearningWeights(db))):null;
 const trendForPost=plan&&plan.pillar!=='seoul'?null:selectedTrend;
 const isGrowth=plan?plan.pillar!=='brand':Boolean(selectedTrend||settings.growth_carousel_enabled&&settings.growth_days.includes(dow));
 const rotated=topics[Math.floor(Date.parse(today+'T00:00:00Z')/86400000)%topics.length];
 const topic=plan?(plan.pillar==='seoul'&&!trendForPost?'korea_life':plan.topic_type||'conversation_prompt'):(selectedTrend?'seoul_trend':rotated);
 const language=plan?plan.language:await nextContentLanguage(db,existing?.id);
 const reason=plan
  ?'Growth engine: '+plan.pillar+' / '+plan.recommended_format+' / '+plan.editorial_goal+(plan.pillar==='seoul'&&!trendForPost?' Verified Seoul trend unavailable; use evergreen Korea-life post.':'')
  :selectedTrend?'Trend Radar override: '+String(selectedTrend.display_name)+' · score '+Number(selectedTrend.adjusted_trend_score||selectedTrend.trend_score).toFixed(1)+' · '+String(selectedTrend.status):'Hidden generation workspace. Results are imported into independent drafts.';
 const base={draft_date:today,draft_role:'workspace',status:'needs_approval',generation_source:'automation',visual_source:'auto_ai',content_language:language,content_mode:plan?'prelaunch':settings.content_mode,draft_kind:isGrowth?'growth_carousel':'brand',growth_topic_type:isGrowth?topic:null,trend_id:trendForPost?.id||null,content_pillar:plan?.pillar==='seoul'||trendForPost?'seoul':'concept',caption:'',cta:'Follow @roundy.meet',destination_url:'https://roundy.team',images:[],carousel_slides:[],research_sources:[],research_status:isGrowth?'pending':'not_required',generation_reason:reason,render_style:isGrowth?'editorial':settings.content_mode==='prelaunch'?'campaign':null,campaign_pattern:null,campaign_tone:settings.content_mode==='prelaunch'?'modern_premium':null,campaign_version:settings.content_mode==='prelaunch'?CAMPAIGN_VERSION:null,launch_date:null,recommended_time_kst:rec?.recommended_time_kst||'21:00',window_start_kst:rec?.window_start_kst||'20:30',window_end_kst:rec?.window_end_kst||'21:30',scheduled_for:today+'T'+String(rec?.recommended_time_kst||'21:00').slice(0,5)+':00+09:00'};
 if(existing){
  // Defensive reset: an automation workspace must reflect today's selected route only.
  // This prevents any stale/manual trend_id or copy from being reused by the daily job.
  const refreshed=checked(await db.from('instagram_post_drafts').update({
   ...base,
   content_document:null,
   quality_report:{version:CONTENT_POLICY_VERSION,status:'unchecked',issues:[],review_required:true},
   quality_revision:null,
   revision:Number(existing.revision||1)+1,
   regenerated_at:null,
   updated_at:new Date().toISOString()
  }).eq('id',existing.id).eq('status','needs_approval').select('*').single()).data as Row;
  return refreshed;
 }
 const inserted=await db.from('instagram_post_drafts').insert({...base,revision:1}).select('id').maybeSingle();
 if(inserted.error&&String((inserted.error as any).code||'')!=='23505')throw inserted.error;
 const id=inserted.data?.id||checked(await db.from('instagram_post_drafts').select('id').eq('draft_date',today).eq('draft_role','workspace').eq('status','needs_approval').single()).data!.id;
 return readDraft(db,id);
}
async function nextEventCampaignLanguage(db:DB,eventId:string):Promise<ContentLanguage>{
 const history=checked(await db.from('marketing_event_campaign_history').select('content_language,generated_at').eq('event_id',eventId).eq('status','generated').order('generated_at',{ascending:false}).limit(1)).data as Row[];
 const previous=history?.[0]?.content_language;
 if(previous==='ko')return 'en';
 if(previous==='en')return 'ko';
 return nextContentLanguage(db);
}
export async function automaticEventGeneration(){
 if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')throw new Error('PRODUCTION_ONLY');
 const db=createServiceRoleClient(),settings=checked(await db.from('marketing_automation_settings').select('*').eq('singleton',true).single()).data as Row;
 if(settings.event_campaign_enabled===false)return {skipped:true,reason:'EVENT_CAMPAIGN_DISABLED'};
 const opportunity=await selectAutomaticEventCampaign(db,Number(settings.event_campaign_max_posts||5));
 if(!opportunity)return {skipped:true,reason:'NO_EVENT_CAMPAIGN_OPPORTUNITY'};
 const key='auto:event:'+opportunity.event_id+':'+opportunity.stage;
 const existing=checked(await db.from('marketing_generation_jobs').select('id,status').eq('request_key',key).maybeSingle()).data;
 if(existing)return {deduplicated:true,job:existing,event_campaign:{event_id:opportunity.event_id,stage:opportunity.stage}};
 const language=await nextEventCampaignLanguage(db,opportunity.event_id),today=kstDate(),dow=new Date(today+'T12:00:00+09:00').getUTCDay();
 const rec=checked(await db.from('instagram_posting_time_recommendations').select('*').eq('dow',dow).maybeSingle()).data as Row|null;
 const draft=await createAutomaticEventDraft(db,opportunity,language,rec||{});
 const result=await runGeneration(draft.id,{request_key:key,revision:draft.revision,mode:'both',visual_mode:'cards',visual_source:'auto_ai',content_mode:'live_event',language,event_id:opportunity.event_id,event_campaign_stage:opportunity.stage,event_campaign_pattern:opportunity.pattern,instruction:''},null,true);
 if(result.job?.status==='completed'){
  const completedJob=result.job as Row;
  await recordAutomaticEventCampaign(db,opportunity.event_id,opportunity.stage,opportunity.pattern,String(completedJob.id),draft.id,result.draft.event_facts_snapshot||result.draft.content_document?.event_facts||opportunity.facts,language);
 }
 return {...result,event_campaign:{event_id:opportunity.event_id,stage:opportunity.stage,pattern:opportunity.pattern,score:opportunity.score}};
}
export async function automaticGeneration(){
 if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')throw new Error('PRODUCTION_ONLY');
 const db=createServiceRoleClient(),settings=checked(await db.from('marketing_automation_settings').select('*').eq('singleton',true).single()).data as Row,time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
 if(!settings.daily_instagram_enabled||time<String(settings.draft_generation_time_kst).slice(0,5))return {skipped:true};
 const key='auto:'+kstDate(),existing=checked(await db.from('marketing_generation_jobs').select('id,status').eq('request_key',key).maybeSingle()).data;if(existing)return {deduplicated:true,job:existing};
 const growthSlot=settings.growth_mode_enabled?planGrowthSlot(kstDate(),await growthLearningWeights(db)):null;
 const trendScheduled=!growthSlot||growthSlot.pillar==='seoul';
 const selectedTrend=trendScheduled&&settings.trend_radar_enabled&&settings.trend_override_enabled?await selectTrendForAutomaticContent(db,Number(settings.trend_override_score||80)):null;
 const draft=await todayDraft(selectedTrend,growthSlot);if(draft.status!=='needs_approval')return {skipped:true};
 const trend=selectedTrend&&draft.trend_id===selectedTrend.id?selectedTrend:null,instruction=trend?[String(trend.display_name),String(trend.content_angle||trend.summary||'')].filter(Boolean).join(': ').slice(0,500):'';
 const result=await runGeneration(draft.id,{request_key:key,revision:draft.revision,mode:'both',visual_mode:'cards',visual_source:'auto_ai',content_mode:draft.draft_kind==='growth_carousel'?'growth_carousel':draft.content_mode,topic_type:draft.growth_topic_type||'conversation_prompt',instruction},null,true);
 if(trend&&result.job?.status==='completed')await markTrendUsed(db,trend.id);
 return {...result,trend_override:trend?{id:trend.id,trend_key:trend.trend_key,display_name:trend.display_name,score:trend.adjusted_trend_score||trend.trend_score,route_type:trend.route_type}:null};
}
