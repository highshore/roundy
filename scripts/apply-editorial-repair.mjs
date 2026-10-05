import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
function once(s,from,to){if(!s.includes(from))throw new Error('Patch anchor missing: '+from.slice(0,100));return s.replace(from,()=>to);}
function region(s,start,end,replacement){const a=s.indexOf(start),b=s.indexOf(end,a);if(a<0||b<0)throw new Error('Missing region '+start);return s.slice(0,a)+replacement+s.slice(b);}
let gen=read('src/lib/marketing-generation.ts');
if(gen.includes('EDITORIAL_V2_INTEGRATED')){console.log('Patch already integrated');process.exit(0);}
gen=once(gen,"import sharp from 'sharp';","import sharp from 'sharp';\nimport {generateEditorialCopy,draftQuality,editorialCard,editorialPhotoCover} from './marketing-editorial';\n// EDITORIAL_V2_INTEGRATED");
gen=once(gen,"new Set(['book_insight','trend_research','meme_remix'])","new Set(['book_insight','trend_research','dating_myth'])");
gen=once(gen,"if(v.topic_type!==undefined&&!topics.includes(v.topic_type))","if(v.topic_type!=null&&!topics.includes(v.topic_type))");
gen=region(gen,'async function generateCopy(','async function savePartial(',`async function generateCopy(db:DB,draft:Row,input:GenerationInput,job:Row,_research:boolean){
 return generateEditorialCopy(db,draft,input,job,upstream);
}
`);
gen=region(gen,'async function renderCards(','async function generatePhoto(',`async function renderCards(db:DB,draft:Row,job:Row){
 const cards=draft.carousel_slides||[];
 if(!draft.content_document||!cards.length||cards.length>6)throw new Error('유형별 카드 문구가 없습니다. 품질 재작업 후 렌더하세요.');
 const urls:string[]=[];
 for(let i=0;i<cards.length;i++){
  await progress(db,job,'rendering_'+(i+1)+'_of_'+cards.length);
  const image=editorialCard(cards[i],i,cards.length,draft.content_document);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{const bytes=await Promise.race([image.arrayBuffer(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('CARD_RENDER_TIMEOUT')),20000);})]);
   urls.push(await storeImage(db,job,await sharp(Buffer.from(bytes)).jpeg({quality:88}).toBuffer(),i));
  }finally{if(timer)clearTimeout(timer);}
 }
 return urls;
}
`);
gen=once(gen,"await progress(db,job,'saving_photo');return [await storeImage(db,job,Buffer.from(encoded,'base64'),0)];",`await progress(db,job,'saving_photo');
 const cover=editorialPhotoCover(draft.carousel_slides[0],encoded);
 const jpeg=await sharp(Buffer.from(await cover.arrayBuffer())).jpeg({quality:88}).toBuffer();
 return [await storeImage(db,job,jpeg,0)];`);
gen=once(gen,"let draft=await readDraft(db,draftId);",`let draft=await readDraft(db,draftId);
 // Verify the schema before reserving or calling any provider.
 checked(await db.from('instagram_post_drafts').select('content_document,quality_report,quality_revision').eq('id',draftId).single());
 if(input.mode==='image'){const q=draftQuality(draft);if(q.status!=='passed')throw new Error('품질 검토 필요: '+q.issues.join(' '));}`);
gen=once(gen,"if(!reservation.accepted)return {draft,job,deduplicated:true};\n try{","if(!reservation.accepted)return {draft,job,deduplicated:true};\n let contentQuality:Row|null=null;\n try{");
gen=once(gen,"const copy=await generateCopy(db,draft,input,job,research);await progress(db,job,'saving_copy');","const copy=await generateCopy(db,draft,input,job,research);contentQuality=copy.quality_report;await progress(db,job,'saving_copy');");
gen=once(gen,"  const resultSnapshot={",`  const quality=contentQuality||draftQuality(draft);
  if(quality.status!=='passed')throw new Error('품질 검토 필요: '+quality.issues.join(' '));
  draft=checked(await db.rpc('set_marketing_quality',{p_draft:draft.id,p_revision:draft.revision,p_report:quality})).data as Row;
  const resultSnapshot={
   content_document:draft.content_document,quality_report:quality,quality_revision:draft.revision,`);
