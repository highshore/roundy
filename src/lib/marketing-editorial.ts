import {buildMarketingResearchTask,RESEARCH_TASK_VERSION,type SeoulDatingFormat,type TrendResearchHistory,type DatingMythHistory} from './marketing-research-task';
import {applyAnswerFirstDocument} from './marketing-answer-first';
import {type CarouselPlan} from './marketing-carousel-template';
import {selectVerifiedMarketingBook,verifiedBookEvidence} from './marketing-book-catalog';
import {captionCtaIssues,isCompactDocument,bilingualCaptionIssues,CAMPAIGN_PRESET,EVENT_CAMPAIGN_PRESET} from './marketing-presentation';
import {campaignDraftQuality} from './marketing-campaign';
import {eventCampaignDraftQuality} from './marketing-event-campaign';
import {renderCompactEditorial,type EditorialAssets} from './marketing-visuals';
import {createHash} from 'node:crypto';
import {CONTENT_PROFILES,CONTENT_POLICY_VERSION,postType,contentSchema,researchInstructions,writingInstructions,extractResearchEvidence,prepareContent,evaluateContent,classifyQualityIssues,type PostType,type Evidence,type Row} from './marketing-content-policy';
import {trendEvidence} from './marketing-trend-radar';
import {readTrendFactPack,trendFactPackIssues,trendPackForModel,type TrendFactPack} from './marketing-trend-guide';

