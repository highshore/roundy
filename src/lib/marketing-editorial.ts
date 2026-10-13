import { createHash } from 'node:crypto';
import { applyAnswerFirstDocument } from './marketing-answer-first';
import { selectVerifiedMarketingBook,verifiedBookEvidence } from './marketing-book-catalog';
import { appendRoundyOutro,BRAND_OUTRO_VERSION,brandedStoryCount,storyOnlyDocument } from './marketing-brand-outro';
import { campaignDraftQuality } from './marketing-campaign';
import { type CarouselPlan } from './marketing-carousel-template';
import { classifyQualityIssues,CONTENT_POLICY_VERSION,CONTENT_PROFILES,contentSchema,evaluateContent,extractResearchEvidence,postType,prepareContent,researchInstructions,type Evidence,type PostType,type Row } from './marketing-content-policy';
import { EDITOR_FIRST_VERSION,editorFirstWritingInstructions,seriesForTopic,validEditorialSeries } from './marketing-editor-first';
import { EDITORIAL_CRITIC_VERSION,storyFirstPostType } from './marketing-editorial-critic';
import { editorialReferenceSamples,hasHumanCopyApproval } from './marketing-editorial-feedback';
import { EDITORIAL_ENGAGEMENT_POLICY } from './marketing-editorial-quality';
import { eventCampaignDraftQuality } from './marketing-event-campaign';
import { bilingualCaptionIssues,CAMPAIGN_PRESET,captionCtaIssues,EVENT_CAMPAIGN_PRESET,isCompactDocument,isMagazineDocument } from './marketing-presentation';
import { fitEditorialWritingRequest } from './marketing-prompt-budget';
import { buildMarketingResearchTask,RESEARCH_TASK_VERSION,type DatingMythHistory,type SeoulDatingFormat,type TrendResearchHistory } from './marketing-research-task';
import { readTrendFactPack,trendFactPackIssues,trendPackForModel,type TrendFactPack } from './marketing-trend-guide';
import { trendEvidence } from './marketing-trend-radar';
import { renderCompactEditorial,type EditorialAssets } from './marketing-visuals';
import { EditorialReviewRequired } from './marketing-workflow';

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

