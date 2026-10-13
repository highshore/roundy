import { createHash } from 'node:crypto';
import 'server-only';
import sharp from 'sharp';
import { CAMPAIGN_PATTERNS,CAMPAIGN_TONES,CAMPAIGN_VERSION } from './marketing-campaign';
import { type CarouselPlan } from './marketing-carousel-template';
import { CONTENT_POLICY_VERSION } from './marketing-content-policy';
import { EDITOR_FIRST_VERSION,validEditorialSeries } from './marketing-editor-first';
import { editorialCard } from './marketing-editorial';
import { EVENT_CAMPAIGN_PATTERNS,EVENT_CAMPAIGN_STAGES } from './marketing-event-campaign';
import { CAMPAIGN_PRESET,EVENT_CAMPAIGN_PRESET } from './marketing-presentation';
import { loadEditorialAssets } from './marketing-render-assets';
import { pexelsConfigured } from './marketing-stock-photos';
import { renderLiveEventCampaign,renderPrelaunchCampaign } from './marketing-visuals';
import { productionMetrics } from './marketing-workflow';
// EDITORIAL_V2_INTEGRATED
import { createServiceRoleClient } from './supabase/service';
type Row=Record<string,any>;
type DB=ReturnType<typeof createServiceRoleClient>;
type ContentLanguage='ko'|'en';
type VisualSource='auto_ai'|'uploaded'|'none'|'pexels'|'stock';
export type GenerationInput={editorial_workflow_version?:2;editorial_series?:import('./marketing-editor-first').EditorialSeries;selected_topic_key?:string;editorial_lane?:string;story_card_count?:3|5;carousel_plan?:CarouselPlan|null;brand_outro_enabled?:boolean;answer_first_enabled?:boolean;ai_image_slot?:number|null;request_key:string;revision:number;mode:'text'|'image'|'both';content_mode:'prelaunch'|'live_event'|'growth_carousel';visual_mode:'cards'|'photo';visual_source?:VisualSource;topic_type?:string;instruction?:string;language?:ContentLanguage;confirm_photo?:boolean;render_only?:boolean;campaign_pattern?:'auto'|'poster'|'problem_solution'|'how_it_works'|'benefit_stack'|'countdown';campaign_tone?:'modern_premium'|'soft_romantic'|'bold_teaser';launch_date?:string;event_id?:string;event_campaign_stage?:'auto'|'launch'|'experience'|'venue'|'participants'|'momentum'|'imminent'|'last_call';event_campaign_pattern?:'auto'|'event_poster'|'experience'|'social_proof'|'offer'|'last_call'};
const topics=['mbti','dating_archetype','book_insight','trend_research','meme_remix','dating_myth','conversation_prompt','seoul_dating','korea_life','mini_quiz'];
const allowedTopics=[...topics,'seoul_trend'];
const researchTopics=new Set(['book_insight','trend_research','dating_myth','seoul_dating','seoul_trend']);
const COPY_MODEL='gpt-6-luna',IMAGE_MODEL='gpt-image-2.5-flare',MAX_INPUT_BYTES=16000;
export const kstDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const checked=<T extends {error:unknown}>(r:T):T=>{if(r.error)throw r.error;return r;};
const safeError=(error:unknown)=>(error instanceof Error?error.message:String((error as Row)?.message||'Generation failed')).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').slice(0,500);
const isMagazineReview=(doc:Row)=>doc?.design_preset==='roundy_magazine_editorial_v2';
export class GenerationError extends Error{constructor(public code:string,message:string,public block=false){super(message);}}
export function validateGenerationInput(value:unknown):GenerationInput{
 const v=value as GenerationInput;
 if(!v||typeof v!=='object'||typeof v.request_key!=='string'||!/^[a-zA-Z0-9:_-]{8,120}$/.test(v.request_key)||!Number.isInteger(v.revision)||v.revision<1||v.revision>98)throw new Error('INVALID_GENERATION_REQUEST');
 if(!['text','image','both'].includes(v.mode)||!['prelaunch','live_event','growth_carousel'].includes(v.content_mode)||!['cards','photo'].includes(v.visual_mode))throw new Error('INVALID_GENERATION_OPTIONS');
 if(v.editorial_workflow_version!==undefined&&v.editorial_workflow_version!==EDITOR_FIRST_VERSION)throw new Error('INVALID_EDITORIAL_WORKFLOW');
 if(v.editorial_series!==undefined&&!validEditorialSeries(v.editorial_series))throw new Error('INVALID_EDITORIAL_SERIES');
 if(v.editorial_lane!==undefined&&!['auto','seoul','relationship','social','brand'].includes(v.editorial_lane))throw new Error('INVALID_EDITORIAL_LANE');
 if(v.story_card_count!==undefined&&![3,5].includes(v.story_card_count))throw new Error('INVALID_STORY_CARD_COUNT');
 if(v.instruction!==undefined&&(typeof v.instruction!=='string'||v.instruction.trim().length>500))throw new Error('INSTRUCTION_LIMIT_500');
 if(v.answer_first_enabled!==undefined&&typeof v.answer_first_enabled!=='boolean')throw new Error('INVALID_ANSWER_FIRST_OPTION');
 if(v.ai_image_slot!==undefined&&v.ai_image_slot!==null&&(!Number.isInteger(v.ai_image_slot)||v.ai_image_slot<0||v.ai_image_slot>3))
  throw new Error('INVALID_AI_IMAGE_SLOT');
 if(v.ai_image_slot!==undefined&&(v.mode==='image'||v.visual_mode!=='cards'||!['auto_ai','pexels','stock'].includes(String(v.visual_source||'auto_ai'))))
  throw new Error('AI_IMAGE_SLOT_NOT_APPLICABLE');
 const topicType=v.content_mode==='growth_carousel'?v.topic_type:undefined;
 if(topicType!=null&&!allowedTopics.includes(topicType))throw new Error('INVALID_GROWTH_TOPIC');
 if(v.language!==undefined&&!['ko','en'].includes(v.language))throw new Error('INVALID_CONTENT_LANGUAGE');
 if(v.visual_source!==undefined&&!['auto_ai','uploaded','none','pexels','stock'].includes(v.visual_source))throw new Error('INVALID_VISUAL_SOURCE');
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
 if(['pexels','stock'].includes(String(v.visual_source))&&v.mode==='text')throw new Error('STOCK_VISUALS_REQUIRE_IMAGE_MODE');
 const visualSource:VisualSource=v.visual_source||(v.mode==='text'?'none':'auto_ai');
 if(v.mode==='image'&&visualSource==='none')throw new Error('IMAGE_SOURCE_REQUIRED');
 return {...v,visual_source:visualSource,topic_type:topicType,instruction:v.instruction?.trim()||'',...(v.content_mode==='prelaunch'?{campaign_pattern:v.campaign_pattern||'auto',campaign_tone:v.campaign_tone||'modern_premium'}:{}),...(v.content_mode==='live_event'?{event_campaign_stage:v.event_campaign_stage||'auto',event_campaign_pattern:v.event_campaign_pattern||'auto'}:{})};
}
async function readControl(db:DB){return checked(await db.from('marketing_ai_control').select('*').eq('singleton',true).single()).data as Row;}
async function upstream(endpoint:string,body:Row,timeout:number):Promise<Row>{
 const key=process.env.OPENAI_API_KEY?.trim();
 if(!key)throw new GenerationError('OPENAI_KEY_MISSING','Vercel Production에 OPENAI_API_KEY를 설정하고 재배포한 뒤 AI 재개를 누르세요.',true);
 // Exactly one raw request: no SDK retries, gateway fallback or retry loops.
 let response:Response;
 try{response=await fetch('https://api.openai.com/v1/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error',cache:'no-store'});}catch{throw new GenerationError('UPSTREAM_OUTCOME_UNKNOWN','API 응답을 확인하지 못했습니다. 중복 과금을 피하려고 자동 재시도를 중지했습니다.',true);}
 const data=await response.json().catch(()=>null);
 if(!response.ok){const code=String(data?.error?.code||'OPENAI_HTTP_'+response.status),message=String(data?.error?.message||'OpenAI request failed.');throw new GenerationError(code,'OpenAI '+response.status+': '+safeError(new Error(message)),[401,403,404].includes(response.status)||['insufficient_quota','credit_balance_exhausted','billing_hard_limit_reached'].includes(code));}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new GenerationError('UPSTREAM_OUTCOME_UNKNOWN','API 응답을 읽지 못했습니다. 중복 과금을 피하려고 자동 재시도를 중지했습니다.',true);return data;
}
async function storeImage(db:DB,job:Row,bytes:Buffer,index:number){
 if(bytes.length>5*1024*1024)throw new Error('IMAGE_SIZE_LIMIT');
 const suffix=createHash('sha256').update(job.id+':'+index).digest('hex'),id=suffix.slice(0,8)+'-'+suffix.slice(8,12)+'-'+suffix.slice(12,16)+'-'+suffix.slice(16,20)+'-'+suffix.slice(20,32),path=job.id+'/'+id+'.jpg';
 checked(await db.storage.from('wis-event-images').upload(path,bytes,{contentType:'image/jpeg',upsert:true}));return db.storage.from('wis-event-images').getPublicUrl(path).data.publicUrl;
}
async function renderCardsWithAssets(db:DB,draft:Row,job:Row,assets:Awaited<ReturnType<typeof loadEditorialAssets>>,directCards:Record<number,Buffer>={},deadline=Infinity){
 const cards=draft.carousel_slides||[];
 if(!draft.content_document||!cards.length||cards.length>6)throw new Error('유형별 카드 문구가 없습니다. 품질 재작업 후 렌더하세요.');
 const urls:string[]=[];
 for(let i=0;i<cards.length;i++){
  if(Date.now()+25000>deadline)throw new Error('CONTENT_RENDER_TIME_LIMIT');
  await progress(db,job,'rendering_'+(i+1)+'_of_'+cards.length);
  if(directCards[i]){urls.push(await storeImage(db,job,directCards[i],i));continue;}
  const document={...draft.content_document,slides:cards};
  const image=document.design_preset===CAMPAIGN_PRESET
   ?renderPrelaunchCampaign(cards[i],i,cards.length,document,assets)
   :document.design_preset===EVENT_CAMPAIGN_PRESET
    ?renderLiveEventCampaign(cards[i],i,cards.length,document,assets)
    :editorialCard(cards[i],i,cards.length,document,assets);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{const bytes=await Promise.race([image.arrayBuffer(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('CARD_RENDER_TIMEOUT')),20000);})]);
   urls.push(await storeImage(db,job,await sharp(Buffer.from(bytes)).jpeg({quality:88}).toBuffer(),i));
  }finally{if(timer)clearTimeout(timer);}
 }
 return urls;
}
function visualContext(draft:Row){
 const slides=Array.isArray(draft.carousel_slides)?draft.carousel_slides:[];
 return slides.slice(0,6).map((slide:Row,index:number)=>[
  'Card '+(index+1),
  String(slide.role||'content'),
  String(slide.title||'').slice(0,100),
  String(slide.body||'').slice(0,220),
  slide.visual_direction?'Visual: '+String(slide.visual_direction).slice(0,180):''
 ].filter(Boolean).join(' | ')).join('\n');
}
type GenerationThreadContext={selectedTopicKey?:string;threadId:string;attemptNumber:number;retryOfJobId:string;recoverySourceJobId?:string;workflowId?:string};
export async function generationOverview(){
 const db=createServiceRoleClient(),date=kstDate(),month=date.slice(0,7)+'-01';
 const [control,jobs,usage,dispatch]=await Promise.all([readControl(db),db.from('marketing_generation_jobs').select('*').order('created_at',{ascending:false}).limit(100),db.from('marketing_generation_jobs').select('reserved_usd,created_at,operation,status').gte('created_at',month+'T00:00:00+09:00'),db.from('marketing_generation_dispatches').select('dispatch_date,requested_at').eq('dispatch_date',date).maybeSingle()]);
 checked(jobs);checked(usage);checked(dispatch);const rows=usage.data||[],dayStart=Date.parse(date+'T00:00:00+09:00'),todayRows=rows.filter(r=>Date.parse(r.created_at)>=dayStart);
 const temporaryActive=Boolean(control.temporary_daily_budget_usd&&control.temporary_daily_budget_expires_at&&Date.parse(control.temporary_daily_budget_expires_at)>Date.now());
 const dailyBudget=temporaryActive?Number(control.temporary_daily_budget_usd):Number(control.daily_budget_usd);
 return {control,jobs:jobs.data,workflow_metrics:productionMetrics(jobs.data||[]),dispatch:dispatch.data,usage:{daily_reserved_usd:todayRows.reduce((sum,r)=>sum+Number(r.reserved_usd),0),daily_budget_usd:dailyBudget,daily_budget_override_expires_at:temporaryActive?control.temporary_daily_budget_expires_at:null,monthly_reserved_usd:rows.reduce((sum,r)=>sum+Number(r.reserved_usd),0),monthly_budget_usd:Number(control.monthly_budget_usd),daily_attempts:todayRows.filter(r=>Number(r.reserved_usd)>0).length,daily_calls:todayRows.filter(r=>Number(r.reserved_usd)>0&&['running','completed','uncertain'].includes(r.status)).length,daily_call_limit:Number(control.daily_call_limit??10),monthly_call_limit:Number(control.monthly_call_limit??180),render_daily_limit:Number(control.render_daily_limit??10),photo_daily_limit:Number(control.daily_call_limit??10),photo_monthly_limit:Number(control.monthly_call_limit??180)},provider:{configured:!!process.env.OPENAI_API_KEY?.trim(),pexels_configured:pexelsConfigured(),stock_photos_per_carousel:'2-3 (configured by carousel size)',stock_review_required:true,stock_cooldown_days:90,copy_model:COPY_MODEL,image_model:IMAGE_MODEL,automatic_photos:true,manual_uploaded_images:false,fresh_visuals_per_generation:1,static_photo_reuse:false,external_retries:0,copy_repair_limit:0,research_search_limit:3,verified_book_catalog:true,research_fallback:false,content_policy_version:CONTENT_POLICY_VERSION,prelaunch_campaign_version:CAMPAIGN_VERSION,prelaunch_campaign_patterns:CAMPAIGN_PATTERNS,research_reservation_usd:0.05}};
}

// Stateless provider/render primitives shared by isolated content-step workers.
export { upstream as marketingProviderRequest,renderCardsWithAssets,visualContext };

// Scheduler entrypoints always use the central controller. Pausing cannot re-enable legacy generation.
export async function automaticEventGeneration(){
 return (await import('./marketing-content-automation')).startAutomaticContentWorkflow(createServiceRoleClient(),true);
}
export async function automaticGeneration(){
 return (await import('./marketing-content-automation')).startAutomaticContentWorkflow(createServiceRoleClient(),false);
}

async function progress(db:DB,job:Row,stage:string){
 const c=await readControl(db);if(job.reserved_usd>0&&(!c.enabled||c.blocked_reason))throw new GenerationError('AI_PAUSED',c.blocked_reason||'AI was paused by an administrator.');
 const r=checked(await db.from('marketing_generation_jobs').update({stage,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','running').select('id').maybeSingle());
 if(!r.data||Date.now()-Date.parse(job.created_at)>290000)throw new GenerationError('JOB_EXPIRED','Execution expired. No automatic retry will occur.');
}