gen=once(gen,"update({status:'completed',stage:'complete',result_snapshot:resultSnapshot,","update({status:'completed',stage:'complete',quality_report:quality,result_snapshot:resultSnapshot,");
gen=once(gen,"automatic_photos:false,retries:0","automatic_photos:false,retries:0,content_policy_version:2,research_reservation_usd:0.05");
write('src/lib/marketing-generation.ts',gen);

let editorial=read('src/lib/marketing-editorial.ts');
editorial+=`
export function editorialPhotoCover(slide:Row,encoded:string){
 return new ImageResponse(h('div',{style:{display:'flex',width:'100%',height:'100%',position:'relative',background:'#20211f'}},
  h('img',{src:'data:image/jpeg;base64,'+encoded,style:{position:'absolute',width:'100%',height:'100%',objectFit:'cover'}}),
  h('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',justifyContent:'flex-end',padding:72,color:'#fffefa',background:'linear-gradient(0deg,rgba(15,18,15,.93),rgba(15,18,15,.15) 85%)'}},
   h('div',{style:{display:'flex',fontSize:27,letterSpacing:3,marginBottom:28}},'ROUNDY / SEOUL'),
   h('div',{style:{display:'flex',fontSize:80,lineHeight:1.2,fontWeight:700,marginBottom:28}},String(slide?.title||'')),
   h('div',{style:{display:'flex',fontSize:35,lineHeight:1.5}},String(slide?.body||''))
  )),{width:1080,height:1350});
}
`;
write('src/lib/marketing-editorial.ts',editorial);

let api=read('src/lib/marketing.ts');
api=once(api,"import { randomUUID } from 'node:crypto';","import { randomUUID } from 'node:crypto';\nimport {draftQuality} from './marketing-editorial';");
api=once(api," const id=path[0],service=createServiceRoleClient();",` const id=path[0],service=createServiceRoleClient();
 if(id==='quality'&&path[1]==='recheck'&&path.length===2&&req.method==='POST'){
  const body=await req.json();if(!uuid(body.draft_id||'')||!Number.isInteger(body.revision))return json({error:'INVALID_REVIEW_REQUEST'},400);
  const d=checked(await service.from('instagram_post_drafts').select('*').eq('id',body.draft_id).single());
  if(d.revision!==body.revision)return json({error:'DRAFT_CHANGED_REFRESH_FIRST'},409);
  const report=draftQuality(d),draft=checked(await service.rpc('set_marketing_quality',{p_draft:d.id,p_revision:d.revision,p_report:report}));
  return json({draft,quality_report:report});
 }
 if(id==='generation'&&path[1]==='jobs'&&path.length===4&&uuid(path[2])&&path[3]==='reject'&&req.method==='POST'){
  const body=await req.json();if(body.confirm_reject!==true)return json({error:'REJECT_CONFIRMATION_REQUIRED'},400);
  const result=checked(await service.rpc('reject_marketing_content',{p_job:path[2],p_reason:typeof body.reason==='string'?body.reason.slice(0,500):'관리자 품질 검토에서 재작업 요청'}));
  return json(result);
 }
`);
write('src/lib/marketing.ts',api);

