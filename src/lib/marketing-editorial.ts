import {buildMarketingResearchTask,RESEARCH_TASK_VERSION} from './marketing-research-task';
import {selectVerifiedMarketingBook,verifiedBookEvidence} from './marketing-book-catalog';
import {captionCtaIssues,isCompactDocument,bilingualCaptionIssues} from './marketing-presentation';
import {renderCompactEditorial,type EditorialAssets} from './marketing-visuals';
import {createHash} from 'node:crypto';
import {CONTENT_PROFILES,CONTENT_POLICY_VERSION,postType,contentSchema,researchInstructions,writingInstructions,extractResearchEvidence,prepareContent,evaluateContent,classifyQualityIssues,type PostType,type Evidence,type Row} from './marketing-content-policy';

type Call=(endpoint:string,body:Row,timeout:number)=>Promise<Row>;
const ok=(r:any)=>{if(r.error)throw r.error;return r.data;};
const MODEL='gpt-4.1-mini';
const FALLBACK_TYPE:Partial<Record<PostType,PostType>>={trend_research:'dating_archetype',dating_myth:'conversation_prompt'};

function parseDocument(result:Row){
 const choice=result.choices?.[0],raw=choice?.message?.content;
 if(choice?.finish_reason!=='stop'||choice.message?.refusal||typeof raw!=='string')throw new Error('생성 결과가 끝까지 작성되지 않았습니다. 응답을 보존했으며 자동 반복 생성하지 않습니다.');
 try{return {document:JSON.parse(raw) as Row,raw};}
 catch{throw new Error('생성 결과 형식이 유효하지 않습니다. 원문을 보존했으며 자동 반복 생성하지 않습니다.');}
}

