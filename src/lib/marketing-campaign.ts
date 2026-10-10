import 'server-only';
import {fiveCampaignRoles,withAnswerFirstSchema,answerFirstPrompt,answerFirstIssues,applyAnswerFirstDocument} from './marketing-answer-first';
import {createHash} from 'node:crypto';
import {
 CAMPAIGN_PRESET,
 ROUNDY_IDENTITY,
 captionAction,
 captionCoreIssues,
 curateHashtags,
 generatedCta,
 normalizeCaptionCore,
} from './marketing-presentation';

export type CampaignRow=Record<string,any>;
type Call=(endpoint:string,body:CampaignRow,timeout:number)=>Promise<CampaignRow>;

export const CAMPAIGN_VERSION='prelaunch_campaign_v1';
export const CAMPAIGN_PATTERNS=['poster','problem_solution','how_it_works','benefit_stack','countdown'] as const;
export const CAMPAIGN_TONES=['modern_premium','soft_romantic','bold_teaser'] as const;
export type CampaignPattern=typeof CAMPAIGN_PATTERNS[number];
export type CampaignTone=typeof CAMPAIGN_TONES[number];

const ROLE_MAP:Record<CampaignPattern,string[]>={
 poster:['hook','benefit','cta'],
 problem_solution:['hook','problem','solution','benefit','cta'],
 how_it_works:['hook','step','step','step','cta'],
 benefit_stack:['hook','benefit','benefit','benefit','cta'],
 countdown:['hook','countdown','cta'],
};
const GOAL_MAP:Record<CampaignPattern,string>={
 poster:'awareness',
 problem_solution:'differentiation',
 how_it_works:'education',
 benefit_stack:'differentiation',
 countdown:'anticipation',
};
const WEIGHTS:Record<CampaignPattern,number>={
 poster:30,
 problem_solution:25,
 how_it_works:20,
 benefit_stack:20,
 countdown:5,
};
const MODEL='gpt-6-luna';

const ok=(r:any)=>{if(r.error)throw r.error;return r.data;};
const clean=(v:unknown)=>typeof v==='string'?v.replace(/\r\n?/g,'\n').trim():'';
const norm=(v:unknown)=>clean(v).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');