let ui=read('src/components/admin-marketing.tsx');
ui=once(ui,"import { OrderedImages } from './ordered-images';","import { OrderedImages } from './ordered-images';\nimport {CONTENT_PROFILES,postType} from '@/lib/marketing-content-policy';");
ui=once(ui,"photo?(mode==='both'?'$0.07':'$0.05'):'$0.02'","photo?(mode==='both'?'$0.07':'$0.05'):basis==='growth_carousel'&&['book_insight','trend_research','dating_myth'].includes(topic)?'$0.05':'$0.02'");
ui=once(ui,"job.operation==='copy_photo'?0.07:0.02","job.operation==='copy_photo'?0.07:job.operation==='research'?0.05:0.02");
ui=once(ui,"const status=attempts.some((a:Row)=>a.status==='completed')?'completed':latest.status;","const status=latest.quality_report?.status==='rejected'?'failed':latest.status;");
ui=once(ui,"a.status==='completed'&&a.result_snapshot","a.result_snapshot");
ui=once(ui,"setResultPreview({thread,attempt,snapshot:attempt.result_snapshot});","setResultPreview({thread,attempt,snapshot:attempt.result_snapshot});");
const renderAnchor="    {draft.status==='needs_approval'&&<fieldset disabled={busy||!!running}";
ui=once(ui,renderAnchor,`    <div className="marketing-quality-status" role="status">
     <strong>{draft.quality_report?.status==='passed'?t('Automated checks passed — editorial review still required','자동 검사 통과 — 내용 검토 후 승인'):t('Quality review required — publishing is blocked','품질 검토 필요 — 게시가 차단되어 있습니다')}</strong>
     {(draft.quality_report?.issues||[]).map((issue:string)=><p key={issue}>{issue}</p>)}
     {draft.status==='needs_approval'&&<button type="button" className="admin-secondary" disabled={busy||!!running||dirty} onClick={()=>void work(async()=>{const r=await request('/quality/recheck',{draft_id:draft.id,revision:draft.revision});if(!r.ok)throw new Error(r.data.error);selectDraft(r.data.draft);setNotice(t('Quality check finished. No AI request was made.','품질 검사를 마쳤습니다. AI를 호출하지 않았습니다.'));})}>{t('Recheck saved edits — no AI charge','저장한 내용 품질 검사 — AI 비용 없음')}</button>}
    </div>
${renderAnchor}`);
const disabled="disabled={busy||!!running||dirty||!draft.caption?.trim()||!draft.images?.length}";
if(!ui.includes(disabled))throw new Error('Publish button anchor missing');
ui=ui.split(disabled).join("disabled={busy||!!running||dirty||!draft.caption?.trim()||!draft.images?.length||draft.quality_report?.status!=='passed'||draft.quality_revision!==draft.revision}");
ui=once(ui,"{basis==='growth_carousel'&&['book_insight','trend_research','meme_remix'].includes(topic)&&<p>{t('At most one web search. Unverified claims are rejected, not regenerated.','웹 검색은 최대 1회입니다. 출처 검증에 실패하면 재생성하지 않고 중지합니다.')}</p>}",`{basis==='growth_carousel'&&<p className="admin-help">{CONTENT_PROFILES[postType({content_mode:basis,topic_type:topic})].label}: {CONTENT_PROFILES[postType({content_mode:basis,topic_type:topic})].roles.join(' → ')}</p>}
     {basis==='growth_carousel'&&['book_insight','trend_research','dating_myth'].includes(topic)&&<p>{t('One source search, then one structured writing request. Identical retries can reuse saved research. Missing citations block publishing.','출처 검색 1회 후 구조화된 문구 작성 1회로 처리합니다. 같은 설정의 재시도는 저장된 조사를 재사용합니다. 출처가 없으면 게시할 수 없습니다.')}</p>}`);
ui=once(ui,"{thread.status==='completed'&&<button type=\"button\" className=\"admin-primary\" onClick={e=>{e.preventDefault();openThreadResult(thread);}}>","{attempts.some((a:Row)=>a.result_snapshot)&&<button type=\"button\" className=\"admin-primary\" onClick={e=>{e.preventDefault();openThreadResult(thread);}}>");
ui=once(ui,"{t('View result','결과 보기')}","{t('View result / review notes','결과 및 검토 내용 보기')}");
ui=once(ui,"    <div className=\"marketing-result-copy\"><strong>",`    {(resultPreview.attempt.quality_report||resultPreview.snapshot.quality_report)&&<div className="marketing-quality-status"><strong>{t('Quality review','품질 검토')}</strong>{((resultPreview.attempt.quality_report||resultPreview.snapshot.quality_report).issues||[]).map((issue:string)=><p key={issue}>{issue}</p>)}</div>}
    {resultPreview.snapshot.content_document?.book?.title&&<p>{resultPreview.snapshot.content_document.book.title} / {resultPreview.snapshot.content_document.book.author}</p>}
    <div className="marketing-result-copy"><strong>`);