export async function generateEditorialCopy(db:any,draft:Row,input:Row,job:Row,call:Call){
 const requestedType=postType(input),language=input.language==='en'?'en':'ko';
 let effectiveType=requestedType,facts:Row|null=null,fallbackReason='',repairUsed=false,selectedBook:ReturnType<typeof selectVerifiedMarketingBook>|null=null;
 if(requestedType==='live_event'){
  let q=db.from('events').select('id,slug,title,starts_at,venue,neighborhood,capacity,seats_remaining,price_gents,price_ladies').eq('status','live').is('deleted_at',null).gt('starts_at',new Date().toISOString());if(draft.event_id)q=q.eq('id',draft.event_id);
  facts=ok(await q.order('starts_at').limit(1).maybeSingle());if(!facts)throw new Error('게시 가능한 정식 이벤트가 없습니다. 이벤트 모집 대신 오픈 전 홍보를 선택하세요.');
 }
 let sources:Evidence[]=[],notes='',inputTokens=0,outputTokens=0;
 const record=async(result:Row)=>{inputTokens+=Number(result.usage?.input_tokens||result.usage?.prompt_tokens||0);outputTokens+=Number(result.usage?.output_tokens||result.usage?.completion_tokens||0);ok(await db.from('marketing_generation_jobs').update({input_tokens:inputTokens,output_tokens:outputTokens}).eq('id',job.id));};

 if(requestedType==='book_insight'){
  const book=selectVerifiedMarketingBook(input.instruction||'',String(draft.draft_date||draft.id)+':'+String(input.instruction||''));selectedBook=book;
  sources=verifiedBookEvidence(book);
  notes=sources[0].evidence;
  ok(await db.from('marketing_generation_jobs').update({stage:'researching',research_cache:{key:'verified-book-catalog-v1:'+book.title,saved_at:new Date().toISOString(),sources,notes,subject:book.title,search_completed:true,verified_catalog:true}}).eq('id',job.id));
 }else if(CONTENT_PROFILES[requestedType].research){
  const researchTask=buildMarketingResearchTask(requestedType,input.instruction||'',language);
  const cacheKey=createHash('sha256').update(JSON.stringify([RESEARCH_TASK_VERSION,CONTENT_POLICY_VERSION,requestedType,language,input.instruction||''])).digest('hex');
  const own=ok(await db.from('marketing_generation_jobs').select('retry_of_job_id').eq('id',job.id).single());
  const prior=own?.retry_of_job_id?ok(await db.from('marketing_generation_jobs').select('research_cache').eq('id',own.retry_of_job_id).maybeSingle()):null;
  const cache=prior?.research_cache;
  if(cache?.key===cacheKey&&cache.search_completed===true&&Array.isArray(cache.sources)&&cache.sources.length&&Date.now()-Date.parse(cache.saved_at)<86400000){sources=cache.sources;notes=cache.notes;}
  else{
   ok(await db.from('marketing_generation_jobs').update({stage:'researching'}).eq('id',job.id));
   const research=await call('responses',{model:MODEL,instructions:researchInstructions(requestedType,language,input.instruction||''),input:researchTask,tools:[{type:'web_search',search_context_size:'high',external_web_access:true}],tool_choice:'required',max_tool_calls:3,include:['web_search_call.action.sources'],max_output_tokens:3000,store:false},95000);
   await record(research);const evidence=extractResearchEvidence(research);sources=evidence.sources;notes=evidence.notes;
   ok(await db.from('marketing_generation_jobs').update({research_cache:{key:cacheKey,saved_at:new Date().toISOString(),sources,notes,subject:researchTask,search_completed:evidence.completed&&sources.length>0}}).eq('id',job.id));
   if(!evidence.completed||!sources.length){
    const fallback=FALLBACK_TYPE[requestedType];
    if(!fallback){
     const report={version:3,status:'rejected',issues:['실제 인용된 연구 출처를 확보하지 못했습니다.'],review_required:true,severity:'critical'};
     ok(await db.from('marketing_generation_jobs').update({quality_report:report,result_snapshot:{draft_id:draft.id,content_language:language,growth_topic_type:requestedType,quality_report:report,research_notes:notes,research_sources:sources,images:[],carousel_slides:[],caption:''}}).eq('id',job.id));
     throw new Error(report.issues[0]);
    }
    effectiveType=fallback;sources=[];fallbackReason='research_unavailable:'+requestedType+'->'+fallback;
    ok(await db.from('marketing_generation_jobs').update({stage:'writing_fallback'}).eq('id',job.id));
   }
  }
 }

 const write=async(type:PostType,repair?:{document:Row;issues:string[]})=>{
  const instructions=writingInstructions(type,language)+(repair?'\nREPAIR PASS: Fix ONLY the listed quality issues. Preserve all supported facts, source IDs, uncertainty, card roles, and the approved topic. Do not add new claims. Return the complete corrected document in the same strict schema.':'');
  const payload={editorial_type:type,language,direction:input.instruction||'',evidence:sources,event:facts,...(repair?{original_document:repair.document,quality_issues:repair.issues}:{})};
  if(Buffer.byteLength(instructions+JSON.stringify(payload)+JSON.stringify(contentSchema(type,language)),'utf8')>30000)throw new Error('PROMPT_SIZE_LIMIT');
  const control=ok(await db.from('marketing_ai_control').select('enabled,blocked_reason').eq('singleton',true).single());
  if(!control.enabled||control.blocked_reason)throw new Error('AI_PAUSED');
  ok(await db.from('marketing_generation_jobs').update({stage:repair?'repairing_copy':'writing'}).eq('id',job.id));
  const result=await call('chat/completions',{model:MODEL,temperature:repair?.3:.6,max_completion_tokens:4096,response_format:{type:'json_schema',json_schema:{name:'roundy_editorial_v2',strict:true,schema:contentSchema(type,language)}},messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(payload)}]},55000);
  await record(result);return {...parseDocument(result),result};
 };

 const lockVerifiedBook=(document:Row)=>{
  if(effectiveType!=='book_insight'||!selectedBook)return document;
  return {...document,
   book:{...document.book,title:selectedBook.title,author:selectedBook.author,source_id:'S1',source_context:String(document.book?.source_context||'Paraphrased from the verified publisher/author description.')},
   slides:Array.isArray(document.slides)?document.slides.map((slide:Row)=>['book','insight'].includes(slide.role)?{...slide,source_ids:['S1']}:slide):document.slides
  };
 };

 let written=await write(effectiveType);
 ok(await db.from('marketing_generation_jobs').update({result_snapshot:{draft_id:draft.id,content_language:language,growth_topic_type:input.content_mode==='growth_carousel'?effectiveType:null,raw_content:written.raw.slice(0,24000),research_sources:sources,images:[],carousel_slides:[],caption:'',quality_report:{version:3,status:'unchecked',issues:[]},generation_recovery:{fallback_reason:fallbackReason||null,repair_used:false}}}).eq('id',job.id));

 written.document=lockVerifiedBook(written.document);
 let prepared=prepareContent(written.document,effectiveType,language,sources);
 if(prepared.report.status!=='passed'){
  const grouped=classifyQualityIssues(prepared.report.issues);
  if(grouped.critical.length)throw new Error('품질 검토 필요: '+grouped.critical.join(' '));
  const repairIssues=[...grouped.quality,...grouped.formatting];
  if(repairIssues.length){
   repairUsed=true;
   written=await write(effectiveType,{document:prepared.document,issues:repairIssues});
   written.document=lockVerifiedBook(written.document);
   prepared=prepareContent(written.document,effectiveType,language,sources);
  }
 }
 const document=prepared.document;

 if(facts){
  const eventCard=prepared.slides.find((s:Row)=>s.role==='event');
  if(eventCard){const factsText=[facts.title,new Date(facts.starts_at).toLocaleString(language==='ko'?'ko-KR':'en-GB',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.body=factsText;eventCard.body_ko=[facts.title,new Date(facts.starts_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.body_en=[new Date(facts.starts_at).toLocaleString('en-GB',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.source_label='Roundy에 등록된 행사 정보 / Published event';}
 }
 const effectiveProfile=CONTENT_PROFILES[effectiveType];
 const recovery={requested_type:requestedType,effective_type:effectiveType,fallback_reason:fallbackReason||null,repair_used:repairUsed,search_limit:requestedType==='book_insight'?0:CONTENT_PROFILES[requestedType].research?3:0};
 const patch={caption:prepared.caption,cta:prepared.cta,content_document:document,quality_report:{...prepared.report,recovery},carousel_slides:prepared.slides,research_sources:prepared.sources,research_status:effectiveProfile.research?'generated':input.content_mode==='growth_carousel'?'generated':'not_required',content_language:language,draft_kind:input.content_mode==='growth_carousel'?'growth_carousel':'brand',growth_topic_type:input.content_mode==='growth_carousel'?effectiveType:null,content_mode:facts?'live_event':'prelaunch',content_pillar:facts?'event':'concept',generation_reason:effectiveProfile.label+' / editorial policy v'+CONTENT_POLICY_VERSION+(fallbackReason?' / safe fallback from '+requestedType:''),event_id:facts?.id||null,destination_url:facts?'https://roundy.team/events/'+facts.slug:'https://roundy.team'};
 ok(await db.from('marketing_generation_jobs').update({quality_report:patch.quality_report,result_snapshot:{...patch,draft_id:draft.id,images:[],research_notes:notes,saved_at:new Date().toISOString(),generation_recovery:recovery}}).eq('id',job.id));
 if(prepared.report.status!=='passed')throw new Error('품질 검토 필요: '+prepared.report.issues.join(' '));
 return patch;
}

export function draftQuality(draft:Row){
 const input={content_mode:draft.draft_kind==='growth_carousel'?'growth_carousel':draft.content_mode,topic_type:draft.growth_topic_type};
 const type=postType(input),document=draft.content_document;
 if(!document)return {version:3,status:'rejected' as const,issues:['이전 생성본에는 유형별 콘텐츠 구조가 없습니다. 같은 스레드에서 품질 재작업하세요.'],review_required:true};
 const report=evaluateContent({...document,caption:isCompactDocument(document)?document.caption:draft.caption,cta:draft.cta},type,draft.content_language||'ko',draft.research_sources||[]);if(isCompactDocument(document)){const issues=[...bilingualCaptionIssues(String(draft.caption||'')),...captionCtaIssues(document.caption,draft.cta)];report.issues.push(...issues);if(issues.length)report.status='rejected';}return report;
}

export function editorialCard(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){return renderCompactEditorial(slide,index,total,document,assets);}
export function editorialPhotoCover(slide:Row,encoded:string){return renderCompactEditorial({...slide,role:'cover'},0,1,{},{photo:'data:image/jpeg;base64,'+encoded});}
