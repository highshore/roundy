import {buildMarketingResearchTask,RESEARCH_TASK_VERSION} from './marketing-research-task';
import {captionCtaIssues,isCompactDocument,bilingualCaptionIssues} from './marketing-presentation';
import {renderCompactEditorial,type EditorialAssets} from './marketing-visuals';
import {createHash} from 'node:crypto';
import {createElement as h} from 'react';
import {ImageResponse} from 'next/og';
import {CONTENT_PROFILES,CONTENT_POLICY_VERSION,postType,contentSchema,researchInstructions,writingInstructions,extractResearchEvidence,prepareContent,evaluateContent,type Evidence,type Row} from './marketing-content-policy';

type Call=(endpoint:string,body:Row,timeout:number)=>Promise<Row>;
const ok=(r:any)=>{if(r.error)throw r.error;return r.data;};
const MODEL='gpt-4.1-mini';
export async function generateEditorialCopy(db:any,draft:Row,input:Row,job:Row,call:Call){
 const type=postType(input),profile=CONTENT_PROFILES[type],language=input.language==='en'?'en':'ko';
 let facts:Row|null=null;
 if(type==='live_event'){
  let q=db.from('events').select('id,slug,title,starts_at,venue,neighborhood,capacity,seats_remaining,price_gents,price_ladies').eq('status','live').is('deleted_at',null).gt('starts_at',new Date().toISOString());if(draft.event_id)q=q.eq('id',draft.event_id);
  facts=ok(await q.order('starts_at').limit(1).maybeSingle());if(!facts)throw new Error('게시 가능한 정식 이벤트가 없습니다. 이벤트 모집 대신 오픈 전 홍보를 선택하세요.');
 }
 let sources:Evidence[]=[],notes='',inputTokens=0,outputTokens=0;
 const record=async(result:Row)=>{inputTokens+=Number(result.usage?.input_tokens||result.usage?.prompt_tokens||0);outputTokens+=Number(result.usage?.output_tokens||result.usage?.completion_tokens||0);ok(await db.from('marketing_generation_jobs').update({input_tokens:inputTokens,output_tokens:outputTokens}).eq('id',job.id));};
 const researchTask=profile.research?buildMarketingResearchTask(type,input.instruction||'',language):'';
 const cacheKey=createHash('sha256').update(JSON.stringify([RESEARCH_TASK_VERSION,CONTENT_POLICY_VERSION,type,language,input.instruction||''])).digest('hex');
 if(profile.research){
  // Only the explicitly retried, identical request can reuse research. No silent new searches.
  const own=ok(await db.from('marketing_generation_jobs').select('retry_of_job_id').eq('id',job.id).single());
  const prior=own?.retry_of_job_id?ok(await db.from('marketing_generation_jobs').select('research_cache').eq('id',own.retry_of_job_id).maybeSingle()):null;
  const cache=prior?.research_cache;
  if(cache?.key===cacheKey&&cache.search_completed===true&&Array.isArray(cache.sources)&&cache.sources.length&&Date.now()-Date.parse(cache.saved_at)<(type==='book_insight'?7:1)*86400000){sources=cache.sources;notes=cache.notes;}
  else{
   ok(await db.from('marketing_generation_jobs').update({stage:'researching'}).eq('id',job.id));
   const research=await call('responses',{model:MODEL,instructions:researchInstructions(type,language,input.instruction||''),input:researchTask,tools:[{type:'web_search',search_context_size:'high',external_web_access:true}],tool_choice:'required',max_tool_calls:2,include:['web_search_call.action.sources'],max_output_tokens:2600,store:false},95000);
   await record(research);const evidence=extractResearchEvidence(research);sources=evidence.sources;notes=evidence.notes;
   const cached={key:cacheKey,saved_at:new Date().toISOString(),sources,notes,subject:researchTask,search_completed:evidence.completed&&sources.length>0};
   ok(await db.from('marketing_generation_jobs').update({research_cache:cached}).eq('id',job.id));
   if(!evidence.completed||!sources.length){
    const report={version:2,status:'rejected',issues:['실제 인용된 연구/책 출처를 확보하지 못했습니다. 출처 없는 게시물을 만들지 않고 중지했습니다.'],review_required:true};
    ok(await db.from('marketing_generation_jobs').update({quality_report:report,result_snapshot:{draft_id:draft.id,content_language:language,growth_topic_type:type,quality_report:report,research_notes:notes,research_sources:sources,images:[],carousel_slides:[],caption:''}}).eq('id',job.id));
    throw new Error(report.issues[0]);
   }
  }
  ok(await db.from('marketing_generation_jobs').update({research_cache:{key:cacheKey,saved_at:new Date().toISOString(),sources,notes,search_completed:true}}).eq('id',job.id));
 }
 // Writing is a separate bounded call with NO tools. Web search is never combined with JSON mode.
 const instructions=writingInstructions(type,language);
 const payload={editorial_type:type,language,direction:input.instruction||'',evidence:sources,event:facts};
 if(Buffer.byteLength(instructions+JSON.stringify(payload)+JSON.stringify(contentSchema(type,language)),'utf8')>24000)throw new Error('PROMPT_SIZE_LIMIT');
 const control=ok(await db.from('marketing_ai_control').select('enabled,blocked_reason').eq('singleton',true).single());
 if(!control.enabled||control.blocked_reason)throw new Error('AI_PAUSED');
 ok(await db.from('marketing_generation_jobs').update({stage:'writing'}).eq('id',job.id));
 const result=await call('chat/completions',{model:MODEL,temperature:.6,max_completion_tokens:4096,response_format:{type:'json_schema',json_schema:{name:'roundy_editorial_v2',strict:true,schema:contentSchema(type,language)}},messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(payload)}]},55000);
 await record(result);
 const choice=result.choices?.[0],raw=choice?.message?.content;
 ok(await db.from('marketing_generation_jobs').update({result_snapshot:{draft_id:draft.id,content_language:language,growth_topic_type:input.content_mode==='growth_carousel'?type:null,raw_content:typeof raw==='string'?raw.slice(0,24000):'',research_sources:sources,images:[],carousel_slides:[],caption:'',quality_report:{version:2,status:'unchecked',issues:[]}}}).eq('id',job.id));
 if(choice?.finish_reason!=='stop'||choice.message?.refusal||typeof raw!=='string')throw new Error('생성 결과가 끝까지 작성되지 않았습니다. 추가 API 호출 없이 응답을 보존했습니다.');
 let document:Row;try{document=JSON.parse(raw);}catch{throw new Error('생성 결과 형식이 유효하지 않습니다. 원문을 보존했으며 자동 재생성하지 않습니다.');}
 const prepared=prepareContent(document,type,language,sources);document=prepared.document;
 // Live-event facts come from the server, never from model guesses.
 if(facts){
  const eventCard=prepared.slides.find((s:Row)=>s.role==='event');
  if(eventCard){const factsText=[facts.title,new Date(facts.starts_at).toLocaleString(language==='ko'?'ko-KR':'en-GB',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.body=factsText;eventCard.body_ko=[facts.title,new Date(facts.starts_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.body_en=[new Date(facts.starts_at).toLocaleString('en-GB',{timeZone:'Asia/Seoul'})+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.source_label='Roundy에 등록된 행사 정보 / Published event';}
 }
 const patch={caption:prepared.caption,cta:prepared.cta,content_document:document,quality_report:prepared.report,carousel_slides:prepared.slides,research_sources:prepared.sources,research_status:profile.research?'generated':input.content_mode==='growth_carousel'?'generated':'not_required',content_language:language,draft_kind:input.content_mode==='growth_carousel'?'growth_carousel':'brand',growth_topic_type:input.content_mode==='growth_carousel'?type:null,content_mode:facts?'live_event':'prelaunch',content_pillar:facts?'event':'concept',generation_reason:profile.label+' / editorial policy v'+CONTENT_POLICY_VERSION,event_id:facts?.id||null,destination_url:facts?'https://roundy.team/events/'+facts.slug:'https://roundy.team'};
 ok(await db.from('marketing_generation_jobs').update({quality_report:prepared.report,result_snapshot:{...patch,draft_id:draft.id,images:[],saved_at:new Date().toISOString()}}).eq('id',job.id));
 if(prepared.report.status!=='passed')throw new Error('품질 검토 필요: '+prepared.report.issues.join(' '));
 return patch;
}

export function draftQuality(draft:Row){
 const input={content_mode:draft.draft_kind==='growth_carousel'?'growth_carousel':draft.content_mode,topic_type:draft.growth_topic_type};
 const type=postType(input),document=draft.content_document;
 if(!document)return {version:2,status:'rejected' as const,issues:['이전 생성본에는 유형별 콘텐츠 구조가 없습니다. 같은 스레드에서 품질 재작업하세요.'],review_required:true};
 const report=evaluateContent({...document,caption:isCompactDocument(document)?document.caption:draft.caption,cta:draft.cta},type,draft.content_language||'ko',draft.research_sources||[]);if(isCompactDocument(document)){const issues=[...bilingualCaptionIssues(String(draft.caption||'')),...captionCtaIssues(document.caption,draft.cta)];report.issues.push(...issues);if(issues.length)report.status='rejected';}return report;
}

// All typography, official logo paths, source footnotes and contact details are server rendered.
export function editorialCard(slide:Row,index:number,total:number,document:Row,assets:EditorialAssets={}){return renderCompactEditorial(slide,index,total,document,assets);}
export function editorialPhotoCover(slide:Row,encoded:string){return renderCompactEditorial({...slide,role:'cover'},0,1,{},{photo:'data:image/jpeg;base64,'+encoded});}
