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
 const cacheKey=createHash('sha256').update(JSON.stringify([2,type,language,input.instruction||''])).digest('hex');
 if(profile.research){
  // Only the explicitly retried, identical request can reuse research. No silent new searches.
  const own=ok(await db.from('marketing_generation_jobs').select('retry_of_job_id').eq('id',job.id).single());
  const prior=own?.retry_of_job_id?ok(await db.from('marketing_generation_jobs').select('research_cache').eq('id',own.retry_of_job_id).maybeSingle()):null;
  const cache=prior?.research_cache;
  if(cache?.key===cacheKey&&Array.isArray(cache.sources)&&cache.sources.length&&Date.now()-Date.parse(cache.saved_at)<(type==='book_insight'?7:1)*86400000){sources=cache.sources;notes=cache.notes;}
  else{
   ok(await db.from('marketing_generation_jobs').update({stage:'researching'}).eq('id',job.id));
   const research=await call('responses',{model:MODEL,instructions:researchInstructions(type,language,input.instruction||''),input:'Return a concise source-grounded research brief for '+type+'.',tools:[{type:'web_search',search_context_size:'low'}],tool_choice:'required',max_tool_calls:1,include:['web_search_call.action.sources'],max_output_tokens:1400,store:false},65000);
   await record(research);const evidence=extractResearchEvidence(research);sources=evidence.sources;notes=evidence.notes;
   const cached={key:cacheKey,saved_at:new Date().toISOString(),sources,notes,search_completed:evidence.completed};
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
 if(Buffer.byteLength(instructions+JSON.stringify(payload)+JSON.stringify(contentSchema(type)),'utf8')>24000)throw new Error('PROMPT_SIZE_LIMIT');
 const control=ok(await db.from('marketing_ai_control').select('enabled,blocked_reason').eq('singleton',true).single());
 if(!control.enabled||control.blocked_reason)throw new Error('AI_PAUSED');
 ok(await db.from('marketing_generation_jobs').update({stage:'writing'}).eq('id',job.id));
 const result=await call('chat/completions',{model:MODEL,temperature:.6,max_completion_tokens:4096,response_format:{type:'json_schema',json_schema:{name:'roundy_editorial_v2',strict:true,schema:contentSchema(type)}},messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(payload)}]},55000);
 await record(result);
 const choice=result.choices?.[0],raw=choice?.message?.content;
 ok(await db.from('marketing_generation_jobs').update({result_snapshot:{draft_id:draft.id,content_language:language,growth_topic_type:input.content_mode==='growth_carousel'?type:null,raw_content:typeof raw==='string'?raw.slice(0,24000):'',research_sources:sources,images:[],carousel_slides:[],caption:'',quality_report:{version:2,status:'unchecked',issues:[]}}}).eq('id',job.id));
 if(choice?.finish_reason!=='stop'||choice.message?.refusal||typeof raw!=='string')throw new Error('생성 결과가 끝까지 작성되지 않았습니다. 추가 API 호출 없이 응답을 보존했습니다.');
 let document:Row;try{document=JSON.parse(raw);}catch{throw new Error('생성 결과 형식이 유효하지 않습니다. 원문을 보존했으며 자동 재생성하지 않습니다.');}
 const prepared=prepareContent(document,type,language,sources);
 // Live-event facts come from the server, never from model guesses.
 if(facts){
  const eventCard=prepared.slides.find((s:Row)=>s.role==='event');
  if(eventCard){eventCard.body=[facts.title,new Date(facts.starts_at).toLocaleString(language==='ko'?'ko-KR':'en-GB',{timeZone:'Asia/Seoul'} )+' KST',facts.venue||facts.neighborhood].filter(Boolean).join('\n');eventCard.source_label=language==='ko'?'관리자가 등록한 정식 이벤트':'Published Roundy event';}
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
 return evaluateContent({...document,caption:draft.caption,cta:draft.cta},type,draft.content_language||'ko',draft.research_sources||[]);
}