type Call=(endpoint:string,body:Row,timeout:number)=>Promise<Row>;
const ok=(r:any)=>{if(r.error)throw r.error;return r.data;};
const MODEL='gpt-6-luna';
const FALLBACK_TYPE:Partial<Record<PostType,PostType>>={trend_research:'conversation_prompt',dating_myth:'conversation_prompt',seoul_dating:'conversation_prompt',seoul_trend:'korea_life'};
function seoulDatingFormat(seed:string):SeoulDatingFormat{const value=createHash('sha256').update(seed).digest()[0]%10;return value<7?'places':'course';}
function isSeoulVenueFailure(issues:string[]){return issues.some(issue=>/서울 데이트 장소|서울 데이팅|실제 장소|가격\/영업시간|장소 추천 카드|검증 가능한 장소/.test(issue));}
type TrendHistoryItem={title:string;topic_key:string;created_at:string};
const trendNorm=(value:unknown)=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
async function loadTrendHistory(db:any):Promise<TrendHistoryItem[]>{
 const since180=new Date(Date.now()-180*86400000).toISOString();
 const rows=ok(await db.from('marketing_generation_jobs').select('created_at,result_snapshot,status').eq('status','completed').gte('created_at',since180).order('created_at',{ascending:false}).limit(100))||[];
 return (Array.isArray(rows)?rows:[]).flatMap((row:Row)=>{
  const snapshot=row?.result_snapshot,document=snapshot?.content_document,study=document?.study;
  if(snapshot?.growth_topic_type!=='trend_research'||!study?.title)return [];
  return [{title:String(study.title),topic_key:String(study.topic_key||''),created_at:String(row.created_at||snapshot.saved_at||'')}];
 });
}
function trendHistoryPrompt(items:TrendHistoryItem[]):TrendResearchHistory{
 const cutoff60=Date.now()-60*86400000;
 return {
  study_titles_180d:[...new Set(items.map(item=>item.title).filter(Boolean))],
  topic_keys_60d:[...new Set(items.filter(item=>Date.parse(item.created_at)>=cutoff60).map(item=>item.topic_key).filter(Boolean))]
 };
}
function trendRepeatReason(study:Row|undefined,items:TrendHistoryItem[]):string{
 if(!study?.title)return '';
 const title=trendNorm(study.title),topic=String(study.topic_key||''),cutoff60=Date.now()-60*86400000;
 if(items.some(item=>trendNorm(item.title)===title))return 'same_study_within_180d';
 if(topic&&items.some(item=>item.topic_key===topic&&Date.parse(item.created_at)>=cutoff60))return 'similar_topic_within_60d';
 return '';
}
function isTrendGroundingFailure(issues:string[]){
 return issues.some(issue=>/실제 인용된 연구 출처|연구 제목과 발표 연도|원 논문|DOI|저널|대학|연구기관 출처/.test(issue));
}
type DatingMythHistoryItem={claim:string;myth_key:string;created_at:string};
function mythSimilarity(a:unknown,b:unknown){
 const x=trendNorm(a),y=trendNorm(b);if(!x||!y)return 0;if(x===y)return 1;
 const grams=(value:string)=>new Set(Array.from({length:Math.max(0,value.length-2)},(_,i)=>value.slice(i,i+3)));
 const A=grams(x),B=grams(y);if(!A.size||!B.size)return 0;let overlap=0;for(const g of A)if(B.has(g))overlap++;
 return overlap/(A.size+B.size-overlap);
}
async function loadDatingMythHistory(db:any):Promise<DatingMythHistoryItem[]>{
 const since120=new Date(Date.now()-120*86400000).toISOString();
 const rows=ok(await db.from('marketing_generation_jobs').select('created_at,result_snapshot,status').eq('status','completed').gte('created_at',since120).order('created_at',{ascending:false}).limit(100))||[];
 return (Array.isArray(rows)?rows:[]).flatMap((row:Row)=>{
  const snapshot=row?.result_snapshot,document=snapshot?.content_document;
  if(snapshot?.growth_topic_type!=='dating_myth')return [];
  const myth=document?.myth,mythSlide=Array.isArray(document?.slides)?document.slides.find((slide:Row)=>slide?.role==='myth'):null;
  const claim=String(myth?.claim||mythSlide?.title||mythSlide?.body||'').trim();
  if(!claim)return [];
  return [{claim,myth_key:String(myth?.myth_key||''),created_at:String(row.created_at||snapshot.saved_at||'')}];
 });
}
function datingMythHistoryPrompt(items:DatingMythHistoryItem[]):DatingMythHistory{
 const cutoff60=Date.now()-60*86400000;
 return {
  claims_120d:[...new Set(items.map(item=>item.claim).filter(Boolean))],
  myth_keys_60d:[...new Set(items.filter(item=>Date.parse(item.created_at)>=cutoff60).map(item=>item.myth_key).filter(Boolean))]
 };
}
function datingMythRepeatReason(myth:Row|undefined,items:DatingMythHistoryItem[]):string{
 if(!myth?.claim)return '';
 const cutoff60=Date.now()-60*86400000,claim=String(myth.claim),key=String(myth.myth_key||'');
 if(items.some(item=>mythSimilarity(item.claim,claim)>=.72))return 'same_myth_within_120d';
 if(key&&items.some(item=>item.myth_key===key&&Date.parse(item.created_at)>=cutoff60))return 'similar_myth_topic_within_60d';
 return '';
}
function isDatingMythGroundingFailure(issues:string[]){
 return issues.some(issue=>/실제 인용된 연구 출처|연구 제목과 발표 연도|원 논문|DOI|저널|대학|연구기관 출처|통념에는 주장|통념 분류|통념 판정/.test(issue));
}

function parseDocument(result:Row){
 const choice=result.choices?.[0],raw=choice?.message?.content;
 if(choice?.finish_reason!=='stop'||choice.message?.refusal||typeof raw!=='string')throw new Error('생성 결과가 끝까지 작성되지 않았습니다. 응답을 보존했으며 자동 반복 생성하지 않습니다.');
 try{return {document:JSON.parse(raw) as Row,raw};}
 catch{throw new Error('생성 결과 형식이 유효하지 않습니다. 원문을 보존했으며 자동 반복 생성하지 않습니다.');}
}

