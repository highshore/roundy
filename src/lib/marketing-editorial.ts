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
 const cacheKey=createHash('sha256').update(JSON.stringify([CONTENT_POLICY_VERSION,type,language,input.instruction||''])).digest('hex');
 if(profile.research){
  // Only the explicitly retried, identical request can reuse research. No silent new searches.
  const own=ok(await db.from('marketing_generation_jobs').select('retry_of_job_id').eq('id',job.id).single());
  const prior=own?.retry_of_job_id?ok(await db.from('marketing_generation_jobs').select('research_cache').eq('id',own.retry_of_job_id).maybeSingle()):null;
  const cache=prior?.research_cache;
  if(cache?.key===cacheKey&&Array.isArray(cache.sources)&&cache.sources.length&&Date.now()-Date.parse(cache.saved_at)<(type==='book_insight'?7:1)*86400000){sources=cache.sources;notes=cache.notes;}
  else{
   ok(await db.from('marketing_generation_jobs').update({stage:'researching'}).eq('id',job.id));
   const research=await call('responses',{model:MODEL,instructions:researchInstructions(type,language,input.instruction||''),input:type==='book_insight'?'Find one real published book about listening, conversation, communication, or adult relationships. Do not search for BookInsight software or products. Verify exact title and author first, then verify one specific idea from that book with separate evidence.':'Find the strongest primary evidence for this relationship or conversation topic. Verify paper or dataset identity, then sample/context and limitations.',tools:[{type:'web_search',search_context_size:'high',external_web_access:true}],tool_choice:'required',max_tool_calls:3,include:['web_search_call.action.sources'],max_output_tokens:2600,store:false},95000);
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

// Rendering is deterministic: typography, Roundy branding and contextual illustrations are chosen by semantic role.
const flex=(style:Row,...children:any[])=>h('div',{style:{display:'flex',...style}},...children);
function roundyMark(size=42,dark=false){
 const fg=dark?'#fffefa':'#20211f',accent='#ff6666',soft=dark?'#666a64':'#e7e7e7';
 return h('svg',{viewBox:'0 0 96 96',width:size,height:size,style:{display:'flex',flexShrink:0}},
  h('path',{d:'M22 40C28.6274 40 34 34.6274 34 28C34 21.3726 28.6274 16 22 16C15.3726 16 10 21.3726 10 28C10 34.6274 15.3726 40 22 40Z',fill:accent}),
  h('path',{d:'M67 85C73.6274 85 79 79.6274 79 73C79 66.3726 73.6274 61 67 61C60.3726 61 55 66.3726 55 73C55 79.6274 60.3726 85 67 85Z',fill:fg}),
  h('path',{d:'M11.4828 47C10.8635 52.1331 11.3613 57.252 12.9415 62.0016C14.5218 66.7512 17.1467 71.0176 20.6341 74.5051C24.1216 77.9925 28.388 80.6174 33.1376 82.1977C37.8872 83.7779 43.0061 84.2757 48.1392 83.6564',fill:'none',stroke:soft,strokeWidth:10,strokeLinecap:'round'}),
  h('path',{d:'M76.6564 54.8333C77.2756 49.7002 76.7779 44.5813 75.1976 39.8317C73.6174 35.0821 70.9925 30.8157 67.505 27.3282C64.0176 23.8408 59.7511 21.2159 55.0016 19.6356C50.252 18.0554 45.1331 17.5576 40 18.1769',fill:'none',stroke:soft,strokeWidth:10,strokeLinecap:'round'})
 );
}
function roundyLockup(size=42,dark=false){
 return flex({alignItems:'center',gap:12},roundyMark(size,dark),h('div',{style:{display:'flex',fontSize:Math.round(size*.72),fontWeight:700,letterSpacing:-1,color:dark?'#fffefa':'#20211f'}},'roundy'));
}
function visualMotif(type:string,role:string,dark=false){
 const bg=dark?'#32342f':'#f3f3ee',ink=dark?'#fffefa':'#20211f',accent='#ff6666',muted=dark?'#777b74':'#cfd2ca';
 const frame=(...children:any[])=>flex({width:220,height:170,borderRadius:28,background:bg,padding:24,alignItems:'center',justifyContent:'center',gap:14,flexShrink:0},...children);
 if(type==='book_insight')return frame(flex({flexDirection:'column',gap:8,alignItems:'stretch'},
  flex({width:126,height:34,background:accent,borderRadius:7}),
  flex({width:142,height:34,background:ink,borderRadius:7}),
  flex({width:112,height:34,background:muted,borderRadius:7})));
 if(type==='trend_research'||type==='dating_myth')return frame(
  ...[58,92,126].map((height,i)=>flex({width:32,height,alignSelf:'flex-end',background:i===2?accent:muted,borderRadius:'10px 10px 3px 3px'})),
  flex({width:20,height:20,borderRadius:999,background:ink,alignSelf:'flex-start'}));
 if(['conversation_prompt','mbti','dating_archetype','meme_remix'].includes(type))return frame(
  flex({width:88,height:62,borderRadius:'24px 24px 24px 6px',background:accent}),
  flex({width:82,height:58,borderRadius:'24px 24px 6px 24px',background:ink,marginTop:34}));
 if(type==='seoul_dating')return frame(
  ...[72,112,92,132,82].map((height,i)=>flex({width:24,height,alignSelf:'flex-end',background:i===3?accent:muted,borderRadius:'5px 5px 0 0'})));
 if(type==='mini_quiz')return frame(...['A','B','C'].map((label,i)=>flex({width:48,height:58,borderRadius:12,background:i===1?accent:muted,alignItems:'center',justifyContent:'center',fontSize:24,fontWeight:800,color:i===1?'#20211f':ink},label)));
 if(type==='live_event'||type==='prelaunch')return frame(
  flex({width:54,height:54,borderRadius:999,background:accent}),
  flex({width:92,height:8,borderRadius:999,background:muted}),
  flex({width:54,height:54,borderRadius:999,background:ink}));
 return role==='cover'?frame(flex({width:90,height:90,borderRadius:999,border:'12px solid '+accent}),flex({width:34,height:34,borderRadius:999,background:ink})):null;
}
function shouldShowMotif(role:string){return ['cover','book','event','practice','reflection','plan','question'].includes(role);}

export function editorialCard(slide:Row,index:number,total:number,document:Row){
 const role=slide.role||'',cover=role==='cover',cta=role==='cta',book=role==='book';
 const conversation=['example','opener','followup','listen','setup','punchline'].includes(role);
 const contrast=['contrast','options','checklist'].includes(role),evidence=['finding','context','limitation','insight'].includes(role);
 const dark=cta,ink=dark?'#fffefa':'#20211f',paper=dark?'#20211f':'#fffefa',accent='#ff6666';
 const box=(style:Row,...children:any[])=>flex(style,...children);
 const text=(value:string,size:number,style:Row={})=>box({fontSize:size,lineHeight:1.45,whiteSpace:'pre-wrap',wordBreak:'keep-all',...style},value);
 const title=String(slide.title||''),body=String(slide.body||''),highlight=String(slide.highlight||'');
 const source=String(slide.source_label||''),type=String(document.post_type||'');
 const motif=shouldShowMotif(role)?visualMotif(type,role,dark):null;
 const head=box({justifyContent:'space-between',alignItems:'center',gap:18},roundyLockup(38,dark),
  box({alignItems:'center',gap:16,color:dark?'#d8d9d5':'#686c64'},text(String(slide.eyebrow||role).toUpperCase(),20,{letterSpacing:2}),text(String(index+1).padStart(2,'0')+' / '+total,20)));
 let content:any;
 if(cover)content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:34},
  box({justifyContent:'space-between',alignItems:'center',gap:28},box({width:76,height:12,background:accent,borderRadius:6}),motif),
  text(title,title.length>48?68:title.length>32?80:96,{fontWeight:700,lineHeight:1.18,letterSpacing:-3,maxWidth:900}),
  text(body,35,{color:'#5c625b',maxWidth:820}),
  source?text(source,24,{paddingTop:20,borderTop:'2px solid #dedfd7'}):null);
 else if(book)content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:26},text(title,56,{fontWeight:700}),
  box({justifyContent:'space-between',alignItems:'center',gap:28},
   box({flex:1,borderLeft:'12px solid '+accent,background:'#f3f3ee',borderRadius:14,padding:40,flexDirection:'column',gap:16},text(document.book?.title||'',48,{fontWeight:700}),text(document.book?.author||'',27),text(document.book?.source_context||body,32)),
   motif),
  text(body,32),text('PARAPHRASED IDEA / NOT A DIRECT QUOTATION',19,{color:'#686c64'}));
 else if(cta)content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:38},roundyLockup(68,true),text(title,74,{fontWeight:700,lineHeight:1.2}),text(body,37),box({marginTop:16,padding:'23px 34px',background:accent,borderRadius:999,alignSelf:'flex-start',color:'#20211f'},text('@roundy.meet',32,{fontWeight:700})));
 else if(conversation)content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:32},text(title,58,{fontWeight:700,lineHeight:1.25}),
  box({background:role==='punchline'?'#ffe2df':'#f3f3ee',borderRadius:'36px 36px 36px 4px',padding:38,marginLeft:role==='followup'?90:0,flexDirection:'column',gap:18},highlight?text(highlight,41,{fontWeight:700}):null,text(body,36)),
  text(role==='punchline'?'THE PLOT TWIST':role==='example'?'A POSSIBLE CONVERSATION':'TRY SAYING IT OUT LOUD',21,{letterSpacing:2,color:'#686c64'}));
 else if(contrast)content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:26},text(title,60,{fontWeight:700}),
  ...(Array.isArray(slide.options)?slide.options:[]).map((option:string,i:number)=>box({padding:26,border:'2px solid #dedfd7',borderRadius:20,alignItems:'center',gap:20},text(String.fromCharCode(65+i),38,{fontWeight:700,color:'#a33939'}),text(option,32))),text(body,32));
 else content=box({flexDirection:'column',flex:1,justifyContent:'center',gap:28},
  motif?box({justifyContent:'flex-end'},motif):null,
  text(String(index).padStart(2,'0'),78,{fontWeight:700,color:accent}),text(title,60,{fontWeight:700,lineHeight:1.25}),
  highlight?text(highlight,38,{padding:28,background:'#f3f3ee',borderLeft:'7px solid '+accent,borderRadius:8,fontWeight:700}):null,
  text(body,35),evidence&&source?text(source,22,{color:'#686c64',paddingTop:10,borderTop:'2px solid #dedfd7'}):null);
 const footer=box({flexDirection:'column',gap:10,flexShrink:0,paddingTop:20,borderTop:'1px solid '+(dark?'#666':'#dedfd7')},
  !cover&&!book&&!evidence&&source?text(source,21):null,slide.footer_note?text(slide.footer_note,19):null,
  box({justifyContent:'space-between',alignItems:'center'},text('@roundy.meet',20),box({alignItems:'center',gap:10},roundyMark(24,dark),text('SEOUL / 1:1',20))));
 return new ImageResponse(box({width:'100%',height:'100%',flexDirection:'column',padding:72,background:paper,color:ink,fontFamily:'sans-serif'},head,content,footer),{width:1080,height:1350});
}

export function editorialPhotoCover(slide:Row,encoded:string){
 return new ImageResponse(h('div',{style:{display:'flex',width:'100%',height:'100%',position:'relative',background:'#20211f'}},
  h('img',{src:'data:image/jpeg;base64,'+encoded,style:{position:'absolute',width:'100%',height:'100%',objectFit:'cover'}}),
  h('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',padding:72,color:'#fffefa',background:'linear-gradient(0deg,rgba(15,18,15,.94),rgba(15,18,15,.08) 78%)'}},
   flex({justifyContent:'space-between',alignItems:'center'},roundyLockup(46,true),h('div',{style:{display:'flex',fontSize:22,letterSpacing:2}},'SEOUL / 1:1')),
   flex({flex:1}),
   h('div',{style:{display:'flex',fontSize:78,lineHeight:1.2,fontWeight:700,marginBottom:26,maxWidth:900}},String(slide?.title||'')),
   h('div',{style:{display:'flex',fontSize:34,lineHeight:1.5,maxWidth:840}},String(slide?.body||''))
  )),{width:1080,height:1350});
}