function similarity(a:unknown,b:unknown){
 const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 1;
 const grams=(s:string)=>new Set(Array.from({length:Math.max(0,s.length-2)},(_,i)=>s.slice(i,i+3)));
 const A=grams(x),B=grams(y);if(!A.size||!B.size)return 0;let overlap=0;
 for(const g of A)if(B.has(g))overlap++;
 return overlap/(A.size+B.size-overlap);
}
function validDate(value:unknown):string|null{
 const text=clean(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
 const parsed=Date.parse(text+'T00:00:00+09:00');return Number.isFinite(parsed)?text:null;
}
function countdownLabel(launchDate:string,draftDate:string,language:string){
 const launch=Date.parse(launchDate+'T00:00:00+09:00'),base=Date.parse((validDate(draftDate)||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()))+'T00:00:00+09:00');
 const days=Math.max(0,Math.ceil((launch-base)/86400000));
 if(days===0)return language==='en'?'Today':'오늘';
 if(days===1)return language==='en'?'Tomorrow':'내일';
 return 'D-'+days;
}
function hashNumber(seed:string){
 const bytes=createHash('sha256').update(seed).digest();return bytes.readUInt32BE(0);
}
async function recentCampaignHistory(db:any){
 const rows=ok(await db.from('marketing_generation_jobs').select('id,content_workflow_id,generation_thread_id,draft_id,created_at,result_snapshot,status').eq('status','completed').order('created_at',{ascending:false}).limit(60))||[];
 const seen=new Set<string>(),history:CampaignRow[]=[];
 for(const row of Array.isArray(rows)?rows:[]){
  const doc=row?.result_snapshot?.content_document;
  if(doc?.design_preset!==CAMPAIGN_PRESET||doc?.post_type!=='prelaunch')continue;
  const workflow=String(row.content_workflow_id||row.generation_thread_id||row.result_snapshot?.draft_id||row.draft_id||row.id);
  if(seen.has(workflow))continue;seen.add(workflow);
  history.push({workflow,pattern:String(doc.campaign_pattern||''),hook:String(doc.slides?.[0]?.title||''),created_at:String(row.created_at||'')});
 }
 return history;
}
function choosePattern(requested:unknown,history:CampaignRow[],launchDate:string|null,seed:string):CampaignPattern{
 if(requested&&requested!=='auto'){
  if(!(CAMPAIGN_PATTERNS as readonly string[]).includes(String(requested)))throw new Error('INVALID_CAMPAIGN_PATTERN');
  if(requested==='countdown'&&!launchDate)throw new Error('COUNTDOWN_REQUIRES_LAUNCH_DATE');
  return requested as CampaignPattern;
 }
 const recent=history.slice(0,3),last=history[0]?.pattern;
 let candidates=CAMPAIGN_PATTERNS.filter(p=>(p!=='countdown'||!!launchDate)&&p!==last&&recent.filter(x=>x.pattern===p).length<1);
 if(!candidates.length)candidates=CAMPAIGN_PATTERNS.filter(p=>(p!=='countdown'||!!launchDate)&&p!==last);
 if(!candidates.length)candidates=CAMPAIGN_PATTERNS.filter(p=>p!=='countdown'||!!launchDate);
 const total=candidates.reduce((sum,p)=>sum+WEIGHTS[p],0),roll=hashNumber(seed)%Math.max(1,total);
 let cursor=0;
 for(const p of candidates){cursor+=WEIGHTS[p];if(roll<cursor)return p;}
 return candidates[0]||'poster';
}
function campaignSchema(pattern:CampaignPattern,tone:CampaignTone,language:string,answerFirst=false){
 const roles=answerFirst?fiveCampaignRoles(pattern,ROLE_MAP[pattern]):ROLE_MAP[pattern],primaryTitle=language==='en'?45:24,primaryBody=language==='en'?80:42,secondaryBody=language==='en'?42:80;
 const str=(maxLength:number,minLength=0)=>({type:'string',minLength,maxLength});
 const slide={
  type:'object',
  additionalProperties:false,
  properties:{
   role:{type:'string',enum:[...new Set(roles)]},
   eyebrow:str(24),
   title:str(primaryTitle,1),
   body:str(primaryBody),
   secondary_body:str(secondaryBody),
   visual_direction:str(180,8),
   step_number:{type:'integer',minimum:0,maximum:4},
   source_ids:{type:'array',maxItems:0,items:{type:'string'}},
  },
  required:['role','eyebrow','title','body','secondary_body','visual_direction','step_number','source_ids'],
 };
 return withAnswerFirstSchema({
  type:'object',
  additionalProperties:false,
  properties:{
   schema_version:{type:'integer',enum:[2]},
   campaign_version:{type:'string',enum:[CAMPAIGN_VERSION]},
   design_preset:{type:'string',enum:[CAMPAIGN_PRESET]},
   post_type:{type:'string',enum:['prelaunch']},
   campaign_pattern:{type:'string',enum:[pattern]},
   campaign_tone:{type:'string',enum:[tone]},
   campaign_goal:{type:'string',enum:[GOAL_MAP[pattern]]},
   caption_ko:str(360,1),
   caption_en:str(480,1),
   slides:{type:'array',minItems:roles.length,maxItems:roles.length,items:slide},
  },
  required:['schema_version','campaign_version','design_preset','post_type','campaign_pattern','campaign_tone','campaign_goal','caption_ko','caption_en','slides'],
 },language,answerFirst);
}
function campaignInstructions(pattern:CampaignPattern,tone:CampaignTone,language:string,launchDate:string|null,answerFirst=false){
 const limits=language==='en'?'headline <= 45 characters; subcopy <= 80 characters':'headline <= 24 characters; subcopy <= 42 characters';
 const patternGuide:Record<CampaignPattern,string>={
  poster:'POSTER: hook = one arresting brand statement; benefit = one supporting product truth; CTA = a clean launch/follow invitation. Treat every card like a campaign poster, not a page of information.',
  problem_solution:'PROBLEM -> SOLUTION: hook names a recognisable friction; problem makes it concrete without attacking other apps; solution introduces Roundy\'s offline-first format; benefit states the user-facing payoff; CTA closes the launch campaign.',
  how_it_works:'HOW IT WORKS: hook introduces the flow; step 1 = meet one-on-one; step 2 = rotate / have the next conversation; step 3 = choose privately and only match when mutual; CTA closes. Keep each step visually and verbally independent.',
  benefit_stack:'BENEFIT STACK: hook sets the proposition; each benefit card contains exactly one distinct benefit with no repeated explanation; CTA closes. Prefer crisp fragments over explanatory prose.',
  countdown:'COUNTDOWN: hook creates anticipation without invented scarcity; countdown uses only the server-supplied timing; CTA tells people where to follow for the launch. Do not invent an event, venue, ticket, or application deadline.',
 };
 const toneGuide:Record<CampaignTone,string>={
  modern_premium:'MODERN PREMIUM: clean, confident, urban, minimal, restrained. No luxury-status language.',
  soft_romantic:'SOFT ROMANTIC: warm and human, but never sentimental, destiny-based, wedding-like, or cliché.',
  bold_teaser:'BOLD TEASER: high-impact, few words, strong contrast, curiosity first. Do not become aggressive or sensational.',
 };
 return [
  'Create a PRE-LAUNCH ADVERTISING CAMPAIGN for Roundy, a Seoul-based offline-first Rotation Dating service.',
  'This is NOT editorial content, NOT a magazine carousel, NOT an article, and NOT educational long-form content.',
  'Goal: stop the scroll, explain one idea quickly, create curiosity, and make Roundy feel like a real consumer brand launch.',
  'Use ONLY the selected campaign pattern: '+pattern+'. Exact card roles in order: '+(answerFirst?fiveCampaignRoles(pattern,ROLE_MAP[pattern]):ROLE_MAP[pattern]).join(' -> ')+'.',
  patternGuide[pattern],
  'Campaign tone: '+tone+'. '+toneGuide[tone],
  'ONE message per card. '+limits+'. body is optional short subcopy, never a paragraph. Do not fill the maximum just because it exists.',
  'Use strong ad-copy compression. No magazine-style eyebrow/title/body hierarchy, no essays, no bullet-heavy explainer cards.',
  'Core product truths you MAY use: offline-first; meet people one-on-one; rotate between conversations; choose privately; match only when interest is mutual; Seoul-based social format.',
  'Do NOT invent participant counts, launch dates, prices, venues, success rates, testimonials, scarcity, screening/qualification claims, safety guarantees, or event facts.',
  'Avoid cliché dating copy such as 특별한 인연, 운명적인 만남, 소중한 인연, meaningful connection, find your person, unforgettable night.',
  'Korean must sound like natural Korean advertising, not translated English. Do not use the middle dot character in Korean prose.',
  'Each visual_direction describes a clean TEXT-FREE photograph the image model can make later. Never ask for text, typography, logos, signs, screenshots, or watermarks inside the photograph.',
  'caption_ko and caption_en are concise equivalent Instagram caption cores with 2-4 short paragraphs. Do not include CTA language, handles, URLs, hashtags, or source labels; the server appends them.',
  'No research claims, statistics, percentages, or claims that something is trending.',
  pattern==='how_it_works'?'For the three step cards use step_number 1, 2, 3. Other cards use 0. Explain Meet -> Rotate/Conversation -> Private choice/Mutual match without overexplaining.':'All step_number values must be 0.',
  pattern==='countdown'
   ?'A verified launch date was supplied by the server: '+launchDate+'. The countdown card title will be normalized server-side. Do not invent another date.'
   :'No launch date is supplied. Do not use D-day numbers, dates, "tomorrow", "today", or any specific opening date.',
  language==='en'?'Primary card title/body are English. secondary_body is a short faithful Korean rendering of body only.':'Primary card title/body are Korean. secondary_body is a short faithful English rendering of body only.',
 ].join('\n')+(answerFirst?'\n'+answerFirstPrompt(language):'');
}
function parseDocument(result:CampaignRow){
 const choice=result.choices?.[0],raw=choice?.message?.content;
 if(choice?.finish_reason!=='stop'||choice.message?.refusal||typeof raw!=='string')throw new Error('CAMPAIGN_RESPONSE_INCOMPLETE');
 try{return {document:JSON.parse(raw) as CampaignRow,raw};}catch{throw new Error('AI_RETURNED_INVALID_JSON');}
}
function normalizeCampaignDocument(raw:CampaignRow,language:string,pattern:CampaignPattern,tone:CampaignTone,launchDate:string|null,draftDate:string,answerFirst=false){
 const ko=language!=='en',roles=answerFirst?fiveCampaignRoles(pattern,ROLE_MAP[pattern]):ROLE_MAP[pattern],inputSlides=Array.isArray(raw.slides)?raw.slides:[];
 const slides=roles.map((role,index)=>{
  const source=inputSlides[index]||{},main=clean(source.body),secondary=clean(source.secondary_body);
  const normalized:CampaignRow={
   role,
   eyebrow:clean(source.eyebrow),
   title:clean(source.title),
   body:main,
   secondary_body:secondary,
   visual_direction:clean(source.visual_direction),
   step_number:pattern==='how_it_works'&&role==='step'?roles.slice(0,index+1).filter(r=>r==='step').length:0,
   source_ids:[],
   variant:role==='hook'?'hook':role==='cta'?'roundy':role,
   body_ko:ko?main:secondary,
   body_en:ko?secondary:main,
  };
  if(pattern==='countdown'&&role==='countdown'&&launchDate)normalized.title=countdownLabel(launchDate,draftDate,language);
  if(role==='cta'){normalized.instagram=ROUNDY_IDENTITY.instagram;normalized.website=ROUNDY_IDENTITY.website;}
  return normalized;
 });
 const caption_ko=normalizeCaptionCore(raw.caption_ko,'ko'),caption_en=normalizeCaptionCore(raw.caption_en,'en');
 return {
  ...raw,
  schema_version:2,
  campaign_version:CAMPAIGN_VERSION,
  design_preset:CAMPAIGN_PRESET,
  post_type:'prelaunch',
  campaign_pattern:pattern,
  campaign_tone:tone,
  campaign_goal:GOAL_MAP[pattern],
  launch_date:launchDate,
  caption_ko,
  caption_en,
  caption:ko?caption_ko:caption_en,
  cta:generatedCta(language),
  hashtags:curateHashtags('prelaunch',[],raw),
  hashtag_selection:{basis:'topic_relevance_catalog',search_volume_verified:false},
  content_language:ko?'ko':'en',
  slides,
 };
}
function buildCampaignCaption(document:CampaignRow){
 const tags=curateHashtags('prelaunch',document.hashtags,document).join(' ');
 const ko=[clean(document.caption_ko),captionAction('prelaunch','ko')].filter(Boolean).join('\n\n');
 const en=[clean(document.caption_en),captionAction('prelaunch','en')].filter(Boolean).join('\n\n');
 return [ko,en,[ROUNDY_IDENTITY.instagram+' | '+ROUNDY_IDENTITY.website,tags].filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
}
export function evaluateCampaignDocument(document:CampaignRow,language:string,recentHooks:string[]=[],launchDate:string|null=null){
 const issues:string[]=[],add=(value:string)=>{if(!issues.includes(value))issues.push(value);};
 const pattern=document?.campaign_pattern as CampaignPattern,tone=document?.campaign_tone as CampaignTone,roles=(CAMPAIGN_PATTERNS as readonly string[]).includes(pattern)?(document.answer_first===true?fiveCampaignRoles(pattern,ROLE_MAP[pattern]):ROLE_MAP[pattern]):[];
 const slides=Array.isArray(document?.slides)?document.slides:[];
 for(const issue of answerFirstIssues(document,language))add(issue);
 if(document?.design_preset!==CAMPAIGN_PRESET||document?.campaign_version!==CAMPAIGN_VERSION||document?.post_type!=='prelaunch'||document?.schema_version!==2)add('오픈 전 캠페인 버전 또는 렌더 프리셋이 맞지 않습니다.');
 if(!(CAMPAIGN_PATTERNS as readonly string[]).includes(pattern))add('허용되지 않은 오픈 전 캠페인 패턴입니다.');
 if(!(CAMPAIGN_TONES as readonly string[]).includes(tone))add('허용되지 않은 캠페인 톤입니다.');
 if(slides.length!==roles.length)add('캠페인 패턴에 맞는 카드 수가 필요합니다.');
 slides.forEach((slide:CampaignRow,index:number)=>{
  if(slide?.role!==roles[index])add('캠페인 카드 역할과 순서가 맞지 않습니다.');
  const title=clean(slide?.title),body=clean(slide?.body),secondary=clean(slide?.secondary_body),direction=clean(slide?.visual_direction);
  const titleLimit=language==='en'?45:24,bodyLimit=language==='en'?80:42,secondaryLimit=language==='en'?42:80;
  if(!title||title.length>titleLimit)add('오픈 전 홍보 카드 제목이 너무 길거나 비어 있습니다.');
  if(body.length>bodyLimit||secondary.length>secondaryLimit)add('오픈 전 홍보 서브카피가 너무 깁니다.');
  if(title.split('\n').length>3||body.split(/\n\s*\n/).length>1)add('오픈 전 홍보 카드는 짧은 헤드라인과 한 줄 중심의 서브카피만 사용하세요.');
  if(Boolean(body)!==Boolean(secondary))add('서브카피가 있는 카드에는 한국어와 영어 대응 문장이 모두 필요합니다.');
  if(!direction||direction.length>180)add('각 카드에 간결한 사진 비주얼 지시문이 필요합니다.');
  if(Array.isArray(slide?.source_ids)&&slide.source_ids.length)add('오픈 전 홍보 카드에는 검색 출처를 붙이지 않습니다.');
  if(pattern==='how_it_works'&&slide.role==='step'&&![1,2,3].includes(Number(slide.step_number)))add('이용 방법 카드의 단계 번호가 맞지 않습니다.');
  if(pattern!=='how_it_works'&&Number(slide?.step_number||0)!==0)add('단계형이 아닌 캠페인에는 단계 번호를 사용하지 않습니다.');
 });
 for(let i=0;i<slides.length;i++)for(let j=i+1;j<slides.length;j++)if(similarity(slides[i]?.title,slides[j]?.title)>=.8)add('캠페인 카드 헤드라인이 중복되거나 지나치게 유사합니다.');
 const hook=clean(slides[0]?.title);if(hook&&recentHooks.some(old=>similarity(hook,old)>=.72))add('최근 오픈 전 홍보와 훅이 지나치게 유사합니다.');
 for(const issue of captionCoreIssues(document?.caption_ko,'ko'))add(issue);
 for(const issue of captionCoreIssues(document?.caption_en,'en'))add(issue);
 const all=[document?.caption_ko,document?.caption_en,...slides.flatMap((s:CampaignRow)=>[s?.title,s?.body,s?.secondary_body])].map(clean).join(' ');
 if(/특별한\s*인연|운명적인\s*만남|소중한\s*인연|진정한\s*인연|meaningful\s+connection|find\s+your\s+person|unforgettable\s+(?:night|moment)/i.test(all))add('오픈 전 홍보에서 전형적인 소개팅 광고 클리셰를 사용하지 마세요.');
 if(/\b(?:qualified|screened|vetted|elite|high[- ]caliber|high[- ]status)\b|검증된\s*사람|선별된|엄선된|엘리트|고스펙|고소득/i.test(all))add('확인되지 않은 참가자 선별 또는 스펙 표현을 사용할 수 없습니다.');
 if(/\d+(?:\.\d+)?\s*%|연구에\s*따르면|연구\s*결과|과학적으로|study\s+shows|research\s+shows|scientifically\s+proven|currently\s+trending/i.test(all))add('오픈 전 홍보에는 검색하지 않은 연구, 통계 또는 유행 주장을 넣지 않습니다.');
 if(/\d[\d,]*\s*(?:원|명|석)|book\s+now|tickets?\s+available|신청\s*마감|매진\s*임박|얼리버드/i.test(all))add('오픈 전 홍보에 확인되지 않은 가격, 인원, 좌석 또는 모집 정보를 넣지 않습니다.');
 if(!launchDate&&/(?:^|\s)D-\d+|\d{1,2}\s*월\s*\d{1,2}\s*일|tomorrow|today|내일|오늘\s*오픈/i.test(all))add('런칭 날짜가 없을 때 구체적인 카운트다운이나 오픈 날짜를 만들 수 없습니다.');
 if(pattern==='countdown'&&!launchDate)add('카운트다운 패턴에는 확인된 런칭 날짜가 필요합니다.');
 if(language!=='en'&&all.includes('·'))add('한국어 오픈 전 홍보 문구에는 가운데점을 사용하지 않습니다.');
 const caption=buildCampaignCaption(document);if(caption.length>900)add('오픈 전 홍보 캡션은 최종 900자 이하로 작성해야 합니다.');
 return {version:2,status:issues.length?'rejected':'passed',issues,review_required:true};
}
function prepareCampaign(document:CampaignRow,language:string,pattern:CampaignPattern,tone:CampaignTone,launchDate:string|null,draftDate:string,recentHooks:string[],answerFirst=false){
 const normalized=applyAnswerFirstDocument(normalizeCampaignDocument(document,language,pattern,tone,launchDate,draftDate,answerFirst),answerFirst);
 const report=evaluateCampaignDocument(normalized,language,recentHooks,launchDate);
 return {document:normalized,report,slides:normalized.slides,caption:buildCampaignCaption(normalized),cta:normalized.cta,sources:[]};
}
export function campaignDraftQuality(draft:CampaignRow){
 const document=draft?.content_document;
 if(!document||document.design_preset!==CAMPAIGN_PRESET)return {version:2,status:'rejected' as const,issues:['오픈 전 캠페인 콘텐츠 구조가 없습니다.'],review_required:true};
 const report=evaluateCampaignDocument(document,draft.content_language==='en'?'en':'ko',[],validDate(draft.launch_date||document.launch_date));
 const savedCaption=clean(draft.caption),savedCta=clean(draft.cta);
 if(!savedCaption||savedCaption.length>900)report.issues.push('오픈 전 홍보의 저장된 캡션은 1~900자여야 합니다.');
 if(savedCaption&&(!savedCaption.includes(ROUNDY_IDENTITY.instagram)||!savedCaption.includes(ROUNDY_IDENTITY.website)))report.issues.push('오픈 전 홍보 캡션에는 Roundy 공식 계정과 웹사이트가 필요합니다.');
 if(!savedCta||savedCta.length>70)report.issues.push('CTA 안내 문구를 확인하세요.');
 if(report.issues.length)report.status='rejected';
 return report;
}
export async function generateCampaignCopy(db:any,draft:CampaignRow,input:CampaignRow,job:CampaignRow,call:Call){
 const language=input.language==='en'?'en':'ko',answerFirst=input.answer_first_enabled===true,history=await recentCampaignHistory(db),launchDate=validDate(input.launch_date||draft.launch_date);
 const requested=input.campaign_pattern||draft.campaign_pattern||'auto',tone=((CAMPAIGN_TONES as readonly string[]).includes(String(input.campaign_tone||draft.campaign_tone))?String(input.campaign_tone||draft.campaign_tone):'modern_premium') as CampaignTone;
 const pattern=choosePattern(requested,history,launchDate,String(draft.id)+':'+String(draft.draft_date)+':'+String(input.instruction||'')),recentHooks=history.slice(0,10).map(x=>x.hook).filter(Boolean);
 const schema=campaignSchema(pattern,tone,language,answerFirst),goal=GOAL_MAP[pattern],countdown=pattern==='countdown'&&launchDate?countdownLabel(launchDate,String(draft.draft_date||''),language):null;
 let inputTokens=0,outputTokens=0;
 const record=async(result:CampaignRow)=>{inputTokens+=Number(result.usage?.input_tokens||result.usage?.prompt_tokens||0);outputTokens+=Number(result.usage?.output_tokens||result.usage?.completion_tokens||0);ok(await db.from('marketing_generation_jobs').update({input_tokens:inputTokens,output_tokens:outputTokens}).eq('id',job.id));};
 const write=async(repair?:{document:CampaignRow;issues:string[]})=>{
  const instructions=campaignInstructions(pattern,tone,language,launchDate,answerFirst)+(repair?'\nREPAIR PASS: Fix ONLY the listed issues. Keep the same campaign pattern, tone and product truths. Return the full corrected JSON.':'');
  const payload={
   campaign_pattern:pattern,
   campaign_tone:tone,
   campaign_goal:goal,
   language,
   launch_date:launchDate,
   countdown_label:countdown,
   recent_patterns:history.slice(0,5).map(x=>x.pattern),
   recent_hooks:recentHooks,
   direction:clean(input.instruction).slice(0,500),
   ...(repair?{original_document:repair.document,quality_issues:repair.issues}:{}),
  };
  if(Buffer.byteLength(instructions+JSON.stringify(payload)+JSON.stringify(schema),'utf8')>28000)throw new Error('PROMPT_SIZE_LIMIT');
  ok(await db.from('marketing_generation_jobs').update({stage:repair?'repairing_copy':'writing'}).eq('id',job.id));
  const result=await call('chat/completions',{model:MODEL,reasoning_effort:'none',max_completion_tokens:2800,response_format:{type:'json_schema',json_schema:{name:'roundy_prelaunch_campaign_v1',strict:true,schema}},messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(payload)}]},55000);
  await record(result);return {...parseDocument(result),result};
 };
 let written=await write(),prepared=prepareCampaign(written.document,language,pattern,tone,launchDate,String(draft.draft_date||''),recentHooks,answerFirst),repairUsed=false;
 if(prepared.report.status!=='passed'){
  repairUsed=true;written=await write({document:prepared.document,issues:prepared.report.issues});prepared=prepareCampaign(written.document,language,pattern,tone,launchDate,String(draft.draft_date||''),recentHooks,answerFirst);
 }
 const recovery={requested_type:'prelaunch',effective_type:'prelaunch',fallback_reason:null,repair_used:repairUsed,campaign_pattern:pattern,campaign_tone:tone};
 const quality={...prepared.report,recovery};
 const patch={
  caption:prepared.caption,
  cta:prepared.cta,
  content_document:{...prepared.document,generation_recovery:recovery},
  quality_report:quality,
  carousel_slides:prepared.slides,
  research_sources:[],
  research_status:'not_required',
  content_language:language,
  draft_kind:'brand',
  growth_topic_type:null,
  content_mode:'prelaunch',
  content_pillar:'concept',
  generation_reason:'오픈 전 홍보 / campaign '+pattern+' / '+CAMPAIGN_VERSION,
  event_id:null,
  trend_id:null,
  destination_url:'https://roundy.team',
  render_style:'campaign',
  campaign_pattern:pattern,
  campaign_tone:tone,
  campaign_version:CAMPAIGN_VERSION,
  launch_date:launchDate,
 };
 ok(await db.from('marketing_generation_jobs').update({quality_report:quality,result_snapshot:{...patch,draft_id:draft.id,images:[],saved_at:new Date().toISOString(),generation_recovery:recovery}}).eq('id',job.id));
 if(prepared.report.status!=='passed')throw new Error('품질 검토 필요: '+prepared.report.issues.join(' '));
 return patch;
}