export type EditorialStepOptions={central?:boolean;researchOnly?:boolean;researchContext?:Row};
export async function generateEditorialCopy(db:any,draft:Row,input:Row,job:Row,call:Call,options:EditorialStepOptions={}):Promise<Row>{
 const requestedType=postType(input),language=input.language==='en'?'en':'ko',answerFirst=input.answer_first_enabled===true,plan=(input.carousel_plan||null) as CarouselPlan|null;
 if(!plan)throw new Error('CONTENT_WORKFLOW_REQUIRED');
 const editorFirst=true;
 const series=validEditorialSeries(input.editorial_series)?input.editorial_series:seriesForTopic(requestedType);
 const seoulFormat:SeoulDatingFormat=requestedType==='seoul_dating'&&!(editorFirst&&series==='before_you_go')?seoulDatingFormat(String(draft.draft_date||'')+':'+String(draft.id||'')):'places';
 const trendItems=requestedType==='trend_research'?await loadTrendHistory(db):[],trendHistory=trendHistoryPrompt(trendItems);
 const mythItems=requestedType==='dating_myth'?await loadDatingMythHistory(db):[],mythHistory=datingMythHistoryPrompt(mythItems);
 let effectiveType=requestedType,facts:Row|null=null,trendContext:Row|null=null,trendPack:TrendFactPack|null=null,fallbackReason='',repairUsed=false,mythAlternateUsed=false,selectedBook:ReturnType<typeof selectVerifiedMarketingBook>|null=null;
 if(requestedType==='live_event'){
  let q=db.from('events').select('id,slug,title,starts_at,venue,neighborhood,capacity,seats_remaining,price_gents,price_ladies').eq('status','live').is('deleted_at',null).gt('starts_at',new Date().toISOString());if(draft.event_id)q=q.eq('id',draft.event_id);
  facts=ok(await q.order('starts_at').limit(1).maybeSingle());if(!facts)throw new Error('게시 가능한 정식 이벤트가 없습니다. 이벤트 모집 대신 오픈 전 홍보를 선택하세요.');
 }
 let sources:Evidence[]=[],notes='',inputTokens=0,outputTokens=0;
 const topicSelection=null,topicReviews:never[]=[],creativeDirection=String(input.instruction||'');

 const record=async(result:Row)=>{inputTokens+=Number(result.usage?.input_tokens||result.usage?.prompt_tokens||0);outputTokens+=Number(result.usage?.output_tokens||result.usage?.completion_tokens||0);ok(await db.from('marketing_generation_jobs').update({input_tokens:inputTokens,output_tokens:outputTokens}).eq('id',job.id));};

 // Human-selected subjects use the persisted central workflow only.
 // Central workers exchange a durable, server-loaded research result. The copy
 // worker is never permitted to buy another search when a cached result is stale.
 if(options.researchContext){
  const ctx=options.researchContext;
  if(ctx.version!==1||ctx.requested_type!==requestedType||ctx.language!==language||ctx.direction!==creativeDirection||
   !Array.isArray(ctx.sources)||typeof ctx.notes!=='string'||!Number.isFinite(Date.parse(ctx.saved_at))||
   Date.now()-Date.parse(ctx.saved_at)<0||Date.now()-Date.parse(ctx.saved_at)>=86400000)
   throw new EditorialReviewRequired('DISCOVERY_REFRESH_REQUIRED','저장된 조사 결과를 다시 확인해야 합니다. 원고 단계에서 재검색하지 않았습니다.');
  sources=ctx.sources;notes=ctx.notes;trendContext=ctx.trend_context||null;trendPack=ctx.trend_pack||null;
  selectedBook=ctx.selected_book||null;
  if(CONTENT_PROFILES[requestedType].research&&!sources.length)
   throw new EditorialReviewRequired('EDITORIAL_SOURCE_REVIEW_REQUIRED','저장된 조사 결과에 인용 근거가 없습니다.');
 }else{
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
  const researchTask=buildMarketingResearchTask(requestedType,creativeDirection,language,requestedType==='seoul_dating'?seoulFormat:'',requestedType==='trend_research'?trendHistory:undefined,requestedType==='dating_myth'?mythHistory:undefined);
  const cacheKey=createHash('sha256').update(JSON.stringify([RESEARCH_TASK_VERSION,CONTENT_POLICY_VERSION,requestedType,language,creativeDirection,requestedType==='seoul_dating'?seoulFormat:'',requestedType==='trend_research'?trendHistory:null,requestedType==='dating_myth'?mythHistory:null])).digest('hex');
  const own=ok(await db.from('marketing_generation_jobs').select('retry_of_job_id').eq('id',job.id).single());
  const prior=own?.retry_of_job_id?ok(await db.from('marketing_generation_jobs').select('research_cache').eq('id',own.retry_of_job_id).maybeSingle()):null;
  const cache=prior?.research_cache;
  if(cache?.key===cacheKey&&cache.search_completed===true&&Array.isArray(cache.sources)&&cache.sources.length&&Date.now()-Date.parse(cache.saved_at)>=0&&Date.now()-Date.parse(cache.saved_at)<86400000){
   sources=cache.sources;notes=String(cache.notes||'');
   // Carry forward the original timestamp: further retries reuse evidence without extending its TTL.
   ok(await db.from('marketing_generation_jobs').update({research_cache:cache}).eq('id',job.id));
  }
  else{
   ok(await db.from('marketing_generation_jobs').update({stage:'researching'}).eq('id',job.id));
   const research=await call('responses',{model:MODEL,instructions:researchInstructions(requestedType,language,creativeDirection,requestedType==='seoul_dating'?seoulFormat:''),input:researchTask,tools:[{type:'web_search',search_context_size:'high',external_web_access:true}],tool_choice:'required',max_tool_calls:3,include:['web_search_call.action.sources'],max_output_tokens:['seoul_dating','trend_research','dating_myth'].includes(requestedType)?4200:3000,store:false},95000);
   await record(research);const evidence=extractResearchEvidence(research);sources=evidence.sources;notes=evidence.notes;
   ok(await db.from('marketing_generation_jobs').update({research_cache:{key:cacheKey,saved_at:new Date().toISOString(),sources,notes,subject:researchTask,search_completed:evidence.completed&&sources.length>0,diagnostics:evidence.diagnostics}}).eq('id',job.id));
   if(!evidence.completed||!sources.length){
    const fallback=undefined;
    if(!fallback){
     const reason=evidence.diagnostics.reason;
     const detail=reason==='response_incomplete'
      ?'출처 '+sources.length+'개를 저장했지만 조사 응답이 끝까지 완료되지 않았습니다. 저장된 자료는 유지되며 명시적으로 다시 시도할 수 있습니다.'
      :reason==='search_not_completed'
       ?'인용 자료는 저장했지만 검색 완료를 확인하지 못했습니다. 명시적으로 다시 시도하세요.'
       :'조사 응답에 검증 가능한 URL 인용이 없습니다. 소재를 구체화하거나 명시적으로 다시 시도하세요.';
     const report={version:3,status:'rejected',issues:[detail],review_required:true,severity:'critical',research_diagnostics:evidence.diagnostics};
     ok(await db.from('marketing_generation_jobs').update({quality_report:report,result_snapshot:{draft_id:draft.id,content_language:language,growth_topic_type:requestedType,quality_report:report,research_notes:notes,research_sources:sources,images:[],carousel_slides:[],caption:''}}).eq('id',job.id));throw new EditorialReviewRequired('EDITORIAL_SOURCE_REVIEW_REQUIRED',report.issues[0]);
     throw new Error(report.issues[0]);
    }
    effectiveType=fallback;sources=[];notes='';fallbackReason='research_unavailable:'+requestedType+'->'+fallback;
    ok(await db.from('marketing_generation_jobs').update({stage:'writing_fallback'}).eq('id',job.id));
   }
  }
 }

 }
 if(options.researchOnly)return {research_context:{version:1,requested_type:requestedType,language,direction:creativeDirection,
  sources,notes,trend_context:trendContext,trend_pack:trendPack,selected_book:selectedBook,saved_at:new Date().toISOString()}};

 const referenceSamples=await editorialReferenceSamples(db,language);
 const write=async(type:PostType)=>{
  const repair=undefined,candidateVariant='';
  const writingVariant=type==='seoul_dating'?seoulFormat:type==='dating_myth'?candidateVariant:type==='seoul_trend'&&trendPack?trendPack.layout:'';
  const sourceFreeSeoulFallback=requestedType==='seoul_trend'&&type==='korea_life'&&Boolean(fallbackReason);
  const fallbackGuidance=sourceFreeSeoulFallback
   ?'\nSOURCE-FREE FALLBACK: Research did not produce usable citations. Write a timeless Seoul everyday-life scenario, not a current trend or verified event guide. Avoid unverified venue names, fresh popularity claims, ranking claims, event dates, opening hours, prices, research statistics and made-up citations. Give a concrete fictional conversation tip and remain faithful to the non-research Korea-life content schema.'
   :'';
  const instructions=editorFirstWritingInstructions(type,language,plan!.slide_count,series,CONTENT_PROFILES[type].research?CONTENT_PROFILES[type].brief:'');
  const payload={editorial_type:type,language,direction:sourceFreeSeoulFallback?'':String(input.instruction||''),editorial_brief:{subject:String(input.instruction||''),series,story_count:plan!.slide_count},human_style_references:referenceSamples,evidence:sources,research_notes:notes.slice(0,8000),event:facts,...(type==='seoul_dating'?{seoul_format:seoulFormat}:{}),...(type==='seoul_trend'&&trendContext?{trend_context:{id:trendContext.id,trend_key:trendContext.trend_key,display_name:trendContext.display_name,category:trendContext.category,status:trendContext.status,observed_at:trendContext.observed_at,summary:trendContext.summary,content_angle:trendContext.content_angle,source_ids:sources.map(x=>x.id)},...(trendPack?{fact_pack:trendPackForModel(trendPack),fact_pack_layout:trendPack.layout,fact_pack_origin:trendPack.origin,no_additional_web_search:true}: {})}:{}),...(type==='trend_research'?{current_year:new Date().getUTCFullYear(),recent_history:trendHistory}:{}),...(type==='dating_myth'?{myth_candidate:'primary',recent_history:mythHistory}:{}),...({})};
  const schema=contentSchema(type,language,writingVariant,answerFirst,plan);
  if(editorFirst&&schema.properties.thumbnail_candidates)
   schema.properties.thumbnail_candidates={...schema.properties.thumbnail_candidates,minItems:1,maxItems:1};
  const fittedPayload=fitEditorialWritingRequest(instructions,schema,payload);
  const control=ok(await db.from('marketing_ai_control').select('enabled,blocked_reason').eq('singleton',true).single());
  if(!control.enabled||control.blocked_reason)throw new Error('AI_PAUSED');
  ok(await db.from('marketing_generation_jobs').update({stage:'writing'}).eq('id',job.id));
  const result=await call('chat/completions',{model:MODEL,reasoning_effort:'none',max_completion_tokens:4096,response_format:{type:'json_schema',json_schema:{name:'roundy_editorial_v2',strict:true,schema}},messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(fittedPayload)}]},55000);
  await record(result);ok(await db.from('marketing_generation_jobs').update({result_snapshot:{draft_id:draft.id,raw_content:String(result.choices?.[0]?.message?.content||'').slice(0,24000),research_sources:sources,images:[],carousel_slides:[],requested_type:requestedType}}).eq('id',job.id));
  return {...parseDocument(result),result};
 };

 // New immersive editorial only: old drafts retain their original review contract.
 // A copy failing this gate is repaired once, before any paid photo generation begins.
 const prepareWithEngagementGate=(value:Row,type:PostType)=>{value={...value,editorial_workflow_version:EDITOR_FIRST_VERSION,editorial_series:series,
   editorial_subject:String(input.instruction||''),thumbnail_candidates:[String(value.slides?.[0]?.title||'')]};
  const shaped=plan&&isMagazineDocument(value)
   ?{...value,editorial_narrative_mode:storyFirstPostType(type)?'story_first':'answer_first'}:value;
  const applied=applyAnswerFirstDocument(shaped,answerFirst,plan);
  // All NEW immersive Growth Carousel types, including sourced Seoul guides,
  // share the reader-engagement gate; historical brand/event snapshots stay unchanged.
  const gated=isMagazineDocument(applied)&&input.content_mode==='growth_carousel'
   ?{...applied,editorial_engagement_policy:EDITORIAL_ENGAGEMENT_POLICY}:applied;
  return prepareContent(gated,type,language,sources);
 };

 const lockVerifiedBook=(document:Row)=>{
  if(effectiveType!=='book_insight'||!selectedBook)return document;
  return {...document,
   book:{...document.book,title:selectedBook.title,author:selectedBook.author,source_id:'S1',source_context:String(document.book?.source_context||'Paraphrased from the verified publisher/author description.')},
   slides:Array.isArray(document.slides)?document.slides.map((slide:Row)=>['book','insight','context','key_insight'].includes(slide.role)?{...slide,source_ids:['S1']}:slide):document.slides
  };
 };
 const lockSeoulGrounding=(document:Row)=>{
  if(effectiveType!=='seoul_dating'||!document?.seoul||!Array.isArray(document.seoul.venues))return document;
  const roles=['scenario','etiquette','plan'],venues=document.seoul.venues.slice(0,3);
  if(plan){
   const slides=Array.isArray(document.slides)?document.slides.map((slide:Row,index:number)=>{
    if(index===0||index===document.slides.length-1)return slide;
    if(plan.slide_count===3){
     const names=venues.map((v:Row)=>String(v.name||'').trim()).filter(Boolean);
     const joined=names.join(seoulFormat==='course'?' → ':' / ');
     const ids=[...new Set(venues.flatMap((v:Row)=>Array.isArray(v.source_ids)?v.source_ids:[]))].slice(0,3);
     return {...slide,body:joined,source_ids:ids};
    }
    const venue=venues[index-1],name=String(venue?.name||'').trim();
    if(!venue)return slide;
    const title=String(slide.title||''),body=String(slide.body||'');
    return {...slide,body:(title+' '+body).includes(name)?body:(name+' — '+body).trim(),source_ids:venue.source_ids};
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
  if(effectiveType!=='dating_myth'||(!plan&&document.slides.length!==3))return document;
  const claim=String(document?.myth?.claim||'').trim();
  if(!claim)return document;
  const slides=Array.isArray(document.slides)?document.slides.map((slide:Row)=>{
   if(plan){if(document.slides.indexOf(slide)!==1)return slide;}
   else if(slide.role!=='finding')return slide;
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
   if((plan&&['context','key_insight','insight'].includes(slide.role))||['trend','why_now','facts','experience','practical'].includes(slide.role))return {...slide,source_ids:trendPack?factIds:sourceIds};
   return slide;
  }):document.slides;
  return {...document,trend:{trend_id:String(trendContext.id),trend_key:String(trendContext.trend_key),display_name:String(trendContext.display_name),category:String(trendContext.category),status:String(trendContext.status),observed_at:String(trendContext.observed_at),summary:String(trendContext.summary),content_angle:String(trendContext.content_angle),source_ids:sourceIds},...(trendPack?{trend_layout:trendPack.layout,trend_fact_pack:trendPack}:{}),slides};
 };

 let written=await write(effectiveType);
 ok(await db.from('marketing_generation_jobs').update({result_snapshot:{draft_id:draft.id,content_language:language,growth_topic_type:input.content_mode==='growth_carousel'?effectiveType:null,raw_content:written.raw.slice(0,24000),research_sources:sources,images:[],carousel_slides:[],caption:'',quality_report:{version:3,status:'unchecked',issues:[]},generation_recovery:{fallback_reason:fallbackReason||null,repair_used:false}}}).eq('id',job.id));

 written.document=lockTrendGrounding(lockSeoulGrounding(lockVerifiedBook(lockMythGrounding(written.document))));
 let prepared=prepareWithEngagementGate(written.document,effectiveType);
 const editorialReview:{current:null}={current:null};
 const criticHistory:never[]=[];
 const reject=async(code:string,extra:string[],severity:'critical'|'quality'='quality'):Promise<never>=>{
  const issues=[...new Set([...prepared.report.issues,...extra])];
  const rejected={...prepared.report,status:'rejected',issues,severity,
   classification:classifyQualityIssues(issues),
   ...({})};
  let savedDocument:Row={...prepared.document,editorial_review_required:true,
   source_review_required:severity==='critical',editorial_critic:editorialReview.current,
   editorial_critic_history:criticHistory,
   ...({})};
  let savedSlides=prepared.slides;
  if(plan&&input.brand_outro_enabled===true&&isMagazineDocument(savedDocument)&&savedSlides.length===plan.slide_count){
   const branded=appendRoundyOutro(savedDocument,savedSlides,language,plan);savedDocument=branded.document;savedSlides=branded.slides;
  }
  const savedPatch={caption:prepared.caption,cta:prepared.cta,content_document:savedDocument,
   carousel_slides:savedSlides,research_sources:prepared.sources,quality_report:rejected,
   content_language:language,draft_kind:input.content_mode==='growth_carousel'?'growth_carousel':'brand',
   growth_topic_type:input.content_mode==='growth_carousel'?effectiveType:null,
   content_mode:facts?'live_event':'prelaunch',content_pillar:facts?'event':'concept',
   research_status:CONTENT_PROFILES[effectiveType].research?'generated':'not_required',
   generation_reason:CONTENT_PROFILES[effectiveType].label+' / 원고 보완 대기',
   event_id:facts?.id||null,trend_id:trendContext?.id||draft.trend_id||null,
   destination_url:facts?'https://roundy.team/events/'+facts.slug:'https://roundy.team'};
  ok(await db.from('marketing_generation_jobs').update({quality_report:rejected,result_snapshot:{
   ...savedPatch,draft_id:draft.id,raw_content:written.raw.slice(0,24000),research_notes:notes,
   topic_selection:topicSelection,topic_critic_reviews:topicReviews,images:[],
   generation_recovery:{fallback_reason:fallbackReason||null,repair_used:repairUsed}
  }}).eq('id',job.id));
  throw new EditorialReviewRequired(code,issues.join(' ').slice(0,650),savedPatch);
 };
  const grouped=classifyQualityIssues(prepared.report.issues);
  if(grouped.critical.length)await reject('EDITORIAL_CRITICAL_SOURCE_REJECTED',grouped.critical,'critical');
  if(prepared.report.status!=='passed'){
   const editorialGate=prepared.report.issues.some((issue:string)=>issue.startsWith('에디토리얼 편집 검수:'));
   await reject(editorialGate?'EDITORIAL_ENGAGEMENT_GATE_REJECTED':'EDITORIAL_COPY_QUALITY_REJECTED',[]);
  }
 let document:Row={
  ...prepared.document,
  ...({editorial_suggestions:prepared.report.suggestions||[],editorial_review_required:false,editorial_critic:null,editorial_critic_policy:null}),
  ...({}),
  ...({})
 };
 if(facts){
  const eventCard=prepared.slides.find((s:Row)=>s.role==='event');
  if(eventCard){const factsText=[facts.title,new Date(facts.starts_at).toLocaleString(language==='ko'?'ko-KR':'en-GB',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.body=factsText;eventCard.body_ko=[facts.title,new Date(facts.starts_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.body_en=[new Date(facts.starts_at).toLocaleString('en-GB',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.source_label='Roundy에 등록된 행사 정보 / Published event';}
 }
 let finalSlides=prepared.slides;
 if(plan&&input.brand_outro_enabled===true&&(input.content_mode==='growth_carousel'||options.central)&&isMagazineDocument(document)){
  const completed=appendRoundyOutro(document,finalSlides,language,plan);
  document=completed.document;finalSlides=completed.slides;
 }
 const effectiveProfile=CONTENT_PROFILES[effectiveType];
 const recovery={requested_type:requestedType,effective_type:effectiveType,fallback_reason:fallbackReason||null,repair_used:repairUsed,search_limit:requestedType==='book_insight'||(requestedType==='seoul_trend'&&!!trendContext)?0:CONTENT_PROFILES[requestedType].research?3:0,...(requestedType==='seoul_dating'?{seoul_format:seoulFormat,seoul_mix_policy:'70_places_30_course'}:{}),...(requestedType==='seoul_trend'&&trendContext?{trend_id:trendContext.id,trend_key:trendContext.trend_key,trend_score:trendContext.trend_score,trend_route:trendContext.route_type,radar_evidence_reused:true,fact_pack_version:trendPack?.version||null,layout:trendPack?.layout||'legacy',extra_web_search_calls:0}:{}),...(requestedType==='trend_research'?{trend_study_cooldown_days:180,trend_topic_cooldown_days:60,trend_recent_studies:trendHistory.study_titles_180d.length,trend_recent_topics:trendHistory.topic_keys_60d.length}:{}),...(requestedType==='dating_myth'?{myth_claim_cooldown_days:120,myth_topic_cooldown_days:60,myth_recent_claims:mythHistory.claims_120d.length,myth_recent_topics:mythHistory.myth_keys_60d.length,myth_alternate_used:mythAlternateUsed}:{})};
 const finalClassification=classifyQualityIssues(prepared.report.issues);
 const patch={caption:prepared.caption,cta:prepared.cta,content_document:document,quality_report:{...prepared.report,recovery,classification:finalClassification,
  ...({})},carousel_slides:finalSlides,research_sources:prepared.sources,research_status:effectiveProfile.research?'generated':input.content_mode==='growth_carousel'?'generated':'not_required',content_language:language,draft_kind:input.content_mode==='growth_carousel'?'growth_carousel':'brand',growth_topic_type:input.content_mode==='growth_carousel'?effectiveType:null,content_mode:facts?'live_event':'prelaunch',content_pillar:facts?'event':'concept',generation_reason:effectiveProfile.label+' / editorial policy v'+CONTENT_POLICY_VERSION+(requestedType==='seoul_dating'&&!fallbackReason?' / '+seoulFormat:'')+(requestedType==='seoul_trend'&&trendContext?' / radar '+trendContext.trend_key:'')+(''),event_id:facts?.id||null,trend_id:trendContext?.id||draft.trend_id||null,destination_url:facts?'https://roundy.team/events/'+facts.slug:'https://roundy.team'};
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
 const magazine=isMagazineDocument(document);
 if(document.brand_outro_version===BRAND_OUTRO_VERSION&&brandedStoryCount(document)===null)
  return {version:3,status:'rejected' as const,issues:['독립 Roundy 브랜드 카드 구성이 올바르지 않습니다.'],review_required:true};
 const story=storyOnlyDocument(document);
 const report=evaluateContent({...story,caption:isCompactDocument(document)?document.caption:draft.caption,cta:draft.cta},type,draft.content_language||'ko',draft.research_sources||[]);
 if(isCompactDocument(document)){
  const issues=[...bilingualCaptionIssues(String(draft.caption||'')),...(magazine?[]:captionCtaIssues(document.caption,draft.cta))];
  report.issues.push(...issues);if(issues.length)report.status='rejected';
 }
 // Saved-card rendering and photo-only edits must retain the independently
 // reviewed score. Never silently replace it with a weaker regex heuristic.
 const editorialCritic=document.editorial_critic;
 const humanApproved=hasHumanCopyApproval(draft);
 if(Array.isArray(document.translation_pending_indices)&&document.translation_pending_indices.length)
  report.issues.push('번역 갱신 필요: '+document.translation_pending_indices.map((i:number)=>i+1).join(', '));
 if(document.source_review_required)report.issues.push('출처 보완 및 재검증이 필요합니다.');
 if(!humanApproved&&(document.editorial_review_required||(editorialCritic&&editorialCritic.status!=='passed')))
  report.issues.push('저장된 원고를 수정한 뒤 편집 검토를 완료하세요.');
 if(report.issues.length)report.status='rejected';
 if(editorialCritic?.version===EDITORIAL_CRITIC_VERSION&&editorialCritic.status==='passed'&&
  typeof editorialCritic.score==='number'&&Number.isFinite(editorialCritic.score))
  return {...report,editorial_heuristic_score:report.editorial_score,
   editorial_score:editorialCritic.score,editorial_critic:editorialCritic,
   editorial_critic_policy:EDITORIAL_CRITIC_VERSION};
 return report;
}

export function editorialCard(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){return renderCompactEditorial(slide,index,total,document,assets);}
export function editorialPhotoCover(slide:Row,encoded:string){return renderCompactEditorial({...slide,role:'cover'},0,1,{},{photo:'data:image/jpeg;base64,'+encoded});}