ui=once(ui,"    <div className=\"admin-form-actions\"><button type=\"button\" className=\"admin-primary\" disabled={busy} onClick={()=>void restoreResultToDraft()}",`    {resultPreview.attempt.status==='completed'&&<button type="button" className="admin-secondary" disabled={busy} onClick={()=>{if(window.confirm(t('Reject this result for quality and enable rework in the same thread?','이 결과를 품질 불합격 처리하고 같은 스레드에서 재작업할까요?')))void work(async()=>{const r=await request('/generation/jobs/'+resultPreview.attempt.id+'/reject',{confirm_reject:true});if(!r.ok)throw new Error(r.data.error);setResultPreview(null);await load(draft?.id);setActiveTab('generation');});}}>{t('Reject quality / request rework','품질 불합격 및 재작업 요청')}</button>}
    <div className="admin-form-actions"><button type="button" className="admin-primary" disabled={busy||resultPreview.attempt.status!=='completed'||resultPreview.attempt.quality_report?.status==='rejected'} onClick={()=>void restoreResultToDraft()}`);
write('src/components/admin-marketing.tsx',ui);
write('src/app/globals.css',read('src/app/globals.css')+'\n.marketing-quality-status{display:grid;gap:9px;padding:16px;border:1px solid var(--border);border-radius:14px;background:var(--surface);font-size:13px;line-height:1.6}.marketing-quality-status strong{font-size:14px}.marketing-quality-status p{margin:0}\n');