export async function generateEditorialCopy(db:any,draft:Row,input:Row,job:Row,call:Call){
 const requestedType=postType(input),language=input.language==='en'?'en':'ko',answerFirst=input.answer_first_enabled===true,plan=(input.carousel_plan||null) as CarouselPlan|null;
 const seoulFormat:SeoulDatingFormat=requestedType==='seoul_dating'?seoulDatingFormat(String(draft.draft_date||'')+':'+String(draft.id||'')):'places';
 const trendItems=requestedType==='trend_research'?await loadTrendHistory(db):[],trendHistory=trendHistoryPrompt(trendItems);
 const mythItems=requestedType==='dating_myth'?await loadDatingMythHistory(db):[],mythHistory=datingMythHistoryPrompt(mythItems);
 let effectiveType=requestedType,facts:Row|null=null,trendContext:Row|null=null,trendPack:TrendFactPack|null=null,fallbackReason='',repairUsed=false,mythAlternateUsed=false,selectedBook:ReturnType<typeof selectVerifiedMarketingBook>|null=null;
 if(requestedType==='live_event'){
  let q=db.from('events').select('id,slug,title,starts_at,venue,neighborhood,capacity,seats_remaining,price_gents,price_ladies').eq('status','live').is('deleted_at',null).gt('starts_at',new Date().toISOString());if(draft.event_id)q=q.eq('id',draft.event_id);
  facts=ok(await q.order('starts_at').limit(1).maybeSingle());if(!facts)throw new Error('게시 가능한 정식 이벤트가 없습니다. 이벤트 모집 대신 오픈 전 홍보를 선택하세요.');
 }
 let sources:Evidence[]=[],notes='',inputTokens=0,outputTokens=0;
 const record=async(result:Row)=>{inputTokens+=Number(result.usage?.input_tokens||result.usage?.prompt_tokens||0);outputTokens+=Number(result.usage?.output_tokens||result.usage?.completion_tokens||0);ok(await db.from('marketing_generation_jobs').update({input_tokens:inputTokens,output_tokens:outputTokens}).eq('id',job.id));};

 if(requestedType==='seoul_trend'&&draft.trend_id){
  trendContext=ok(await db.from('marketing_trends').select('*').eq('id',draft.trend_id).maybeSingle()) as Row|null;
  if(!trendContext||!['emerging','rising','peak'].includes(String(trendContext.status)))throw new Error('TREND_CONTEXT_UNAVAILABLE');
  sources=trendEvidence(trendContext);
  if(sources.length<2)throw new Error('TREND_CONTEXT_EVIDENCE_INSUFFICIENT');
  trendPack=readTrendFactPack(trendContext.fact_pack,sources.map((source:Evidence)=>source.id));
  const problems=trendFactPackIssues(trendPack,String(trendContext.category));
  if(problems.length)throw new Error(problems[0]);
  notes=[trendContext.display_name,trendContext.summary,trendContext.content_angle,...(trendPack?.facts||[]).map(f=>f.kind+': '+f.value_ko)].filter(Boolean).join('\n');
  ok(await db.from('marketing_generation_jobs').update({stage:'researching',research_cache:{key:'trend-fact-pack-v1:'+trendContext.id,saved_at:new Date().toISOString(),sources,notes,subject:trendContext.display_name,search_completed:true,trend_context:true,layout:trendPack!.layout,paid_web_search_calls:0}}).eq('id',job.id));
 }else if(requestedType==='book_insight'){
  const book=selectVerifiedMarketingBook(input.instruction||'',String(draft.draft_date||draft.id)+':'+String(input.instruction||''));selectedBook=book;
  sources=verifiedBookEvidence(book);
  notes=sources[0].evidence;
  ok(await db.from('marketing_generation_jobs').update({stage:'researching',research_cache:{key:'verified-book-catalog-v1:'+book.title,saved_at:new Date().toISOString(),sources,notes,subject:book.title,search_completed:true,verified_catalog:true}}).eq('id',job.id));
 }else if(CONTENT_PROFILES[requestedType].research){
  const researchTask=buildMarketingResearchTask(requestedType,input.instruction||'',language,requestedType==='seoul_dating'?seoulFormat:'',requestedType==='trend_research'?trendHistory:undefined,requestedType==='dating_myth'?mythHistory:undefined);
  const cacheKey=createHash('sha256').update(JSON.stringify([RESEARCH_TASK_VERSION,CONTENT_POLICY_VERSION,requestedType,language,input.instruction||'',requestedType==='seoul_dating'?seoulFormat:'',requestedType==='trend_research'?trendHistory:null,requestedType==='dating_myth'?mythHistory:null])).digest('hex');
  const own=ok(await db.from('marketing_generation_jobs').select('retry_of_job_id').eq('id',job.id).single());
  const prior=own?.retry_of_job_id?ok(await db.from('marketing_generation_jobs').select('research_cache').eq('id',own.retry_of_job_id).maybeSingle()):null;
  const cache=prior?.research_cache;
  if(cache?.key===cacheKey&&cache.search_completed===true&&Array.isArray(cache.sources)&&cache.sources.length&&Date.now()-Date.parse(cache.saved_at)<86400000){sources=cache.sources;notes=cache.notes;}
  else{
   ok(await db.from('marketing_generation_jobs').update({stage:'researching'}).eq('id',job.id));
   const research=await call('responses',{model:MODEL,instructions:researchInstructions(requestedType,language,input.instruction||'',requestedType==='seoul_dating'?seoulFormat:''),input:researchTask,tools:[{type:'web_search',search_context_size:'high',external_web_access:true}],tool_choice:'required',max_tool_calls:3,include:['web_search_call.action.sources'],max_output_tokens:['seoul_dating','trend_research','dating_myth'].includes(requestedType)?4200:3000,store:false},95000);
   await record(research);const evidence=extractResearchEvidence(research);sources=evidence.sources;notes=evidence.notes;
   ok(await db.from('marketing_generation_jobs').update({research_cache:{key:cacheKey,saved_at:new Date().toISOString(),sources,notes,subject:researchTask,search_completed:evidence.completed&&sources.length>0}}).eq('id',job.id));
   if(!evidence.completed||!sources.length){
    const fallback=FALLBACK_TYPE[requestedType];
    if(!fallback){
     const report={version:3,status:'rejected',issues:['실제 인용된 연구 출처를 확보하지 못했습니다.'],review_required:true,severity:'critical'};
     ok(await db.from('marketing_generation_jobs').update({quality_report:report,result_snapshot:{draft_id:draft.id,content_language:language,growth_topic_type:requestedType,quality_report:report,research_notes:notes,research_sources:sources,images:[],carousel_slides:[],caption:''}}).eq('id',job.id));
     throw new Error(report.issues[0]);
    }
    effectiveType=fallback;sources=[];notes='';fallbackReason='research_unavailable:'+requestedType+'->'+fallback;
    ok(await db.from('marketing_generation_jobs').update({stage:'writing_fallback'}).eq('id',job.id));
   }
  }
 }

 const write=async(type:PostType,repair?:{document:Row;issues:string[]},candidateVariant:''|'backup'='')=>{
  const writingVariant=type==='seoul_dating'?seoulFormat:type==='dating_myth'?candidateVariant:type==='seoul_trend'&&trendPack?trendPack.layout:'';
  const sourceFreeSeoulFallback=requestedType==='seoul_trend'&&type==='korea_life'&&Boolean(fallbackReason);
  const fallbackGuidance=sourceFreeSeoulFallback
   ?'\nSOURCE-FREE FALLBACK: Research did not produce usable citations. Write a timeless Seoul everyday-life scenario, not a current trend or verified event guide. Avoid unverified venue names, fresh popularity claims, ranking claims, event dates, opening hours, prices, research statistics and made-up citations. Give a concrete fictional conversation tip and remain faithful to the non-research Korea-life content schema.'
   :'';
  const instructions=writingInstructions(type,language,writingVariant,answerFirst,plan)+fallbackGuidance+(repair?'\nREPAIR PASS: Fix ONLY the listed quality issues. Preserve all supported facts, source IDs, uncertainty, card roles, and the approved topic. Do not add new claims. Return the complete corrected document in the same strict schema.':'');
  const payload={editorial_type:type,language,direction:sourceFreeSeoulFallback?'':input.instruction||'',evidence:sources,event:facts,...(type==='seoul_dating'?{seoul_format:seoulFormat}:{}),...(type==='seoul_trend'&&trendContext?{trend_context:{id:trendContext.id,trend_key:trendContext.trend_key,display_name:trendContext.display_name,category:trendContext.category,status:trendContext.status,observed_at:trendContext.observed_at,summary:trendContext.summary,content_angle:trendContext.content_angle,source_ids:sources.map(x=>x.id)},...(trendPack?{fact_pack:trendPackForModel(trendPack),fact_pack_layout:trendPack.layout,fact_pack_origin:trendPack.origin,no_additional_web_search:true}: {})}:{}),...(type==='trend_research'?{current_year:new Date().getUTCFullYear(),recent_history:trendHistory}:{}),...(type==='dating_myth'?{myth_candidate:candidateVariant==='backup'?'backup':'primary',recent_history:mythHistory}:{}),...(repair?{original_document:repair.document,quality_issues:repair.issues}:{})};
  if(Buffer.byteLength(instructions+JSON.stringify(payload)+JSON.stringify(contentSchema(type,language,writingVariant,answerFirst,plan)),'utf8')>30000)throw new Error('PROMPT_SIZE_LIMIT');
  const control=ok(await db.from('marketing_ai_control').select('enabled,blocked_reason').eq('singleton',true).single());
  if(!control.enabled||control.blocked_reason)throw new Error('AI_PAUSED');
  ok(await db.from('marketing_generation_jobs').update({stage:repair?'repairing_copy':candidateVariant==='backup'?'writing_alternate_myth':'writing'}).eq('id',job.id));
  const result=await call('chat/completions',{model:MODEL,reasoning_effort:'none',max_completion_tokens:4096,response_format:{type:'json_schema',json_schema:{name:'roundy_editorial_v2',strict:true,schema:contentSchema(type,language,writingVariant,answerFirst,plan)}},messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(payload)}]},55000);
  await record(result);return {...parseDocument(result),result};
 };

 const lockVerifiedBook=(document:Row)=>{
  if(effectiveType!=='book_insight'||!selectedBook)return document;
  return {...document,
   book:{...document.book,title:selectedBook.title,author:selectedBook.author,source_id:'S1',source_context:String(document.book?.source_context||'Paraphrased from the verified publisher/author description.')},
   slides:Array.isArray(document.slides)?document.slides.map((slide:Row)=>['book','insight'].includes(slide.role)?{...slide,source_ids:['S1']}:slide):document.slides
  };
 };
 const lockSeoulGrounding=(document:Row)=>{
  if(effectiveType!=='seoul_dating'||!document?.seoul||!Array.isArray(document.seoul.venues))return document;
  const roles=['scenario','etiquette','plan'],venues=document.seoul.venues.slice(0,3);
  if(plan?.slide_count===3){
   const names=venues.map((venue:Row)=>String(venue.name||'').trim()).filter(Boolean);
   const ids=[...new Set(venues.flatMap((venue:Row)=>Array.isArray(venue.source_ids)?venue.source_ids:[]))].slice(0,3);
   const joined=names.join(seoulFormat==='course'?' → ':' / ');
   const slides=Array.isArray(document.slides)?document.slides.map((slide:Row)=>{
    if(slide.role!=='plan')return slide;
    return {...slide,title:slide.title,body:joined,source_ids:ids};
   }):document.slides;
   return {...document,seoul:{...document.seoul,format:seoulFormat,
    verified_at:new Date().toISOString().slice(0,10),venues},slides};
  }
  const slides=Array.isArray(document.slides)?document.slides.map((slide:Row)=>{
   const index=roles.indexOf(slide.role);if(index<0||!venues[index])return slide;
   const venue=venues[index],name=String(venue.name||'').trim(),combined=(String(slide.title||'')+' '+String(slide.body||'')).normalize('NFKC');
   return {...slide,title:name&&!combined.includes(name)?name:slide.title,source_ids:Array.isArray(venue.source_ids)?venue.source_ids:slide.source_ids};
  }):document.slides;
  return {...document,seoul:{...document.seoul,format:seoulFormat,verified_at:new Date().toISOString().slice(0,10),venues},slides};
 };
 const lockMythGrounding=(document:Row)=>{
  if(effectiveType!=='dating_myth'||plan?.slide_count!==3)return document;
  const claim=String(document?.myth?.claim||'').trim();
  if(!claim)return document;
  const slides=Array.isArray(document.slides)?document.slides.map((slide:Row)=>{
   if(slide.role!=='finding')return slide;
   const body=String(slide.body||'').trim();
   const prefix=language==='en'?'Belief to examine: ':'검토할 통념: ';
   return {...slide,body:body.includes(claim)?body:prefix+claim+'\n'+body};
  }):document.slides;
  return {...document,slides};
 };
 const lockTrendGrounding=(document:Row)=>{
  if(effectiveType!=='seoul_trend'||!trendContext)return document;
  const sourceIds=sources.map(source=>source.id),factIds=trendPack?[...new Set(trendPack.facts.flatMap(f=>f.source_ids))].slice(0,3):sourceIds;
  const slides=Array.isArray(document.slides)?document.slides.map((slide:Row)=>{
   if(['trend','why_now','facts','experience','practical'].includes(slide.role))return {...slide,source_ids:trendPack?factIds:sourceIds};
   return slide;
  }):document.slides;
  return {...document,trend:{trend_id:String(trendContext.id),trend_key:String(trendContext.trend_key),display_name:String(trendContext.display_name),category:String(trendContext.category),status:String(trendContext.status),observed_at:String(trendContext.observed_at),summary:String(trendContext.summary),content_angle:String(trendContext.content_angle),source_ids:sourceIds},...(trendPack?{trend_layout:trendPack.layout,trend_fact_pack:trendPack}:{}),slides};
 };

 let written=await write(effectiveType);
 ok(await db.from('marketing_generation_jobs').update({result_snapshot:{draft_id:draft.id,content_language:language,growth_topic_type:input.content_mode==='growth_carousel'?effectiveType:null,raw_content:written.raw.slice(0,24000),research_sources:sources,images:[],carousel_slides:[],caption:'',quality_report:{version:3,status:'unchecked',issues:[]},generation_recovery:{fallback_reason:fallbackReason||null,repair_used:false}}}).eq('id',job.id));

 written.document=lockTrendGrounding(lockSeoulGrounding(lockVerifiedBook(lockMythGrounding(written.document))));
 let prepared=prepareContent(applyAnswerFirstDocument(written.document,answerFirst,plan),effectiveType,language,sources);
 if(requestedType==='seoul_trend'&&effectiveType==='korea_life'&&fallbackReason){
  // No cited source means no recent trend, event date, current ranking or price
  // may be stated as a fact. Fail closed instead of paying for another repair.
  const fallbackDocument=prepared.document as Row;
  const visible=[fallbackDocument.caption,fallbackDocument.caption_ko,fallbackDocument.caption_en,
   ...(Array.isArray(fallbackDocument.slides)?fallbackDocument.slides.slice(0,-1).flatMap(
    (slide:Row)=>[slide.title,slide.body,slide.highlight,slide.secondary_body]):[])
  ].filter(Boolean).join(' ');
  const temporalClaim=/(?:요즘|최근|지금).{0,6}(?:인기|화제|유행|핫|뜨는|급상승)|핫플|바이럴|(?:currently|now|just)\s+(?:trending|viral|popular)|\b(?:latest trend|most popular|just opened|sold out)\b/i;
  const specificClaim=/(?:20[2-9]\d)[-.\/]\d{1,2}|\b\d{1,2}:\d{2}\b|\d[\d,]*\s*(?:원|KRW)|(?:연구|조사)\s*(?:결과|에 따르면)/i;
  if(temporalClaim.test(visible)||specificClaim.test(visible))
   throw new Error('UNVERIFIED_SEOUL_TREND_FALLBACK_CLAIM: 인용 근거 없이 최근 인기, 일정, 가격이나 조사 결과를 주장할 수 없습니다.');
 }

 if(requestedType==='seoul_dating'&&effectiveType==='seoul_dating'&&prepared.report.status!=='passed'){
  const seoulIssues=classifyQualityIssues(prepared.report.issues);
  if(isSeoulVenueFailure(seoulIssues.critical)){
   effectiveType='conversation_prompt';sources=[];fallbackReason='insufficient_verified_places:seoul_dating->conversation_prompt';
   ok(await db.from('marketing_generation_jobs').update({stage:'writing_fallback'}).eq('id',job.id));
   written=await write(effectiveType);prepared=prepareContent(applyAnswerFirstDocument(written.document,answerFirst,plan),effectiveType,language,sources);
  }
 }
 if(requestedType==='trend_research'&&effectiveType==='trend_research'){
  const repeat=trendRepeatReason((prepared.document as Row)?.study,trendItems),trendIssues=classifyQualityIssues(prepared.report.issues);
  if(repeat||isTrendGroundingFailure(trendIssues.critical)){
   effectiveType='conversation_prompt';sources=[];fallbackReason=(repeat||'research_grounding_failed')+':trend_research->conversation_prompt';
   ok(await db.from('marketing_generation_jobs').update({stage:'writing_fallback'}).eq('id',job.id));
   written=await write(effectiveType);prepared=prepareContent(applyAnswerFirstDocument(written.document,answerFirst,plan),effectiveType,language,sources);
  }
 }
 if(requestedType==='dating_myth'&&effectiveType==='dating_myth'){
  let repeat=datingMythRepeatReason((prepared.document as Row)?.myth,mythItems),mythIssues=classifyQualityIssues(prepared.report.issues);
  if(repeat||isDatingMythGroundingFailure(mythIssues.critical)){
   mythAlternateUsed=true;
   written=await write(effectiveType,undefined,'backup');written.document=lockMythGrounding(written.document);prepared=prepareContent(applyAnswerFirstDocument(written.document,answerFirst,plan),effectiveType,language,sources);
   repeat=datingMythRepeatReason((prepared.document as Row)?.myth,mythItems);mythIssues=classifyQualityIssues(prepared.report.issues);
   if(repeat||isDatingMythGroundingFailure(mythIssues.critical)){
    effectiveType='conversation_prompt';sources=[];fallbackReason=(repeat||'myth_grounding_failed')+':dating_myth->conversation_prompt';
    ok(await db.from('marketing_generation_jobs').update({stage:'writing_fallback'}).eq('id',job.id));
    written=await write(effectiveType);prepared=prepareContent(applyAnswerFirstDocument(written.document,answerFirst,plan),effectiveType,language,sources);
   }
  }
 }
 if(prepared.report.status!=='passed'){
  const grouped=classifyQualityIssues(prepared.report.issues);
  if(grouped.critical.length){
   const rejected={...prepared.report,severity:'critical',classification:grouped};
   ok(await db.from('marketing_generation_jobs').update({quality_report:rejected,result_snapshot:{draft_id:draft.id,content_language:language,growth_topic_type:effectiveType,raw_content:written.raw.slice(0,24000),research_sources:sources,images:[],carousel_slides:[],caption:'',quality_report:rejected,generation_recovery:{fallback_reason:fallbackReason||null,repair_used:false}}}).eq('id',job.id));
   throw new Error('품질 검토 필요: '+grouped.critical.join(' '));
  }
  const repairIssues=[...grouped.quality,...grouped.formatting];
  if(repairIssues.length){
   repairUsed=true;
   written=await write(effectiveType,{document:prepared.document,issues:repairIssues});
   written.document=lockTrendGrounding(lockSeoulGrounding(lockVerifiedBook(lockMythGrounding(written.document))));
   prepared=prepareContent(applyAnswerFirstDocument(written.document,answerFirst,plan),effectiveType,language,sources);
  }
 }
 const document=prepared.document;

 if(facts){
  const eventCard=prepared.slides.find((s:Row)=>s.role==='event');
  if(eventCard){const factsText=[facts.title,new Date(facts.starts_at).toLocaleString(language==='ko'?'ko-KR':'en-GB',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.body=factsText;eventCard.body_ko=[facts.title,new Date(facts.starts_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.body_en=[new Date(facts.starts_at).toLocaleString('en-GB',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.source_label='Roundy에 등록된 행사 정보 / Published event';}
 }
 const effectiveProfile=CONTENT_PROFILES[effectiveType];
 const recovery={requested_type:requestedType,effective_type:effectiveType,fallback_reason:fallbackReason||null,repair_used:repairUsed,search_limit:requestedType==='book_insight'||(requestedType==='seoul_trend'&&!!trendContext)?0:CONTENT_PROFILES[requestedType].research?3:0,...(requestedType==='seoul_dating'?{seoul_format:seoulFormat,seoul_mix_policy:'70_places_30_course'}:{}),...(requestedType==='seoul_trend'&&trendContext?{trend_id:trendContext.id,trend_key:trendContext.trend_key,trend_score:trendContext.trend_score,trend_route:trendContext.route_type,radar_evidence_reused:true,fact_pack_version:trendPack?.version||null,layout:trendPack?.layout||'legacy',extra_web_search_calls:0}:{}),...(requestedType==='trend_research'?{trend_study_cooldown_days:180,trend_topic_cooldown_days:60,trend_recent_studies:trendHistory.study_titles_180d.length,trend_recent_topics:trendHistory.topic_keys_60d.length}:{}),...(requestedType==='dating_myth'?{myth_claim_cooldown_days:120,myth_topic_cooldown_days:60,myth_recent_claims:mythHistory.claims_120d.length,myth_recent_topics:mythHistory.myth_keys_60d.length,myth_alternate_used:mythAlternateUsed}:{})};
 const finalClassification=classifyQualityIssues(prepared.report.issues);
 const patch={caption:prepared.caption,cta:prepared.cta,content_document:document,quality_report:{...prepared.report,recovery,classification:finalClassification},carousel_slides:prepared.slides,research_sources:prepared.sources,research_status:effectiveProfile.research?'generated':input.content_mode==='growth_carousel'?'generated':'not_required',content_language:language,draft_kind:input.content_mode==='growth_carousel'?'growth_carousel':'brand',growth_topic_type:input.content_mode==='growth_carousel'?effectiveType:null,content_mode:facts?'live_event':'prelaunch',content_pillar:facts?'event':'concept',generation_reason:effectiveProfile.label+' / editorial policy v'+CONTENT_POLICY_VERSION+(requestedType==='seoul_dating'&&!fallbackReason?' / '+seoulFormat:'')+(requestedType==='seoul_trend'&&trendContext?' / radar '+trendContext.trend_key:'')+(fallbackReason?' / safe fallback from '+requestedType:''),event_id:facts?.id||null,trend_id:trendContext?.id||draft.trend_id||null,destination_url:facts?'https://roundy.team/events/'+facts.slug:'https://roundy.team'};
 ok(await db.from('marketing_generation_jobs').update({quality_report:patch.quality_report,result_snapshot:{...patch,draft_id:draft.id,images:[],research_notes:notes,saved_at:new Date().toISOString(),generation_recovery:recovery}}).eq('id',job.id));
 if(prepared.report.status!=='passed')throw new Error('품질 검토 필요: '+prepared.report.issues.join(' '));
 return patch;
}

export function draftQuality(draft:Row){
 if(draft.content_document?.design_preset===CAMPAIGN_PRESET)return campaignDraftQuality(draft);
 if(draft.content_document?.design_preset===EVENT_CAMPAIGN_PRESET)return eventCampaignDraftQuality(draft);
 const input={content_mode:draft.draft_kind==='growth_carousel'?'growth_carousel':draft.content_mode,topic_type:draft.growth_topic_type};
 const type=postType(input),document=draft.content_document;
 if(!document)return {version:3,status:'rejected' as const,issues:['이전 생성본에는 유형별 콘텐츠 구조가 없습니다. 같은 스레드에서 품질 재작업하세요.'],review_required:true};
 const report=evaluateContent({...document,caption:isCompactDocument(document)?document.caption:draft.caption,cta:draft.cta},type,draft.content_language||'ko',draft.research_sources||[]);if(isCompactDocument(document)){const issues=[...bilingualCaptionIssues(String(draft.caption||'')),...captionCtaIssues(document.caption,draft.cta)];report.issues.push(...issues);if(issues.length)report.status='rejected';}return report;
}

export function editorialCard(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){return renderCompactEditorial(slide,index,total,document,assets);}
export function editorialPhotoCover(slide:Row,encoded:string){return renderCompactEditorial({...slide,role:'cover'},0,1,{},{photo:'data:image/jpeg;base64,'+encoded});}
