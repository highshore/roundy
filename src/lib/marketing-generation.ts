import {prepareSavedCtaRecovery,SAVED_CTA_RECOVERY_VERSION} from './marketing-output-recovery';
import {loadEditorialAssets} from './marketing-render-assets';
import {CONTENT_POLICY_VERSION} from './marketing-content-policy';
import {selectTrendForAutomaticContent,markTrendUsed} from './marketing-trend-radar';
import 'server-only';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import {generateEditorialCopy,draftQuality,editorialCard,editorialPhotoCover} from './marketing-editorial';
import {generateCampaignCopy,campaignDraftQuality,CAMPAIGN_VERSION,CAMPAIGN_PATTERNS,CAMPAIGN_TONES} from './marketing-campaign';
import {CAMPAIGN_PRESET} from './marketing-presentation';
import {renderPrelaunchCampaign} from './marketing-visuals';
// EDITORIAL_V2_INTEGRATED
import { createServiceRoleClient } from './supabase/service';
type Row=Record<string,any>;
type DB=ReturnType<typeof createServiceRoleClient>;
type ContentLanguage='ko'|'en';
type VisualSource='auto_ai'|'uploaded'|'none';
export type GenerationInput={request_key:string;revision:number;mode:'text'|'image'|'both';content_mode:'prelaunch'|'live_event'|'growth_carousel';visual_mode:'cards'|'photo';visual_source?:VisualSource;topic_type?:string;instruction?:string;language?:ContentLanguage;confirm_photo?:boolean;render_only?:boolean;campaign_pattern?:'auto'|'poster'|'problem_solution'|'how_it_works'|'benefit_stack'|'countdown';campaign_tone?:'modern_premium'|'soft_romantic'|'bold_teaser';launch_date?:string};
const topics=['mbti','dating_archetype','book_insight','trend_research','meme_remix','dating_myth','conversation_prompt','seoul_dating','mini_quiz'];
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
 if(v.visual_source!==undefined&&!['auto_ai','uploaded','none'].includes(v.visual_source))throw new Error('INVALID_VISUAL_SOURCE');
 if(v.campaign_pattern!==undefined&&!['auto',...CAMPAIGN_PATTERNS].includes(v.campaign_pattern as any))throw new Error('INVALID_CAMPAIGN_PATTERN');
 if(v.campaign_tone!==undefined&&!(CAMPAIGN_TONES as readonly string[]).includes(v.campaign_tone))throw new Error('INVALID_CAMPAIGN_TONE');
 if(v.launch_date!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(v.launch_date)||!Number.isFinite(Date.parse(v.launch_date+'T00:00:00+09:00'))))throw new Error('INVALID_LAUNCH_DATE');
 if(v.content_mode!=='prelaunch'&&(v.campaign_pattern!==undefined||v.campaign_tone!==undefined||v.launch_date!==undefined))throw new Error('CAMPAIGN_OPTIONS_PRELAUNCH_ONLY');
 if(v.content_mode==='prelaunch'&&v.campaign_pattern==='countdown'&&!v.launch_date)throw new Error('COUNTDOWN_REQUIRES_LAUNCH_DATE');
 if(v.visual_mode==='photo'&&(v.content_mode==='growth_carousel'||v.mode==='text'||v.render_only))throw new Error('PHOTO_OPTION_NOT_APPLICABLE');
 if(v.visual_mode==='photo'&&v.confirm_photo!==true)throw new Error('CONFIRM_PAID_PHOTO_FIRST');
 if(v.render_only&&v.mode!=='image')throw new Error('INVALID_RENDER_OPTIONS');
 const visualSource:VisualSource=v.visual_source||(v.mode==='text'?'none':'auto_ai');
 if(v.mode==='image'&&visualSource==='none')throw new Error('IMAGE_SOURCE_REQUIRED');
 return {...v,visual_source:visualSource,topic_type:topicType,instruction:v.instruction?.trim()||'',...(v.content_mode==='prelaunch'?{campaign_pattern:v.campaign_pattern||'auto',campaign_tone:v.campaign_tone||'modern_premium'}:{})};
}
async function readDraft(db:DB,id:string){return checked(await db.from('instagram_post_drafts').select('*').eq('id',id).single()).data as Row;}
async function readControl(db:DB){return checked(await db.from('marketing_ai_control').select('*').eq('singleton',true).single()).data as Row;}
async function progress(db:DB,job:Row,stage:string){
 const c=await readControl(db);if(job.reserved_usd>0&&(!c.enabled||c.blocked_reason))throw new GenerationError('AI_PAUSED',c.blocked_reason||'AI was paused by an administrator.');
 const r=checked(await db.from('marketing_generation_jobs').update({stage,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','running').select('id').maybeSingle());
 if(!r.data||Date.now()-Date.parse(job.created_at)>290000)throw new GenerationError('JOB_EXPIRED','Execution expired. No automatic retry will occur.');
}
async function upstream(endpoint:string,body:Row,timeout:number):Promise<Row>{
 const key=process.env.OPENAI_API_KEY?.trim();
 if(!key)throw new GenerationError('OPENAI_KEY_MISSING','Vercel Production에 OPENAI_API_KEY를 설정하고 재배포한 뒤 AI 재개를 누르세요.',true);
 // Exactly one raw request: no SDK retries, gateway fallback or retry loops.
 let response:Response;
 try{response=await fetch('https://api.openai.com/v1/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error',cache:'no-store'});}catch{throw new GenerationError('UPSTREAM_OUTCOME_UNKNOWN','API 응답을 확인하지 못했습니다. 중복 과금을 피하려고 자동 재시도를 중지했습니다.',true);}
 const data=await response.json().catch(()=>null);
 if(!response.ok){const code=String(data?.error?.code||'OPENAI_HTTP_'+response.status),message=String(data?.error?.message||'OpenAI request failed.');throw new GenerationError(code,'OpenAI '+response.status+': '+safeError(new Error(message)),[401,403,404,429].includes(response.status));}
 if(!data)throw new GenerationError('INVALID_API_RESPONSE','OpenAI returned an unreadable response.');return data;
}
function slide(value:Row,index:number,total:number){
 if(!value||typeof value.title!=='string'||typeof value.body!=='string'||!value.title.trim()||!value.body.trim())throw new Error('INVALID_SLIDE');
 return {eyebrow:String(value.eyebrow||'ROUNDY NOTES').slice(0,40),title:value.title.trim().slice(0,90),body:value.body.trim().slice(0,320),source_label:String(value.source_label||'').slice(0,100),variant:index===0?'hook':index===total-1?'roundy':'content'};
}
function sourceRows(value:unknown){if(!Array.isArray(value))return [];return value.slice(0,3).filter((x:Row)=>{try{return new URL(x.url).protocol==='https:';}catch{return false;}}).map((x:Row)=>({title:String(x.title||'').slice(0,160),publisher:String(x.publisher||'').slice(0,80),url:String(x.url).slice(0,1000),date:String(x.date||'').slice(0,40)}));}
function researchEvidenceFromResponse(result:Row):{sources:Row[];searchCompleted:boolean}{
 const found=new Map<string,Row>();let searchCompleted=false;
 const add=(item:Row)=>{
  const nested=item?.url_citation&&typeof item.url_citation==='object'?item.url_citation:item;
  const raw=String(nested?.url||item?.source_website_url||'').trim();if(!raw)return;
  let parsed:URL;try{parsed=new URL(raw);if(parsed.protocol!=='https:')return;}catch{return;}
  const url=(parsed.origin+parsed.pathname+parsed.search).slice(0,1000);
  const publisher=String(nested?.publisher||'').trim()||parsed.hostname.replace(/^www\./,'');
  const title=String(nested?.title||item?.caption||'').trim()||publisher;
  const previous=found.get(url);
  if(!previous||previous.title===previous.publisher)found.set(url,{title:title.slice(0,160),publisher:publisher.slice(0,80),url,date:String(nested?.date||'').slice(0,40)});
 };
 for(const output of Array.isArray(result.output)?result.output:[]){
  if(output?.type==='web_search_call'){
   if(output.status==='completed')searchCompleted=true;
   if(Array.isArray(output.action?.sources))for(const item of output.action.sources)add(item);
   if(typeof output.action?.url==='string')add({url:output.action.url});
   if(Array.isArray(output.results))for(const item of output.results)add(item);
  }
  if(output?.type==='message')for(const part of Array.isArray(output.content)?output.content:[])for(const annotation of Array.isArray(part.annotations)?part.annotations:[])if(annotation?.type==='url_citation')add(annotation);
 }
 if(Array.isArray(result.sources))for(const item of result.sources)add(item);
 return {sources:[...found.values()].slice(0,5),searchCompleted};
}
function parseGeneratedJson(raw:string):Row{
 const trimmed=raw.trim();
 const unfenced=trimmed.replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'').trim();
 try{return JSON.parse(unfenced) as Row;}catch{
  const first=unfenced.indexOf('{'),last=unfenced.lastIndexOf('}');
  if(first>=0&&last>first){
   try{return JSON.parse(unfenced.slice(first,last+1)) as Row;}catch{}
  }
  throw new Error('AI_RETURNED_INVALID_JSON');
 }
}
function normalizeCarouselSlides(value:unknown,growth:boolean):Row[]{
 if(!Array.isArray(value))throw new Error('INVALID_SLIDES');
 const slides=value.filter((item:unknown):item is Row=>Boolean(item)&&typeof item==='object');
 if(!growth){
  if(slides.length<1||slides.length>6)throw new Error('INVALID_SLIDE_COUNT');
  return slides.slice(0,6);
 }
 // Growth carousels are editorial, not a rigid document format. Avoid paying for another
 // model call just because the model returned 4/5/7 cards instead of exactly 6.
 if(slides.length<4)throw new Error('TOO_FEW_GROWTH_SLIDES');
 if(slides.length<=6)return slides;
 // Preserve the opening sequence and the final Roundy CTA when output is too long.
 return [...slides.slice(0,5),slides[slides.length-1]];
}
async function nextContentLanguage(db:DB,excludeId?:string):Promise<ContentLanguage>{
 const history=checked(await db.from('instagram_post_drafts').select('id,content_language,draft_date,caption').eq('draft_role','workspace').order('draft_date',{ascending:false}).limit(30)).data as Row[];
 const previous=(history||[]).find(row=>row.id!==excludeId&&['ko','en'].includes(row.content_language)&&String(row.caption||'').trim());
 return previous?.content_language==='ko'?'en':'ko';
}
async function resolveContentLanguage(db:DB,draft:Row,requested?:ContentLanguage):Promise<ContentLanguage>{
 if(requested==='ko'||requested==='en')return requested;
 if(draft.content_language==='ko'||draft.content_language==='en')return draft.content_language;
 return nextContentLanguage(db,draft.id);
}
async function generateCopy(db:DB,draft:Row,input:GenerationInput,job:Row,_research:boolean){
 if(input.content_mode==='prelaunch')return generateCampaignCopy(db,draft,input,job,upstream);
 return generateEditorialCopy(db,draft,input,job,upstream);
}
function qualityForDraft(draft:Row){
 return draft.content_document?.design_preset===CAMPAIGN_PRESET?campaignDraftQuality(draft):draftQuality(draft);
}
async function savePartial(db:DB,draft:Row,patch:Row){
 const r=checked(await db.from('instagram_post_drafts').update({...patch,revision:draft.revision+1,regenerated_at:new Date().toISOString()}).eq('id',draft.id).eq('status','needs_approval').eq('revision',draft.revision).select('*').maybeSingle());if(!r.data)throw new Error('DRAFT_CHANGED_DURING_GENERATION');return r.data as Row;
}
async function storeImage(db:DB,job:Row,bytes:Buffer,index:number){
 if(bytes.length>5*1024*1024)throw new Error('IMAGE_SIZE_LIMIT');
 const suffix=createHash('sha256').update(job.id+':'+index).digest('hex'),id=suffix.slice(0,8)+'-'+suffix.slice(8,12)+'-'+suffix.slice(12,16)+'-'+suffix.slice(16,20)+'-'+suffix.slice(20,32),path=job.id+'/'+id+'.jpg';
 checked(await db.storage.from('wis-event-images').upload(path,bytes,{contentType:'image/jpeg',upsert:true}));return db.storage.from('wis-event-images').getPublicUrl(path).data.publicUrl;
}
async function renderCardsWithAssets(db:DB,draft:Row,job:Row,assets:Awaited<ReturnType<typeof loadEditorialAssets>>,directCards:Record<number,Buffer>={}){
 const cards=draft.carousel_slides||[];
 if(!draft.content_document||!cards.length||cards.length>6)throw new Error('유형별 카드 문구가 없습니다. 품질 재작업 후 렌더하세요.');
 const urls:string[]=[];
 for(let i=0;i<cards.length;i++){
  await progress(db,job,'rendering_'+(i+1)+'_of_'+cards.length);
  if(directCards[i]){urls.push(await storeImage(db,job,directCards[i],i));continue;}
  const document={...draft.content_document,slides:cards};
  const image=document.design_preset===CAMPAIGN_PRESET?renderPrelaunchCampaign(cards[i],i,cards.length,document,assets):editorialCard(cards[i],i,cards.length,document,assets);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{const bytes=await Promise.race([image.arrayBuffer(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('CARD_RENDER_TIMEOUT')),20000);})]);
   urls.push(await storeImage(db,job,await sharp(Buffer.from(bytes)).jpeg({quality:88}).toBuffer(),i));
  }finally{if(timer)clearTimeout(timer);}
 }
 return urls;
}
async function renderCards(db:DB,draft:Row,job:Row,freshPhotos:string[]){
 if(!Array.isArray(freshPhotos)||freshPhotos.length<3)throw new Error('FRESH_VISUAL_SET_REQUIRED');
 const assets=await loadEditorialAssets();assets.photo=freshPhotos[0];assets.photos=freshPhotos;assets.reusePhotos=true;
 return renderCardsWithAssets(db,draft,job,assets);
}
async function renderUploadedCards(db:DB,draft:Row,job:Row){
 if(draft.draft_role!=='candidate'||draft.generation_source!=='manual')throw new Error('UPLOAD_VISUALS_MANUAL_ONLY');
 const rows=checked(await db.from('marketing_uploaded_images').select('*').eq('draft_id',draft.id).order('sort_order',{ascending:true})).data as Row[];
 if(!rows.length)throw new Error('UPLOADED_IMAGES_REQUIRED');
 if(rows.length>6)throw new Error('TOO_MANY_UPLOADED_IMAGES');
 const cards=draft.carousel_slides||[];if(!cards.length)throw new Error('유형별 카드 문구가 없습니다. 품질 재작업 후 렌더하세요.');
 const assets=await loadEditorialAssets();assets.reusePhotos=false;assets.cardPhotos={};
 const directCards:Record<number,Buffer>={},used=new Set<number>();
 const bodyTargets=Array.from({length:Math.max(0,cards.length-1)},(_,i)=>i+1);
 const nextFree=(preferBody=true)=>{
  const candidates=preferBody?bodyTargets:[0,...bodyTargets];
  const target=candidates.find(index=>!used.has(index));if(target!==undefined)used.add(target);return target;
 };
 const assignTarget=(row:Row)=>{
  if(row.role==='cover'&&!used.has(0)){used.add(0);return 0;}
  return nextFree(row.role==='body');
 };
 for(const row of rows){
  const download=checked(await db.storage.from('marketing-images').download(row.storage_path)).data as Blob;
  const raw=Buffer.from(await download.arrayBuffer());if(!raw.length||raw.length>10*1024*1024)throw new Error('INVALID_UPLOADED_IMAGE');
  const target=assignTarget(row);if(target===undefined)continue;
  if(row.asset_type==='completed_card'){
   const meta=await sharp(raw).metadata();const ratio=(meta.width||0)/(meta.height||1);
   if(Math.abs(ratio-.8)>.035)throw new Error('COMPLETED_CARD_MUST_BE_4_5');
   directCards[target]=await sharp(raw).rotate().resize(1080,1350,{fit:'fill'}).jpeg({quality:90}).toBuffer();
  }else{
   const photoBytes=await sharp(raw).rotate().resize(1080,1350,{fit:'cover'}).jpeg({quality:88}).toBuffer();
   assets.cardPhotos[target]='data:image/jpeg;base64,'+photoBytes.toString('base64');
   if(target===0)assets.photo=assets.cardPhotos[target];
  }
 }
 return renderCardsWithAssets(db,draft,job,assets,directCards);
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
async function generateVisualSet(db:DB,draft:Row,input:GenerationInput,job:Row){
 await progress(db,job,'generating_visual_set');
 const campaign=draft.content_document?.design_preset===CAMPAIGN_PRESET;
 const prompt=(campaign?[
  'Generate THREE distinct but visually coherent premium lifestyle PHOTOGRAPHS for one Roundy pre-launch advertising campaign. Each returned image is a separate photograph, not a collage.',
  'This is campaign photography, not a magazine spread. The server will add all typography later.',
  'Roundy is a Seoul-based offline-first Rotation Dating service. Show believable contemporary Seoul social moments that support the supplied card directions.',
  'Use three complementary framings: one strong environmental/cover image with negative space, one natural one-on-one conversational medium shot, and one detail or social-atmosphere lifestyle shot.',
  'People should look like real adults in natural social situations, not posed romantic partners. Smart-casual styling, natural skin texture, contemporary Seoul atmosphere, restrained premium lighting.',
  'Avoid wedding/couple-shoot styling, exaggerated romance, physical intimacy, hand hearts, staged luxury, crowded nightlife, visible alcohol as the focal point, stock-photo smiles, repeated café compositions, and fake event details.',
  'ABSOLUTELY NO text, letters, typography, logos, signs, watermarks, UI, screenshots, cards, posters, or branded objects inside the photographs.',
  'Portrait 4:5 composition. Leave useful negative space for server-rendered campaign copy.',
  'Campaign pattern: '+String(draft.campaign_pattern||draft.content_document?.campaign_pattern||'poster')+'. Tone: '+String(draft.campaign_tone||draft.content_document?.campaign_tone||'modern_premium')+'.'
 ]:[
  'Generate THREE distinct but visually coherent editorial lifestyle photographs for one Roundy Instagram carousel. Each returned image is a separate photograph from the same campaign, not a collage.',
  'Roundy is a Seoul-based Rotation Dating service for Korean and international adults, including Korean-Korean meetings. The images should support the specific carousel content below instead of reusing a generic dating stock photo.',
  'Vary locations naturally across believable Seoul settings such as a neighborhood street, riverside, restaurant, lounge, rooftop, gallery-like social space, or café only when it genuinely fits. Vary framing as well: one strong cover composition with negative space, one natural conversational medium shot, and one detail/environmental lifestyle shot.',
  'People should look like real adults in a natural social moment, not posed romantic partners. Smart-casual styling, natural skin texture, imperfect gestures, genuine conversation, contemporary Seoul atmosphere.',
  'Magazine-editorial photography: restrained, premium, warm, modern, documentary-natural. Avoid exaggerated romance, physical intimacy, flowers-as-romance clichés, hand hearts, wedding/couple-shoot styling, glamour/luxury cues, crowded parties, visible alcohol, stock-photo smiles, repeated café setups, fake signage, text, logos, watermarks, or invented event facts.',
  'Portrait 4:5 composition. Leave useful negative space where editorial typography can be placed by the server. Do not render any words or Roundy branding inside the photographs.',
  draft.growth_topic_type==='seoul_dating'
   ?'IMPORTANT FOR SEOUL DATING POSTS: the named venues in the copy are factual recommendations, but these generated photographs are mood/editorial illustrations only. Do NOT attempt to depict, reconstruct or label any named venue as if this were a real photo of that place. Use a generic Seoul date atmosphere that matches the category (park, gallery, street, restaurant, riverside, etc.) with no identifiable venue signage.'
   :'',
  draft.growth_topic_type==='seoul_trend'
   ?'IMPORTANT FOR SEOUL TREND POSTS: generate an ORIGINAL Roundy editorial interpretation of the activity/culture described in the cards. Never reproduce a source article photo, social post, screenshot, creator identity, watermark, meme asset, or exact identifiable composition. Do not pretend a generated image is documentary evidence of the trend.'
   :''
 ]).concat(['Carousel context:',visualContext(draft),input.instruction||'']).filter(Boolean).join('\n');
 const result=await upstream('images/generations',{model:IMAGE_MODEL,prompt,n:3,size:'1024x1280',quality:'low',output_format:'jpeg',output_compression:85,background:'opaque'},150000);
 const encoded=(Array.isArray(result.data)?result.data:[]).map((row:Row)=>row?.b64_json).filter((value:unknown):value is string=>typeof value==='string'&&value.length>=100&&value.length<=8*1024*1024);
 if(encoded.length<3)throw new Error('INVALID_GENERATED_VISUAL_SET');
 await progress(db,job,'saving_visual_set');
 return encoded.slice(0,3).map(value=>'data:image/jpeg;base64,'+value);
}
type GenerationThreadContext={threadId:string;attemptNumber:number;retryOfJobId:string;recoverySourceJobId?:string;workflowId?:string};
async function resolveContentWorkflowId(db:DB,draft:Row,job:Row,thread?:GenerationThreadContext){
 if(thread?.workflowId)return thread.workflowId;
 const sourceJobId=String(draft.source_generation_job_id||'');
 if(sourceJobId){
  const source=checked(await db.from('marketing_generation_jobs').select('id,content_workflow_id,generation_thread_id').eq('id',sourceJobId).maybeSingle()).data as Row|null;
  if(source)return String(source.content_workflow_id||source.generation_thread_id||source.id);
 }
 return String(job.id);
}
export async function runGeneration(draftId:string,value:unknown,actor:string|null,automatic=false,thread?:GenerationThreadContext){
 const input=validateGenerationInput(value),db=createServiceRoleClient();
 const visualSource:VisualSource=automatic?'auto_ai':input.visual_source!;
 if(automatic&&input.visual_source&&input.visual_source!=='auto_ai')throw new Error('AUTOMATION_REQUIRES_AI_IMAGES');
 let draft=await readDraft(db,draftId);
 let recoveryPatch:Row|null=null,recoverySource:Row|null=null;
 if(thread?.recoverySourceJobId){
  if(automatic||input.visual_mode!=='cards')throw new Error('SAVED_RESULT_RECOVERY_UNAVAILABLE');
  recoverySource=checked(await db.from('marketing_generation_jobs').select('*').eq('id',thread.recoverySourceJobId).single()).data as Row;
  if(!recoverySource||recoverySource.draft_id!==draftId||(recoverySource.generation_thread_id||recoverySource.id)!==thread.threadId)throw new Error('SAVED_RESULT_RECOVERY_MISMATCH');
  const original=recoverySource.request_payload;
  if(!original||original.content_mode!==input.content_mode||(original.topic_type||null)!==(input.topic_type||null)||original.language!==input.language||(original.instruction||'')!==(input.instruction||''))throw new Error('SAVED_RESULT_RECOVERY_MISMATCH');
  recoveryPatch=prepareSavedCtaRecovery(recoverySource);
 }
 // Verify the schema before reserving or calling any provider.
 checked(await db.from('instagram_post_drafts').select('content_document,quality_report,quality_revision').eq('id',draftId).single());
 if(input.mode==='image'&&!recoveryPatch){const q=qualityForDraft(draft);if(q.status!=='passed')throw new Error('품질 검토 필요: '+q.issues.join(' '));}
 input.language=input.mode==='image'?(draft.content_language==='en'?'en':draft.content_language==='ko'?'ko':await nextContentLanguage(db,draft.id)):await resolveContentLanguage(db,draft,input.language);
 const growth=input.content_mode==='growth_carousel',research=growth&&researchTopics.has(input.topic_type||'')&&!input.render_only&&input.mode!=='image';
 const wantsVisuals=recoveryPatch||input.render_only||input.mode==='image'||input.mode==='both'||automatic;
 const autoVisuals=wantsVisuals&&visualSource==='auto_ai';
 const uploadedVisuals=(input.render_only||input.mode==='image')&&visualSource==='uploaded';
 const operation=autoVisuals?(input.mode==='image'||input.render_only||recoveryPatch?'photo':'copy_photo'):uploadedVisuals?'render':research?'research':'copy';
 const fingerprint=createHash('sha256').update(JSON.stringify({id:draftId,revision:input.revision,mode:input.mode,content:input.content_mode,language:input.language,visual:input.visual_mode,visual_source:visualSource,topic:input.topic_type||'',instruction:input.instruction,render:!!input.render_only,saved_recovery_of:thread?.recoverySourceJobId||null})).digest('hex');
 const reservation=checked(await db.rpc('reserve_marketing_generation',{p_key:input.request_key,p_fingerprint:fingerprint,p_draft:draftId,p_revision:input.revision,p_operation:operation,p_actor:actor,p_automatic:automatic})).data as Row,job=reservation.job as Row;
 if(!reservation.accepted)return {draft,job,deduplicated:true};
 let contentQuality:Row|null=null;
 try{
  const requestPayload={mode:input.mode,content_mode:input.content_mode,language:input.language,visual_mode:input.visual_mode,visual_source:visualSource,topic_type:input.topic_type||null,instruction:input.instruction||'',confirm_photo:input.confirm_photo===true,render_only:input.render_only===true,...(recoverySource?{saved_recovery_of:recoverySource.id}: {})};
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
  if(autoVisuals){
   const freshPhotos=await generateVisualSet(db,draft,input,job);
   const images=await renderCards(db,draft,job,freshPhotos);await progress(db,job,'saving_images');
   draft=await savePartial(db,draft,{images,generation_source:automatic?'automation':'manual',visual_source:'auto_ai',last_regeneration_mode:input.mode,last_regeneration_instruction:input.instruction});
  }else if(uploadedVisuals){
   const images=await renderUploadedCards(db,draft,job);await progress(db,job,'saving_images');
   draft=await savePartial(db,draft,{images,generation_source:'manual',visual_source:'uploaded',last_regeneration_mode:input.mode,last_regeneration_instruction:input.instruction});
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
   generation_recovery:(quality as Row).recovery||draft.content_document?.generation_recovery||null
  };
  checked(await db.from('marketing_generation_jobs').update({status:'completed',stage:'complete',quality_report:quality,result_snapshot:resultSnapshot,result_revision:draft.revision,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','running'));
  return {draft,job:{...job,status:'completed',stage:'complete',result_snapshot:resultSnapshot,result_revision:draft.revision},deduplicated:false};
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
 return {control,jobs:jobs.data,dispatch:dispatch.data,usage:{daily_reserved_usd:todayRows.reduce((sum,r)=>sum+Number(r.reserved_usd),0),daily_budget_usd:dailyBudget,daily_budget_override_expires_at:temporaryActive?control.temporary_daily_budget_expires_at:null,monthly_reserved_usd:rows.reduce((sum,r)=>sum+Number(r.reserved_usd),0),monthly_budget_usd:Number(control.monthly_budget_usd),daily_attempts:todayRows.filter(r=>Number(r.reserved_usd)>0).length,daily_calls:todayRows.filter(r=>Number(r.reserved_usd)>0&&['running','completed','uncertain'].includes(r.status)).length,daily_call_limit:5,monthly_call_limit:90,photo_daily_limit:5,photo_monthly_limit:90},provider:{configured:!!process.env.OPENAI_API_KEY?.trim(),copy_model:COPY_MODEL,image_model:IMAGE_MODEL,automatic_photos:true,manual_uploaded_images:true,fresh_visuals_per_generation:3,static_photo_reuse:false,external_retries:0,copy_repair_limit:1,research_search_limit:3,verified_book_catalog:true,research_fallback:true,content_policy_version:CONTENT_POLICY_VERSION,research_reservation_usd:0.05}};
}
export async function todayDraft(selectedTrend:Row|null=null){
 const db=createServiceRoleClient(),today=kstDate();
 const existing=checked(await db.from('instagram_post_drafts').select('*').eq('draft_date',today).eq('draft_role','workspace').eq('status','needs_approval').maybeSingle()).data as Row|null;
 const settings=checked(await db.from('marketing_automation_settings').select('*').eq('singleton',true).single()).data as Row,dow=new Date(today+'T12:00:00+09:00').getUTCDay();
 const rec=checked(await db.from('instagram_posting_time_recommendations').select('*').eq('dow',dow).maybeSingle()).data as Row|null,isGrowth=Boolean(selectedTrend||settings.growth_carousel_enabled&&settings.growth_days.includes(dow)),rotated=topics[Math.floor(Date.parse(today+'T00:00:00Z')/86400000)%topics.length],topic=selectedTrend?String(selectedTrend.route_type):rotated,language=await nextContentLanguage(db,existing?.id);
 const reason=selectedTrend?'Trend Radar override: '+String(selectedTrend.display_name)+' · score '+Number(selectedTrend.adjusted_trend_score||selectedTrend.trend_score).toFixed(1)+' · '+String(selectedTrend.status):'Hidden generation workspace. Results are imported into independent drafts.';
 const base={draft_date:today,draft_role:'workspace',status:'needs_approval',generation_source:'automation',visual_source:'auto_ai',content_language:language,content_mode:settings.content_mode,draft_kind:isGrowth?'growth_carousel':'brand',growth_topic_type:isGrowth?topic:null,trend_id:selectedTrend?.id||null,content_pillar:selectedTrend?'seoul':'concept',caption:'',cta:'Follow @roundy.meet',destination_url:'https://roundy.team',images:[],carousel_slides:[],research_sources:[],research_status:isGrowth?'pending':'not_required',generation_reason:reason,recommended_time_kst:rec?.recommended_time_kst||'21:00',window_start_kst:rec?.window_start_kst||'20:30',window_end_kst:rec?.window_end_kst||'21:30',scheduled_for:today+'T'+String(rec?.recommended_time_kst||'21:00').slice(0,5)+':00+09:00'};
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
export async function automaticGeneration(){
 if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')throw new Error('PRODUCTION_ONLY');
 const db=createServiceRoleClient(),settings=checked(await db.from('marketing_automation_settings').select('*').eq('singleton',true).single()).data as Row,time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
 if(!settings.daily_instagram_enabled||time<String(settings.draft_generation_time_kst).slice(0,5))return {skipped:true};
 const key='auto:'+kstDate(),existing=checked(await db.from('marketing_generation_jobs').select('id,status').eq('request_key',key).maybeSingle()).data;if(existing)return {deduplicated:true,job:existing};
 const selectedTrend=settings.trend_radar_enabled&&settings.trend_override_enabled?await selectTrendForAutomaticContent(db,Number(settings.trend_override_score||80)):null;
 const draft=await todayDraft(selectedTrend);if(draft.status!=='needs_approval')return {skipped:true};
 const trend=selectedTrend&&draft.trend_id===selectedTrend.id?selectedTrend:null,instruction=trend?[String(trend.display_name),String(trend.content_angle||trend.summary||'')].filter(Boolean).join(': ').slice(0,500):'';
 const result=await runGeneration(draft.id,{request_key:key,revision:draft.revision,mode:'both',visual_mode:'cards',visual_source:'auto_ai',content_mode:draft.draft_kind==='growth_carousel'?'growth_carousel':draft.content_mode,topic_type:draft.growth_topic_type||'conversation_prompt',instruction},null,true);
 if(trend&&result.job?.status==='completed')await markTrendUsed(db,trend.id);
 return {...result,trend_override:trend?{id:trend.id,trend_key:trend.trend_key,display_name:trend.display_name,score:trend.adjusted_trend_score||trend.trend_score,route_type:trend.route_type}:null};
}
