import 'server-only';
import {createHash} from 'node:crypto';
import {EVENT_CAMPAIGN_PRESET,ROUNDY_IDENTITY,captionAction,captionCoreIssues,curateHashtags,normalizeCaptionCore} from './marketing-presentation';
import {eventStatus} from './event-status';

export type EventCampaignRow=Record<string,any>;
type Call=(endpoint:string,body:EventCampaignRow,timeout:number)=>Promise<EventCampaignRow>;

export const EVENT_CAMPAIGN_VERSION='live_event_campaign_v1';
export const EVENT_CAMPAIGN_STAGES=['launch','experience','venue','participants','momentum','imminent','last_call'] as const;
export const EVENT_CAMPAIGN_PATTERNS=['event_poster','experience','social_proof','offer','last_call'] as const;
export type EventCampaignStage=typeof EVENT_CAMPAIGN_STAGES[number];
export type EventCampaignPattern=typeof EVENT_CAMPAIGN_PATTERNS[number];

const MODEL='gpt-6-luna';
const STAGE_PATTERN:Record<EventCampaignStage,EventCampaignPattern>={
 launch:'event_poster',
 experience:'experience',
 venue:'event_poster',
 participants:'social_proof',
 momentum:'offer',
 imminent:'offer',
 last_call:'last_call',
};
const PATTERN_ROLES:Record<EventCampaignPattern,string[]>={
 event_poster:['hook','facts','cta'],
 experience:['hook','step','step','step','cta'],
 social_proof:['hook','participants','experience','cta'],
 offer:['hook','offer','facts','cta'],
 last_call:['hook','status','facts','cta'],
};
const STAGE_SCORE:Record<EventCampaignStage,number>={
 launch:25,experience:20,venue:18,participants:45,momentum:70,imminent:90,last_call:100,
};
const ok=(r:any)=>{if(r.error)throw r.error;return r.data;};
const clean=(v:unknown)=>typeof v==='string'?v.replace(/\r\n?/g,'\n').trim():'';
const money=(value:number,language:string)=>language==='en'?'₩'+Math.max(0,Math.round(value)).toLocaleString('en-US'):Math.max(0,Math.round(value)).toLocaleString('ko-KR')+'원';
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function jobGroupLabel(value:string,language:string){
 const labels:Record<string,[string,string]>={
  developer:['Tech / Developer','개발 / 테크'],
  medical:['Medical','의료'],
  finance:['Finance','금융'],
  public:['Public sector','공공'],
  large_company:['Large company','대기업'],
  professional:['Professional','전문직'],
  education:['Education','교육'],
  creative:['Creative','크리에이티브'],
  student:['Student','학생'],
  self_employed:['Founder / Self-employed','창업 / 자영업'],
  business:['Business / Marketing','비즈니스 / 마케팅'],
  office:['Office / Corporate','회사원'],
 };
 return (labels[value]||[value,value])[language==='en'?0:1];
}
function ageBandLabel(value:string,language:string){
 const match=/^(20|30|40|50)_(early|mid|late)$/.exec(value);
 if(!match)return '';
 const [,decade,band]=match;
 const ko:Record<string,string>={early:'초반',mid:'중반',late:'후반'};
 const en:Record<string,string>={early:'early',mid:'mid',late:'late'};
 return language==='en'?en[band]+' '+decade+'s':decade+'대 '+ko[band];
}
function eventLanguageLabel(value:string,language:string){
 if(value==='ko')return language==='en'?'Korean only':'한국어만';
 if(value==='en')return language==='en'?'English only':'영어만';
 return language==='en'?'Korean or English':'한국어 또는 영어';
}
function formatEventDate(value:string,language:string){
 const date=new Date(value);
 return date.toLocaleString(language==='en'?'en-GB':'ko-KR',{
  timeZone:'Asia/Seoul',month:'short',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false
 })+' KST';
}
function aggregateRoster(roster:EventCampaignRow,language:string){
 const entries=[...(Array.isArray(roster?.women)?roster.women:[]),...(Array.isArray(roster?.men)?roster.men:[])];
 const count=(key:string)=>{
  const map=new Map<string,number>();
  for(const row of entries){const value=clean(row?.[key]);if(value)map.set(value,(map.get(value)||0)+1);}
  return [...map.entries()].filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]).slice(0,3);
 };
 const ages=count('age_band').map(([v])=>ageBandLabel(v,language)).filter(Boolean);
 const jobs=count('job_group').map(([v])=>jobGroupLabel(v,language)).filter(Boolean);
 const total=Number(roster?.total||0),women=Number(roster?.women_count||0),men=Number(roster?.men_count||0);
 return {
  total,women_count:women,men_count:men,
  age_groups:ages,job_groups:jobs,
  participant_copy:[
   ages.length?(language==='en'?'Age mix: ':'연령대: ')+ages.join(', '):'',
   jobs.length?(language==='en'?'Fields: ':'직업군: ')+jobs.join(', '):'',
  ].filter(Boolean).join('\n')
 };
}
function publicOffers(event:EventCampaignRow,roster:EventCampaignRow,now=Date.now()){
 const start=Date.parse(event.starts_at),hours=(start-now)/3600000;
 const women=Number(roster?.women_count||0),men=Number(roster?.men_count||0);
 const lockdownHours=Number(event.lockdown_minutes??4320)/60;
 const timeKind=hours>=240?'early_bird':hours<=72?'last_minute':null;
 const timeRate=timeKind?10:0;
 const balanceEligible=hours<=lockdownHours;
 const ladiesBalance=balanceEligible&&men-women>1?10:0;
 const gentsBalance=balanceEligible&&women-men>1?10:0;
 const quote=(base:number,balance:number)=>{
  const time=Math.round(base*timeRate/100),gender=Math.round(base*balance/100);
  return {base,time_discount_percent:timeRate,gender_discount_percent:balance,final:Math.max(0,base-time-gender)};
 };
 return {
  hours_until_event:hours,
  time_kind:timeKind,
  ladies:quote(Number(event.price_ladies||0),ladiesBalance),
  gents:quote(Number(event.price_gents||0),gentsBalance),
  active:Boolean(timeKind||ladiesBalance||gentsBalance),
 };
}
function statusSnapshot(event:EventCampaignRow,roster:EventCampaignRow,now=Date.now()){
 const counts={total:Number(roster?.total||0),women_count:Number(roster?.women_count||0),men_count:Number(roster?.men_count||0)};
 const status=eventStatus({
  starts_at:String(event.starts_at||''),
  ends_at:String(event.ends_at||event.starts_at||''),
  capacity:Number(event.capacity||0),
  seats_remaining:Number(event.seats_remaining||0),
  status:String(event.status||''),
  lockdown_minutes:Number(event.lockdown_minutes??4320),
  early_bird_hours:Number(event.early_bird_hours??240),
  last_minute_hours:Number(event.last_minute_hours??72)
 },counts,now),capacity=Math.max(1,Number(event.capacity||1)),seats=Math.max(0,Number(event.seats_remaining||0));
 const occupancy=Math.min(1,Math.max(0,(capacity-seats)/capacity)),start=Date.parse(event.starts_at),hours=(start-now)/3600000;
 const ladiesCapacity=Math.floor(capacity/2),gentsCapacity=capacity-ladiesCapacity;
 return {
  kind:status.kind,
  hours_until_event:hours,
  occupancy,
  seats_remaining:seats,
  exact_seats:seats<=3?seats:null,
  ladies_remaining:Math.max(0,ladiesCapacity-counts.women_count),
  gents_remaining:Math.max(0,gentsCapacity-counts.men_count),
  almost_full:occupancy>.7,
 };
}
export async function loadEventCampaignFacts(db:any,eventId:string){
 if(!uuid(eventId))throw new Error('INVALID_EVENT_ID');
 const event=ok(await db.from('events').select('id,slug,title,title_ko,description,description_ko,starts_at,ends_at,venue,venue_description,neighborhood,age_min,age_max,capacity,seats_remaining,images,price_gents,price_ladies,lockdown_minutes,early_bird_hours,last_minute_hours,event_language,participant_disclosures,status,deleted_at,marketing_enabled,created_at,updated_at').eq('id',eventId).maybeSingle());
 if(!event||event.deleted_at||event.status!=='live'||Date.parse(event.starts_at)<=Date.now())throw new Error('EVENT_NOT_MARKETABLE');
 if(event.marketing_enabled===false||/^\s*\((?:test|테스트)\)/i.test(String(event.title||event.title_ko||'')))throw new Error('EVENT_MARKETING_DISABLED');
 const roster=ok(await db.rpc('event_public_roster',{p_event:event.id}))||{women:[],men:[],women_count:0,men_count:0,total:0};
 const status=statusSnapshot(event,roster),offers=publicOffers(event,roster),rosterKo=aggregateRoster(roster,'ko'),rosterEn=aggregateRoster(roster,'en');
 const images=Array.isArray(event.images)?event.images.filter((x:unknown)=>typeof x==='string'&&x.startsWith('https://')).slice(0,10):[];
 return {
  id:event.id,slug:event.slug,title_en:event.title,title_ko:event.title_ko||event.title,
  description_en:event.description||'',description_ko:event.description_ko||'',
  starts_at:event.starts_at,venue:event.venue,venue_description:event.venue_description||'',neighborhood:event.neighborhood,
  age_min:event.age_min,age_max:event.age_max,capacity:event.capacity,seats_remaining:event.seats_remaining,
  price_gents:event.price_gents,price_ladies:event.price_ladies,event_language:event.event_language||'either',
  participant_disclosures:event.participant_disclosures||{},images,status,offers,
  roster:{total:Number(roster.total||0),women_count:Number(roster.women_count||0),men_count:Number(roster.men_count||0),ko:rosterKo,en:rosterEn},
  event_url:'https://roundy.team/events/'+event.slug,
 };
}
function allowedStages(facts:EventCampaignRow,used:Set<string>,historyCount:number,lastGeneratedAt:string|null){
 const hours=Number(facts.status.hours_until_event),candidates:EventCampaignStage[]=[];
 const cooldown=lastGeneratedAt?Date.now()-Date.parse(lastGeneratedAt):Infinity;
 const earlyPosts=historyCount<3;
 if(hours>72&&earlyPosts&&cooldown>=36*3600000){
  if(!used.has('launch'))candidates.push('launch');
  else if(!used.has('experience'))candidates.push('experience');
  else if(!used.has('venue')&&(facts.images.length>0||clean(facts.venue_description)))candidates.push('venue');
  if(!used.has('participants')&&Number(facts.roster.total)>=4)candidates.push('participants');
  if(!used.has('momentum')&&(facts.status.occupancy>=.7||facts.offers.active))candidates.push('momentum');
 }
 if(hours<=72&&hours>24&&!used.has('imminent'))candidates.push('imminent');
 if((hours<=24||Number(facts.status.seats_remaining)<=3)&&!used.has('last_call'))candidates.push('last_call');
 return [...new Set(candidates)];
}
export async function selectAutomaticEventCampaign(db:any,maxPosts=5){
 const events=ok(await db.from('events').select('id,starts_at,seats_remaining,capacity,updated_at,title,title_ko,marketing_enabled').eq('status','live').is('deleted_at',null).eq('marketing_enabled',true).gt('starts_at',new Date().toISOString()).order('starts_at').limit(20))||[];
 let best:EventCampaignRow|null=null;
 for(const event of events){
  if(/^\s*\((?:test|테스트)\)/i.test(String(event.title||event.title_ko||'')))continue;
  const history=ok(await db.from('marketing_event_campaign_history').select('stage,pattern,generated_at,status').eq('event_id',event.id).eq('status','generated').order('generated_at',{ascending:false}).limit(10))||[];
  if(history.length>=maxPosts)continue;
  const facts=await loadEventCampaignFacts(db,event.id),used=new Set(history.map((row:EventCampaignRow)=>String(row.stage))),last=history[0]?.generated_at||null;
  const stages=allowedStages(facts,used,history.length,last);
  for(const stage of stages){
   const recencyPenalty=Math.min(30,history.length*6),score=STAGE_SCORE[stage]+Math.round(Number(facts.status.occupancy)*30)-recencyPenalty;
   const candidate={event_id:event.id,stage,pattern:STAGE_PATTERN[stage],score,facts};
   if(!best||candidate.score>best.score)best=candidate;
  }
 }
 return best;
}
function serverFactCopy(role:string,facts:EventCampaignRow,stage:EventCampaignStage,language:string){
 const ko=language!=='en',eventTitle=ko?facts.title_ko:facts.title_en,date=formatEventDate(facts.starts_at,language);
 if(role==='facts'){
  const price=ko
   ?'Ladies '+money(facts.price_ladies,'ko')+' / Gents '+money(facts.price_gents,'ko')
   :'Ladies '+money(facts.price_ladies,'en')+' / Gents '+money(facts.price_gents,'en');
  return {title:eventTitle,body:[date,facts.venue,price,eventLanguageLabel(facts.event_language,language)].filter(Boolean).join('\n')};
 }
 if(role==='participants'){
  const roster=ko?facts.roster.ko:facts.roster.en;
  const count=Number(facts.roster.total||0);
  return {title:ko?'현재 참가자 구성':'Who’s joining',body:[count>=4?(ko?count+'명 신청 중':count+' registered'):'',roster.participant_copy].filter(Boolean).join('\n')};
 }
 if(role==='offer'){
  const o=facts.offers,lines:string[]=[];
  if(o.time_kind==='early_bird')lines.push(ko?'얼리버드 10% 적용 중':'Early Bird 10% active');
  if(o.time_kind==='last_minute')lines.push(ko?'임박 할인 10% 적용 중':'Last-minute 10% active');
  if(o.ladies.gender_discount_percent)lines.push(ko?'Ladies 성비 할인 10%':'Ladies balance offer 10%');
  if(o.gents.gender_discount_percent)lines.push(ko?'Gents 성비 할인 10%':'Gents balance offer 10%');
  if(o.active){
   lines.push('Ladies '+money(o.ladies.final,language));
   lines.push('Gents '+money(o.gents.final,language));
  }else lines.push(ko?'현재 기본 참가비 적용':'Standard pricing currently applies');
  return {title:ko?'지금 참가 혜택':'Current offer',body:lines.join('\n')};
 }
 if(role==='status'){
  const s=facts.status,hours=Number(s.hours_until_event),days=Math.max(0,Math.ceil(hours/24));
  let headline=ko?'이번 모임 마감 전':'Before this meetup closes';
  if(s.exact_seats!=null)headline=ko?'남은 자리 '+s.exact_seats+'석':s.exact_seats+' spots left';
  else if(s.almost_full)headline=ko?'Almost Full':'Almost Full';
  else if(hours<=24)headline=ko?'D-1':'D-1';
  else if(hours<=72)headline='D-'+days;
  return {title:headline,body:[date,facts.venue].join('\n')};
 }
 return null;
}
function ctaCopy(stage:EventCampaignStage,language:string){
 const ko=language!=='en';
 if(stage==='last_call'||stage==='imminent')return ko?'이번 모임 참가하기':'Join this meetup';
 if(stage==='momentum')return ko?'남은 자리 확인하기':'Check remaining spots';
 return ko?'자리 확인하기':'Check spots';
}
function schema(pattern:EventCampaignPattern,stage:EventCampaignStage,language:string){
 const roles=PATTERN_ROLES[pattern],titleMax=language==='en'?48:26,bodyMax=language==='en'?90:48;
 const str=(maxLength:number,minLength=0)=>({type:'string',minLength,maxLength});
 return {
  type:'object',additionalProperties:false,
  properties:{
   schema_version:{type:'integer',enum:[1]},
   campaign_version:{type:'string',enum:[EVENT_CAMPAIGN_VERSION]},
   design_preset:{type:'string',enum:[EVENT_CAMPAIGN_PRESET]},
   post_type:{type:'string',enum:['live_event']},
   event_campaign_stage:{type:'string',enum:[stage]},
   event_campaign_pattern:{type:'string',enum:[pattern]},
   caption_ko:str(420,1),caption_en:str(520,1),
   slides:{type:'array',minItems:roles.length,maxItems:roles.length,items:{
    type:'object',additionalProperties:false,
    properties:{role:{type:'string',enum:[...new Set(roles)]},eyebrow:str(24),title:str(titleMax,1),body:str(bodyMax),secondary_body:str(language==='en'?48:90),visual_direction:str(180,8),step_number:{type:'integer',minimum:0,maximum:3},source_ids:{type:'array',maxItems:0,items:{type:'string'}}},
    required:['role','eyebrow','title','body','secondary_body','visual_direction','step_number','source_ids']
   }}
  },
  required:['schema_version','campaign_version','design_preset','post_type','event_campaign_stage','event_campaign_pattern','caption_ko','caption_en','slides']
 };
}
function instructions(stage:EventCampaignStage,pattern:EventCampaignPattern,language:string){
 return [
  'Create a conversion-focused Instagram campaign for ONE real Roundy event using only the supplied server facts.',
  'This is an EVENT CAMPAIGN, not editorial magazine content and not a generic brand teaser.',
  'Stage: '+stage+'. Pattern: '+pattern+'. Exact card roles: '+PATTERN_ROLES[pattern].join(' -> ')+'.',
  'One message per card. Keep copy short, direct and visual-first. No paragraphs on cards.',
  'Never invent dates, venue details, prices, discounts, seats, attendee demographics, popularity, reviews, testimonials, scarcity, sell-out speed, safety guarantees, or participant identities.',
  'Dynamic roles named facts, participants, offer, and status are overwritten by the server. For those roles write neutral placeholders only and never add additional facts.',
  'Use urgency only when present in supplied server status. Never write Hurry, selling fast, last chance, or similar unsupported pressure language.',
  'Participants content may use only the supplied privacy-safe aggregate summary. Never infer gender, profession, age, nationality, height, smoking status, or identity beyond it.',
  'Experience cards explain the actual Roundy flow: arrive, meet one-on-one, rotate between conversations, choose privately, match only when mutual.',
  'The event CTA goes to the supplied event URL. Do not invent a waitlist or alternate purchase flow.',
  'caption_ko and caption_en must be equivalent concise Instagram caption cores with 2-4 short paragraphs. No handles, URLs, hashtags, or source labels; the server appends the CTA/footer.',
  'Event photography should prefer the supplied real event/venue images. visual_direction is only a fallback brief when AI photography is needed. It must request a clean text-free photograph with no logos, signs, or watermarks.',
  language==='en'?'Primary card title/body are English; secondary_body is faithful Korean.':'Primary card title/body are Korean; secondary_body is faithful English.',
  'Do not use the Korean middle dot character.',
 ].join('\n');
}
function parse(result:EventCampaignRow){
 const raw=result.choices?.[0]?.message?.content;
 if(result.choices?.[0]?.finish_reason!=='stop'||typeof raw!=='string')throw new Error('EVENT_CAMPAIGN_RESPONSE_INCOMPLETE');
 try{return {document:JSON.parse(raw) as EventCampaignRow,raw};}catch{throw new Error('AI_RETURNED_INVALID_JSON');}
}
function buildCaption(doc:EventCampaignRow,stage:EventCampaignStage,facts:EventCampaignRow){
 const ko=[clean(doc.caption_ko),ctaCopy(stage,'ko')+' → '+facts.event_url].filter(Boolean).join('\n\n');
 const en=[clean(doc.caption_en),ctaCopy(stage,'en')+' → '+facts.event_url].filter(Boolean).join('\n\n');
 return [ko,en,ROUNDY_IDENTITY.instagram+' | '+ROUNDY_IDENTITY.website,curateHashtags('live_event',[],doc).join(' ')].filter(Boolean).join('\n\n');
}
function normalize(raw:EventCampaignRow,language:string,stage:EventCampaignStage,pattern:EventCampaignPattern,facts:EventCampaignRow){
 const ko=language!=='en',roles=PATTERN_ROLES[pattern],slides=roles.map((role,index)=>{
  const source=raw.slides?.[index]||{},server=serverFactCopy(role,facts,stage,language),main=server?.body??clean(source.body),secondary=server?serverFactCopy(role,facts,stage,language==='en'?'ko':'en')?.body||'':clean(source.secondary_body);
  const title=server?.title??clean(source.title),step=pattern==='experience'&&role==='step'?roles.slice(0,index+1).filter(x=>x==='step').length:0;
  return {role,eyebrow:clean(source.eyebrow),title,body:main,secondary_body:secondary,body_ko:ko?main:secondary,body_en:ko?secondary:main,visual_direction:clean(source.visual_direction),step_number:step,source_ids:[],variant:role==='hook'?'hook':role==='cta'?'roundy':role,...(role==='cta'?{instagram:ROUNDY_IDENTITY.instagram,website:ROUNDY_IDENTITY.website}:{})};
 });
 const caption_ko=normalizeCaptionCore(raw.caption_ko,'ko'),caption_en=normalizeCaptionCore(raw.caption_en,'en');
 const doc={...raw,schema_version:1,campaign_version:EVENT_CAMPAIGN_VERSION,design_preset:EVENT_CAMPAIGN_PRESET,post_type:'live_event',event_campaign_stage:resolvedStage,event_campaign_pattern:pattern,event_id:facts.id,event_facts:facts,content_language:language,caption_ko,caption_en,caption:ko?caption_ko:caption_en,cta:ctaCopy(resolvedStage,language),slides,hashtags:curateHashtags('live_event',[],raw)};
 return doc;
}
export function evaluateEventCampaign(document:EventCampaignRow,language:string){
 const issues:string[]=[],add=(x:string)=>{if(!issues.includes(x))issues.push(x);};
 const stage=document?.event_campaign_stage as EventCampaignStage,pattern=document?.event_campaign_pattern as EventCampaignPattern,roles=PATTERN_ROLES[pattern]||[],slides=Array.isArray(document?.slides)?document.slides:[];
 if(document?.design_preset!==EVENT_CAMPAIGN_PRESET||document?.campaign_version!==EVENT_CAMPAIGN_VERSION||document?.post_type!=='live_event')add('이벤트 캠페인 버전 또는 렌더 프리셋이 맞지 않습니다.');
 if(!(EVENT_CAMPAIGN_STAGES as readonly string[]).includes(stage)||!(EVENT_CAMPAIGN_PATTERNS as readonly string[]).includes(pattern))add('이벤트 캠페인 단계 또는 패턴이 올바르지 않습니다.');
 if(slides.length!==roles.length)add('이벤트 캠페인 카드 수가 패턴과 맞지 않습니다.');
 slides.forEach((slide:EventCampaignRow,index:number)=>{
  if(slide.role!==roles[index])add('이벤트 캠페인 카드 역할과 순서가 맞지 않습니다.');
  if(!clean(slide.title))add('이벤트 캠페인 카드 제목이 비어 있습니다.');
  if(clean(slide.title).length>(language==='en'?64:34)||clean(slide.body).length>(language==='en'?170:120))add('이벤트 캠페인 카드 문구가 너무 깁니다.');
  if(!clean(slide.visual_direction)&&!['facts','participants','offer','status','cta'].includes(slide.role))add('이벤트 캠페인 비주얼 지시문이 필요합니다.');
 });
 for(const issue of captionCoreIssues(document.caption_ko,'ko'))add(issue);
 for(const issue of captionCoreIssues(document.caption_en,'en'))add(issue);
 const facts=document.event_facts||{},all=[document.caption_ko,document.caption_en,...slides.flatMap((s:EventCampaignRow)=>[s.title,s.body,s.secondary_body])].map(clean).join(' ');
 if(/hurry|selling\s+fast|last\s+chance|매진\s*임박|서두르|마지막\s*기회/i.test(all)&&stage!=='last_call')add('서버 상태가 허용하지 않은 긴급성 표현이 있습니다.');
 if(/\b(?:qualified|screened|vetted|elite)\b|검증된\s*사람|선별된|엘리트/i.test(all))add('확인되지 않은 참가자 선별 표현을 사용할 수 없습니다.');
 if(language!=='en'&&all.includes('·'))add('한국어 이벤트 홍보 문구에는 가운데점을 사용하지 않습니다.');
 if(!facts?.id||!facts?.event_url||!Array.isArray(facts?.images))add('이벤트 서버 사실 스냅샷이 없습니다.');
 const caption=buildCaption(document,resolvedStage,facts);if(caption.length>1100)add('이벤트 홍보 캡션은 최종 1,100자 이하로 작성해야 합니다.');
 return {version:1,status:issues.length?'rejected':'passed',issues,review_required:true};
}
export function eventCampaignDraftQuality(draft:EventCampaignRow){
 const doc=draft?.content_document;
 if(!doc||doc.design_preset!==EVENT_CAMPAIGN_PRESET)return {version:1,status:'rejected' as const,issues:['이벤트 캠페인 콘텐츠 구조가 없습니다.'],review_required:true};
 const report=evaluateEventCampaign(doc,draft.content_language==='en'?'en':'ko');
 if(!clean(draft.caption)||clean(draft.caption).length>1100)report.issues.push('저장된 이벤트 캡션을 확인하세요.');
 if(!clean(draft.cta)||clean(draft.cta).length>70)report.issues.push('저장된 이벤트 CTA를 확인하세요.');
 if(report.issues.length)report.status='rejected';
 return report;
}
export async function generateEventCampaignCopy(db:any,draft:EventCampaignRow,input:EventCampaignRow,job:EventCampaignRow,call:Call){
 const language=input.language==='en'?'en':'ko',eventId=String(input.event_id||draft.event_id||'');
 const facts=await loadEventCampaignFacts(db,eventId);
 let stage=String(input.event_campaign_stage||'auto') as EventCampaignStage|'auto';
 if(stage==='auto'){
  const history=ok(await db.from('marketing_event_campaign_history').select('stage,generated_at,status').eq('event_id',facts.id).eq('status','generated').order('generated_at',{ascending:false}).limit(10))||[];
  const allowed=allowedStages(facts,new Set(history.map((x:EventCampaignRow)=>String(x.stage))),history.length,history[0]?.generated_at||null);
  stage=allowed[0]||(
   Number(facts.status.hours_until_event)<=24?'last_call':
   Number(facts.status.hours_until_event)<=72?'imminent':
   Number(facts.status.occupancy)>=.7?'momentum':
   Number(facts.roster.total)>=4?'participants':
   'launch'
  );
 }
 if(!(EVENT_CAMPAIGN_STAGES as readonly string[]).includes(stage))throw new Error('INVALID_EVENT_CAMPAIGN_STAGE');
 const resolvedStage=stage as EventCampaignStage;
 const pattern=STAGE_PATTERN[resolvedStage],eventSchema=schema(pattern,resolvedStage,language);
 let inputTokens=0,outputTokens=0;
 const record=async(result:EventCampaignRow)=>{inputTokens+=Number(result.usage?.input_tokens||result.usage?.prompt_tokens||0);outputTokens+=Number(result.usage?.output_tokens||result.usage?.completion_tokens||0);ok(await db.from('marketing_generation_jobs').update({input_tokens:inputTokens,output_tokens:outputTokens}).eq('id',job.id));};
 const write=async(repair?:{document:EventCampaignRow;issues:string[]})=>{
  const payload={language,event_campaign_stage:resolvedStage,event_campaign_pattern:pattern,event_facts:facts,direction:clean(input.instruction).slice(0,500),...(repair?{original_document:repair.document,quality_issues:repair.issues}:{})};
  const system=instructions(resolvedStage,pattern,language)+(repair?'\nREPAIR PASS: Fix ONLY the listed quality issues. Do not alter server facts or invent new claims. Return complete corrected JSON.':'');
  if(Buffer.byteLength(system+JSON.stringify(payload)+JSON.stringify(eventSchema),'utf8')>30000)throw new Error('PROMPT_SIZE_LIMIT');
  ok(await db.from('marketing_generation_jobs').update({stage:repair?'repairing_copy':'writing'}).eq('id',job.id));
  const result=await call('chat/completions',{model:MODEL,reasoning_effort:'none',max_completion_tokens:3000,response_format:{type:'json_schema',json_schema:{name:'roundy_live_event_campaign_v1',strict:true,schema:eventSchema}},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(payload)}]},55000);
  await record(result);return parse(result);
 };
 let written=await write(),document=normalize(written.document,language,resolvedStage,pattern,facts),report=evaluateEventCampaign(document,language),repairUsed=false;
 if(report.status!=='passed'){repairUsed=true;written=await write({document,issues:report.issues});document=normalize(written.document,language,resolvedStage,pattern,facts);report=evaluateEventCampaign(document,language);}
 const recovery={requested_type:'live_event',effective_type:'live_event',fallback_reason:null,repair_used:repairUsed,event_campaign_stage:resolvedStage,event_campaign_pattern:pattern};
 const caption=buildCaption(document,stage,facts),quality={...report,recovery};
 const patch={
  caption,cta:ctaCopy(resolvedStage,language),content_document:{...document,generation_recovery:recovery},quality_report:quality,
  carousel_slides:document.slides,research_sources:[],research_status:'not_required',content_language:language,
  draft_kind:'brand',growth_topic_type:null,content_mode:'live_event',content_pillar:resolvedStage==='imminent'||resolvedStage==='last_call'?'urgency':'event',
  generation_reason:'이벤트 홍보 / '+resolvedStage+' / '+EVENT_CAMPAIGN_VERSION,event_id:facts.id,trend_id:null,destination_url:facts.event_url,
  render_style:'campaign',event_campaign_stage:resolvedStage,event_campaign_pattern:pattern,event_campaign_version:EVENT_CAMPAIGN_VERSION,event_facts_snapshot:facts,
 };
 ok(await db.from('marketing_generation_jobs').update({quality_report:quality,result_snapshot:{...patch,draft_id:draft.id,images:[],saved_at:new Date().toISOString(),generation_recovery:recovery}}).eq('id',job.id));
 if(report.status!=='passed')throw new Error('품질 검토 필요: '+report.issues.join(' '));
 return patch;
}
export async function createAutomaticEventDraft(db:any,opportunity:EventCampaignRow,language:'ko'|'en',recommendation:EventCampaignRow){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),recommended=String(recommendation?.recommended_time_kst||'21:00').slice(0,5);
 return ok(await db.from('instagram_post_drafts').insert({
  draft_date:today,draft_role:'candidate',status:'needs_approval',generation_source:'automation',visual_source:'auto_ai',
  content_language:language,content_mode:'live_event',draft_kind:'brand',growth_topic_type:null,trend_id:null,content_pillar:'event',
  caption:'',cta:ctaCopy(opportunity.stage,language),destination_url:opportunity.facts.event_url,images:[],carousel_slides:[],research_sources:[],research_status:'not_required',
  generation_reason:'Automatic event campaign workspace',event_id:opportunity.event_id,render_style:'campaign',
  event_campaign_stage:opportunity.stage,event_campaign_pattern:opportunity.pattern,event_campaign_version:EVENT_CAMPAIGN_VERSION,event_facts_snapshot:opportunity.facts,
  recommended_time_kst:recommended,window_start_kst:recommendation?.window_start_kst||'20:30',window_end_kst:recommendation?.window_end_kst||'21:30',
  scheduled_for:today+'T'+recommended+':00+09:00',revision:1,imported_at:null
 }).select('*').single());
}
export async function recordAutomaticEventCampaign(db:any,eventId:string,stage:string,pattern:string,jobId:string,draftId:string,facts:EventCampaignRow,language:string){
 const trigger=createHash('sha256').update(JSON.stringify({eventId,stage,kind:facts.status.kind,seats:facts.status.seats_remaining,occupancy:facts.status.occupancy,offer:facts.offers,roster:facts.roster.total})).digest('hex');
 return ok(await db.from('marketing_event_campaign_history').upsert({event_id:eventId,stage,pattern,content_language:language,generation_job_id:jobId,draft_id:draftId,trigger_key:trigger,trigger_snapshot:facts,status:'generated',generated_at:new Date().toISOString()},{onConflict:'event_id,stage'}).select('*').single());
}
