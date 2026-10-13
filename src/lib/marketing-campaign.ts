import { createHash } from 'node:crypto';
import 'server-only';
import { answerFirstIssues,applyAnswerFirstDocument,campaignRolesForCount,fiveCampaignRoles } from './marketing-answer-first';
import { mobileCarouselFit,savedCarouselPlan,type CarouselPlan } from './marketing-carousel-template';
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
function parseDocument(result:CampaignRow){
 const choice=result.choices?.[0],raw=choice?.message?.content;
 if(choice?.finish_reason!=='stop'||choice.message?.refusal||typeof raw!=='string')throw new Error('CAMPAIGN_RESPONSE_INCOMPLETE');
 try{return {document:JSON.parse(raw) as CampaignRow,raw};}catch{throw new Error('AI_RETURNED_INVALID_JSON');}
}
function normalizeCampaignDocument(raw:CampaignRow,language:string,pattern:CampaignPattern,tone:CampaignTone,launchDate:string|null,draftDate:string,answerFirst=false,plan:CarouselPlan|null=null){
 const ko=language!=='en',roles=plan?campaignRolesForCount(pattern,ROLE_MAP[pattern],plan.slide_count):answerFirst?fiveCampaignRoles(pattern,ROLE_MAP[pattern]):ROLE_MAP[pattern],inputSlides=Array.isArray(raw.slides)?raw.slides:[];
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
 const pattern=document?.campaign_pattern as CampaignPattern,tone=document?.campaign_tone as CampaignTone,plan=savedCarouselPlan(document),roles=(CAMPAIGN_PATTERNS as readonly string[]).includes(pattern)?(plan?campaignRolesForCount(pattern,ROLE_MAP[pattern],plan.slide_count):document.answer_first===true?fiveCampaignRoles(pattern,ROLE_MAP[pattern]):ROLE_MAP[pattern]):[];
 const slides=Array.isArray(document?.slides)?document.slides:[];
 for(const issue of answerFirstIssues(document,language))add(issue);
 if(plan)slides.forEach((slide:CampaignRow,index:number)=>{try{mobileCarouselFit(slide,plan,index,language);}catch(e){add(e instanceof Error?e.message:'CAROUSEL_TEXT_OVERFLOW');}});
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
function prepareCampaign(document:CampaignRow,language:string,pattern:CampaignPattern,tone:CampaignTone,launchDate:string|null,draftDate:string,recentHooks:string[],answerFirst=false,plan:CarouselPlan|null=null){
 const normalized=applyAnswerFirstDocument(normalizeCampaignDocument(document,language,pattern,tone,launchDate,draftDate,answerFirst,plan),answerFirst,plan);
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