// Existing guard regressions are retained as runtime assertions, not string-presence checks.
write('scripts/marketing-fixtures.cjs',`exports.fixture=(type,language,profiles)=>{
 const ko=language==='ko';
 const titles={cover:ko?'질문은 많은데 왜 대화는 멀어질까?':'Why do good questions still feel like an interview?',concept:'Make room for one real story',event:'The meeting details',book:'The idea behind the conversation',insight:'Understanding before answering',example:'A small response that opens a door',practice:'Try one pause on your next meeting',finding:'What the study actually observed',context:'Who took part and what was measured',limitation:'One result does not explain everyone',scenario:'When a quick answer leaves a quiet room',contrast:'Two styles without a better or worse',reflection:'Notice what helps you feel heard',setup:'The opening line sounded perfect',punchline:'Then the conversation became a questionnaire',perspective:'A quiet moment is not a failure',myth:'The belief we often repeat',opener:'Start with something they can choose',followup:'Follow the part they light up about',listen:'Show that you heard their answer',etiquette:'Let comfort set the pace',plan:'Agree on a simple public meeting point',checklist:'A few things to check before leaving',question:'Which response sounds most like you?',options:'Choose the answer you recognise',reveal:'What each answer might express',cta:'Take the conversation offline'};
 const bodies={cover:ko?'잘 묻는 것보다 상대의 답을 머물게 하는 방법.':'A little less interviewing, a little more listening.',concept:'A short, face-to-face exchange gives a single story room to unfold instead of competing with a room full of voices.',event:'The host shares the confirmed place and time; check the actual event page before making plans.',book:'Listening Across Difference by Alex Lee explores attention in everyday conversation. This is a paraphrase, not a quotation.',insight:'Pause before preparing your answer. In this test fixture the supported idea is that careful attention creates room to understand another perspective.',example:'They mention a weekend walk. Rather than switching to your own plans, ask what they noticed along the way.',practice:'Leave a brief pause after an answer. Choose one detail to ask about, instead of moving directly to your next topic.',finding:'The study in this test fixture observed a relationship between attentive follow-up questions and how a conversation was rated.',context:'These observations came from a particular group and setting, rather than from every relationship or culture.',limitation:'An association does not establish cause, and a controlled conversation cannot capture the whole of a real relationship.',scenario:'Someone takes a moment to answer while their partner fills every pause. Neither response necessarily reveals how interested they are.',contrast:'One person thinks aloud; another needs a moment to decide what to share. Both can make space for the other.',reflection:'Think about a recent exchange where you felt heard. Which response made it easier for you to keep talking?',setup:'You arrived with three excellent opening questions and decided to use them all in the first minute.',punchline:'The other person is now waiting to hear whether they passed the first-round interview.',perspective:'A shared smile can reset the rhythm. There is no need to turn a first meeting into a performance.',myth:'People sometimes assume a polished opening line determines whether a conversation will go well.',opener:'What made you smile this week? Give them room to choose something small or meaningful.',followup:'What was your favourite part of that? Use the detail they offered rather than introducing a completely new topic.',listen:'Acknowledge what mattered to them before sharing your own experience. Attention does not require a perfect reply.',etiquette:'Keep a first meeting comfortable by choosing a public setting and respecting a decision not to share personal details.',plan:'Suggest a simple plan and confirm it together. Avoid assuming the other person knows a neighbourhood or has the same schedule.',checklist:'Confirm the meeting details, leave enough travel time and let the other person know when plans change.',question:'When someone tells you a story, what do you usually do before giving advice?',options:'There is no correct score here. Pick the response closest to your usual reaction, not an ideal version of yourself.',reveal:'Asking for more detail may show curiosity; pausing may give room. Either can be useful depending on what the other person needs.',cta:'Meet thoughtfully in Seoul, one conversation at a time. Follow Roundy for English-only 1:1 mingle updates.'};
 const roles=profiles[type].roles;
 const factual=type==='book_insight'?['book','insight']:['finding','context','limitation'];
 return {schema_version:2,post_type:type,caption:ko?'첫 만남의 질문을 조금 다르게 바라보세요. 상대의 답에 머무를 시간을 주는 것이 오늘의 작은 실천입니다.':'Give a first conversation room to unfold. Notice the answer before deciding what to ask next.',cta:ko?'Roundy의 다음 소식을 확인하세요.':'Follow for the next Roundy update.',book:type==='book_insight'?{title:'Listening Across Difference',author:'Alex Lee',source_id:'S1',source_context:ko?'주의 깊게 듣는다는 아이디어를 첫 대화에 적용해 재구성했습니다.':'A paraphrased idea applied to a first conversation.'}:{title:'',author:'',source_id:'',source_context:''},slides:roles.map(role=>({role,eyebrow:role.toUpperCase(),title:titles[role],body:bodies[role],highlight:'',options:['options','contrast','checklist'].includes(role)?['Pause and listen','Ask a follow-up']:[],source_ids:profiles[type].research&&factual.includes(role)?['S1']:[]}))};
};
`);
write('scripts/test-marketing-generation.mjs',`import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),{fixture}=require('./marketing-fixtures.cjs');
let checks=0;const check=(f)=>{f();checks++;};
const id='4b9066d0-e01b-4cc4-92d1-469f56317a04';
const base={request_key:'manual:quality-test-001',revision:1,mode:'both',content_mode:'prelaunch',language:'en',visual_mode:'cards',instruction:''};
function harness({denied=false,network=false,badSources=false,duplicate=false,photo403=false}={}){
 const tables={instagram_post_drafts:[{id,status:'needs_approval',revision:1,caption:'Original',cta:'Follow',images:[],carousel_slides:[],content_mode:'prelaunch'}],marketing_generation_jobs:[],marketing_ai_control:[{singleton:true,enabled:true,blocked_reason:null}],events:[{id:'event-fixture',slug:'fixture',title:'Fixture event',status:'live',deleted_at:null,starts_at:'2099-12-01T10:00:00Z',venue:'Fixture public venue'}]};
 const requests=[],stored=[];
 class Q{
  constructor(t){this.rows=tables[t]||[];this.pred=[];this.patch=null;this.n=Infinity;}
  select(){return this;}update(p){this.patch=p;return this;}eq(k,v){this.pred.push(r=>r[k]===v);return this;}gt(k,v){this.pred.push(r=>r[k]>v);return this;}gte(k,v){this.pred.push(r=>r[k]>=v);return this;}is(k,v){return this.eq(k,v);}in(k,v){this.pred.push(r=>v.includes(r[k]));return this;}order(){return this;}limit(n){this.n=n;return this;}single(){return this.exec(true);}maybeSingle(){return this.exec(true);}then(a,b){return this.exec().then(a,b);}
  exec(single=false){const rows=this.rows.filter(r=>this.pred.every(p=>p(r))).slice(0,this.n);if(this.patch)rows.forEach(r=>Object.assign(r,this.patch));return Promise.resolve({data:structuredClone(single?rows[0]||null:rows),error:null});}
 }
 const db={from:t=>new Q(t),rpc:async(name,p)=>{
  if(name==='set_marketing_quality'){const d=tables.instagram_post_drafts[0];if(d.revision!==p.p_revision)return {error:{message:'DRAFT_CHANGED_REFRESH_FIRST'}};Object.assign(d,{quality_report:p.p_report,quality_revision:d.revision});return {data:structuredClone(d),error:null};}
  if(denied)return {error:{message:'GENERATION_BUDGET_REACHED'}};
  const old=tables.marketing_generation_jobs.find(j=>j.request_key===p.p_key);if(old)return {data:{accepted:false,job:structuredClone(old)},error:null};
  const job={id:'12345678-1234-1234-1234-'+String(tables.marketing_generation_jobs.length+1).padStart(12,'0'),draft_id:p.p_draft,request_key:p.p_key,status:'running',created_at:new Date().toISOString(),reserved_usd:p.p_operation==='render'?0:p.p_operation==='research'?.05:.02,operation:p.p_operation};tables.marketing_generation_jobs.push(job);return {data:{accepted:true,job:structuredClone(job)},error:null};
 },storage:{from:()=>({upload:async(path,bytes)=>{stored.push({path,bytes});return {error:null};},getPublicUrl:path=>({data:{publicUrl:'https://storage.example/'+path}})})}};
 const cache={};
 function load(file){if(cache[file])return cache[file];const context={exports:{},Buffer,URL,AbortSignal,Intl,Date,console,setTimeout,clearTimeout,process:{env:{OPENAI_API_KEY:'mock-only'}},require:name=>{
  if(name==='server-only')return {};if(name==='./supabase/service')return {createServiceRoleClient:()=>db};
  if(name==='react')return {createElement:(tag,props,...children)=>({tag,props,children})};
  if(name==='next/og')return {ImageResponse:class{constructor(tree){this.tree=tree;}arrayBuffer(){return Promise.resolve(Buffer.from(JSON.stringify(this.tree)));}}};
  if(name==='sharp')return bytes=>({jpeg:()=>({toBuffer:async()=>Buffer.from(bytes)})});
  if(name.startsWith('./marketing-'))return load('src/lib/'+name.slice(2)+'.ts');return require(name);
 },fetch:async(url,init)=>{
  const body=JSON.parse(init.body);requests.push({url,body});if(network)throw new Error('timeout');
  if(url.endsWith('images/generations'))return photo403?{ok:false,status:403,json:async()=>({error:{message:'Verify organization'}})}:{ok:true,json:async()=>({data:[{b64_json:Buffer.alloc(200).toString('base64')}]})};
  if(url.endsWith('/responses')){const notes='Listening Across Difference by Alex Lee explains attentive listening. Published by Fixture Press. This research fixture observes association, not causation, in a limited sample.';return {ok:true,json:async()=>({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[{url:'https://unrelated.example/english-school'}]}},{type:'message',content:[{type:'output_text',text:notes,annotations:badSources?[]:[{type:'url_citation',url:'https://publisher.example/listening',title:'Listening Across Difference by Alex Lee',start_index:0,end_index:notes.length}]}]}],usage:{input_tokens:800,output_tokens:180}})};}
  const data=JSON.parse(body.messages[1].content),c=fixture(data.editorial_type,data.language,load('src/lib/marketing-content-policy.ts').CONTENT_PROFILES);
  if(duplicate)c.slides=c.slides.map(s=>({...s,title:c.slides[0].title,body:c.slides[0].body}));
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(c)}}],usage:{prompt_tokens:400,completion_tokens:600}})};
 }};
 const source=fs.readFileSync(file,'utf8');vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);cache[file]=context.exports;return context.exports;}
 return {api:load('src/lib/marketing-generation.ts'),policy:load('src/lib/marketing-content-policy.ts'),editorial:load('src/lib/marketing-editorial.ts'),tables,requests,stored};
}
for(const type of Object.keys(harness().policy.CONTENT_PROFILES)){
 const h=harness(),input={...base,content_mode:type==='prelaunch'||type==='live_event'?type:'growth_carousel',topic_type:type==='prelaunch'||type==='live_event'?undefined:type};
 const r=await h.api.runGeneration(id,input,null);
 check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));
 check(()=>assert.equal(h.requests.length,h.policy.CONTENT_PROFILES[type].research?2:1));
 check(()=>assert.equal(r.draft.quality_report.status,'passed'));
 check(()=>assert.equal(r.draft.images.length,h.policy.CONTENT_PROFILES[type].roles.length));
 check(()=>assert.equal(new Set(h.stored.map(x=>x.bytes.toString())).size,h.stored.length));
 check(()=>assert.ok(h.tables.marketing_generation_jobs[0].result_snapshot.content_document));
 const write=h.requests.find(x=>x.url.endsWith('chat/completions')).body;
 check(()=>assert.equal(write.response_format.json_schema.strict,true));check(()=>assert.equal(write.tools,undefined));
 if(h.policy.CONTENT_PROFILES[type].research){check(()=>assert.equal(h.requests[0].body.max_tool_calls,1));check(()=>assert.equal(h.requests[0].body.text,undefined));}
 const dup=await h.api.runGeneration(id,input,null);check(()=>assert.equal(dup.deduplicated,true));
}
{const h=harness({duplicate:true});const r=await h.api.runGeneration(id,{...base,content_mode:'growth_carousel',topic_type:'book_insight'},null);check(()=>assert.equal(r.job.status,'failed'));check(()=>assert.ok(h.tables.marketing_generation_jobs[0].quality_report.issues.some(x=>x.includes('중복'))));check(()=>assert.equal(h.stored.length,0));check(()=>assert.equal(h.tables.instagram_post_drafts[0].caption,'Original'));check(()=>assert.ok(h.tables.marketing_generation_jobs[0].result_snapshot));}
{const h=harness({badSources:true});const r=await h.api.runGeneration(id,{...base,content_mode:'growth_carousel',topic_type:'book_insight'},null);check(()=>assert.equal(r.job.status,'failed'));check(()=>assert.equal(h.requests.length,1));check(()=>assert.equal(h.stored.length,0));}
{const h=harness({network:true});const r=await h.api.runGeneration(id,base,null);check(()=>assert.equal(r.job.status,'uncertain'));check(()=>assert.equal(h.requests.length,1));check(()=>assert.ok(h.tables.marketing_ai_control[0].blocked_reason));}
{const h=harness({denied:true});await assert.rejects(h.api.runGeneration(id,base,null));check(()=>assert.equal(h.requests.length,0));}
{const h=harness({photo403:true});const r=await h.api.runGeneration(id,{...base,visual_mode:'photo',confirm_photo:true},null);check(()=>assert.equal(r.job.status,'failed'));check(()=>assert.equal(h.requests.length,2));check(()=>assert.notEqual(h.tables.instagram_post_drafts[0].caption,'Original'));check(()=>assert.ok(h.tables.marketing_ai_control[0].blocked_reason));}
{const h=harness();await h.api.runGeneration(id,base,null);const before=h.requests.length,d=h.tables.instagram_post_drafts[0];const r=await h.api.runGeneration(id,{...base,request_key:'manual:render-fixture',revision:d.revision,mode:'image',render_only:true},null);check(()=>assert.equal(r.job.status,'completed'));check(()=>assert.equal(h.requests.length,before));}
{const h=harness();for(const bad of [{...base,visual_mode:'photo'},{...base,revision:99},{...base,instruction:'x'.repeat(501)},{...base,language:'fr'},{...base,mode:'loop'}])check(()=>assert.throws(()=>h.api.validateGenerationInput(bad)));}
{const p=harness().policy,c=fixture('book_insight','en',p.CONTENT_PROFILES);const q=p.evaluateContent(c,'book_insight','en',[{id:'S1',url:'https://english-school.example',title:'English lessons',evidence:'Unrelated tutoring services'}]);check(()=>assert.equal(q.status,'rejected'));const quiz=fixture('mini_quiz','en',p.CONTENT_PROFILES);quiz.slides[2].options=['Same','Same'];check(()=>assert.equal(p.evaluateContent(quiz,'mini_quiz','en').status,'rejected'));}
console.log('PASS '+checks+' editorial/runtime assertions; zero live API calls.');
`);
write('scripts/test-marketing-renderer.mjs',`import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),ts=require('typescript'),sharp=require('sharp'),{fixture}=require('./marketing-fixtures.cjs'),cache={};
function load(file){if(cache[file])return cache[file];const context={exports:{},URL,Buffer,console,require:n=>n==='./marketing-content-policy'?load('src/lib/marketing-content-policy.ts'):require(n)};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);return cache[file]=context.exports;}
const p=load('src/lib/marketing-content-policy.ts'),e=load('src/lib/marketing-editorial.ts');fs.mkdirSync('quality-artifacts',{recursive:true});
for(const language of ['en','ko']){const doc=fixture('book_insight',language,p.CONTENT_PROFILES),sources=[{id:'S1',url:'https://publisher.example/listening',title:'Listening Across Difference by Alex Lee',evidence:'Listening Across Difference by Alex Lee explains attentive listening.'}],prepared=p.prepareContent(doc,'book_insight',language,sources);for(let i=0;i<prepared.slides.length;i++){const png=Buffer.from(await e.editorialCard(prepared.slides[i],i,prepared.slides.length,doc).arrayBuffer());const info=await sharp(png).metadata();assert.equal(info.width,1080);assert.equal(info.height,1350);await sharp(png).jpeg({quality:85}).toFile('quality-artifacts/'+language+'-'+i+'.jpg');}}
console.log('PASS: real renderer produced 12 1080x1350 cards, including Korean glyphs. These are fixtures, not posted content.');
`);
let ci=read('.github/workflows/ci.yml');if(!ci.includes('test-marketing-renderer.mjs'))ci+='      - run: node scripts/test-marketing-renderer.mjs\n';write('.github/workflows/ci.yml',ci);
write('docs/marketing-editorial-quality.md',`# Editorial quality v2

Every supported type has a separate role sequence and content brief in marketing-content-policy.ts. Book, study and myth posts require a cited research brief. Other types avoid factual research/percentage/current-trend claims. Meme posts are original situational jokes, not copied or asserted current trends.

Search is isolated from brand/event copy. One plain-text Responses web-search call (max one tool call) yields cited notes. A separate tools-free strict-schema Chat Completions call writes the carousel. Only cited evidence IDs are accepted; arbitrary search-result URLs and model-invented labels are not evidence. Exact book title and author must occur in the cited evidence. Automated checks do NOT prove factual truth, and all publication still requires the administrator's editorial review.

Checks cover role/order/schema, duplicate and near-duplicate titles/bodies, cover density, field lengths, source IDs, book attribution, concrete conversation questions, quiz options, language, excessive promotion and unsupported statistical/trend claims. Rejected raw output and research are preserved on the attempt; rejection does not overwrite the working draft, publish, auto-retry or trip paid-provider fallback.

Rendering uses role-specific cover, book attribution, evidence, dialogue, contrast/choices, practice and CTA compositions, not color swaps. Captions carry source URLs; book/claim cards carry server-derived attribution. Paid photos remain opt-in and receive a deterministic cover headline overlay.

A database trigger blocks ALL new Instagram publishing queue entries unless the current draft revision passed quality checks. Editing or restoring content invalidates the pass. Free rechecks do not call AI. The old source-less success fallback is no longer used for evidence-dependent content.

Reservations: copy $0.02; research (one search + one writing call) $0.05; photo $0.05; copy+photo $0.07. Existing $0.25/day, $3/month, locks and unknown-outcome protection remain. Identical explicit retries can reuse valid saved research (books 7 days, studies 1 day). Reservations are conservative app accounting, not provider invoice guarantees. No paid API calls are made by CI tests.
`);
console.log('Applied editorial integration, UI guards and regression suites.');