// Rendering is deterministic: typography/composition are chosen by semantic role, not another AI call.
export function editorialCard(slide:Row,index:number,total:number,document:Row){
 const role=slide.role||'',cover=role==='cover',cta=role==='cta',book=role==='book';
 const conversation=['example','opener','followup','listen','setup','punchline'].includes(role);
 const contrast=['contrast','options','checklist'].includes(role),evidence=['finding','context','limitation','insight'].includes(role);
 const dark=cta,ink=dark?'#fffefa':'#20211f',paper=dark?'#20211f':'#fffefa',accent='#ff6666';
 const box=(style:Row,...children:any[])=>h('div',{style:{display:'flex',...style}},...children);
 const text=(value:string,size:number,style:Row={})=>box({fontSize:size,lineHeight:1.45,whiteSpace:'pre-wrap',wordBreak:'keep-all',...style},value);
 const title=String(slide.title||''),body=String(slide.body||''),highlight=String(slide.highlight||'');
 const source=String(slide.source_label||'');
 const head=box({justifyContent:'space-between',alignItems:'center',fontSize:24,letterSpacing:2},text(cover?'ROUNDY NOTES':String(slide.eyebrow||role).toUpperCase(),24),text(String(index+1).padStart(2,'0')+' / '+total,24));
 let content:any;
 if(cover)content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:40},
  box({width:76,height:12,background:accent,borderRadius:6}),
  text(title,title.length>48?70:title.length>32?82:100,{fontWeight:700,lineHeight:1.18,letterSpacing:-3}),
  text(body,36,{color:'#5c625b',maxWidth:790}),
  source?text(source,25,{paddingTop:22,borderTop:'2px solid #dedfd7'}):null,
  text(document.post_type==='book_insight'?'BOOK → CONVERSATION':'ONE IDEA. A BETTER CONVERSATION.',22,{marginTop:18,letterSpacing:2,color:'#686c64'}));
 else if(book)content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:30},text(title,58,{fontWeight:700}),
  box({borderLeft:'12px solid '+accent,background:'#f3f3ee',borderRadius:14,padding:44,flexDirection:'column',gap:18},text(document.book?.title||'',52,{fontWeight:700}),text(document.book?.author||'',28),text(document.book?.source_context||body,34)),
  text(body,34),text('PARAPHRASED IDEA / NOT A DIRECT QUOTATION',20,{color:'#686c64'}));
 else if(cta)content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:42},text('roundy',52,{fontWeight:700,color:accent}),text(title,76,{fontWeight:700,lineHeight:1.2}),text(body,38),box({marginTop:20,padding:'25px 36px',background:accent,borderRadius:999,alignSelf:'flex-start',color:'#20211f'},text('@roundy.meet',34,{fontWeight:700})));
 else if(conversation)content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:34},text(title,60,{fontWeight:700,lineHeight:1.25}),
  box({background:role==='punchline'?'#ffe2df':'#f3f3ee',borderRadius:'36px 36px 36px 4px',padding:40,marginLeft:role==='followup'?90:0,flexDirection:'column',gap:20},highlight?text(highlight,43,{fontWeight:700}):null,text(body,38)),
  text(role==='punchline'?'THE PLOT TWIST':role==='example'?'A POSSIBLE CONVERSATION':'TRY SAYING IT OUT LOUD',22,{letterSpacing:2,color:'#686c64'}));
 else if(contrast)content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:28},text(title,62,{fontWeight:700}),
  ...(Array.isArray(slide.options)?slide.options:[]).map((option:string,i:number)=>box({padding:28,border:'2px solid #dedfd7',borderRadius:20,alignItems:'center',gap:22},text(String.fromCharCode(65+i),40,{fontWeight:700,color:'#a33939'}),text(option,34))),text(body,34));
 else content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:32},
  text(String(index).padStart(2,'0'),86,{fontWeight:700,color:accent}),text(title,62,{fontWeight:700,lineHeight:1.25}),
  highlight?text(highlight,40,{padding:30,background:'#f3f3ee',borderLeft:'7px solid '+accent,borderRadius:8,fontWeight:700}):null,
  text(body,37),evidence&&source?text(source,23,{color:'#686c64',paddingTop:12,borderTop:'2px solid #dedfd7'}):null);
 const footer=box({flexDirection:'column',gap:12,flexShrink:0,paddingTop:22,borderTop:'1px solid '+(dark?'#666':'#dedfd7')},
  !cover&&!book&&!evidence&&source?text(source,22):null,slide.footer_note?text(slide.footer_note,20):null,
  box({justifyContent:'space-between'},text('@roundy.meet',22),text('SEOUL / 1:1',22)));
 return new ImageResponse(box({width:'100%',height:'100%',flexDirection:'column',padding:72,background:paper,color:ink,fontFamily:'sans-serif'},head,content,footer),{width:1080,height:1350});
}

export function editorialPhotoCover(slide:Row,encoded:string){
 return new ImageResponse(h('div',{style:{display:'flex',width:'100%',height:'100%',position:'relative',background:'#20211f'}},
  h('img',{src:'data:image/jpeg;base64,'+encoded,style:{position:'absolute',width:'100%',height:'100%',objectFit:'cover'}}),
  h('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',justifyContent:'flex-end',padding:72,color:'#fffefa',background:'linear-gradient(0deg,rgba(15,18,15,.93),rgba(15,18,15,.15) 85%)'}},
   h('div',{style:{display:'flex',fontSize:27,letterSpacing:3,marginBottom:28}},'ROUNDY / SEOUL'),
   h('div',{style:{display:'flex',fontSize:80,lineHeight:1.2,fontWeight:700,marginBottom:28}},String(slide?.title||'')),
   h('div',{style:{display:'flex',fontSize:35,lineHeight:1.5}},String(slide?.body||''))
  )),{width:1080,height:1350});
}
