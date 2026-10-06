import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),{fixture}=require('./marketing-fixtures.cjs');
let checks=0;const check=(f)=>{f();checks++;};
const id='4b9066d0-e01b-4cc4-92d1-469f56317a04';
const base={request_key:'manual:quality-test-001',revision:1,mode:'both',content_mode:'prelaunch',language:'en',visual_mode:'cards',instruction:''};
function harness({denied=false,network=false,badSources=false,duplicate=false,photo403=false}={}){
 const tables={instagram_post_drafts:[{id,status:'needs_approval',revision:1,caption:'Original',cta:'Follow',images:[],carousel_slides:[],content_mode:'prelaunch'}],marketing_generation_jobs:[],marketing_ai_control:[{singleton:true,enabled:true,blocked_reason:null}],marketing_uploaded_images:[],events:[{id:'event-fixture',slug:'fixture',title:'Fixture event',status:'live',deleted_at:null,starts_at:'2099-12-01T10:00:00Z',venue:'Fixture public venue'}]};
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
  const cost=p.p_operation==='render'?0:p.p_operation==='research'?.05:p.p_operation==='photo'?.15:p.p_operation==='copy_photo'?.20:.02;const job={id:'12345678-1234-1234-1234-'+String(tables.marketing_generation_jobs.length+1).padStart(12,'0'),draft_id:p.p_draft,request_key:p.p_key,status:'running',created_at:new Date().toISOString(),reserved_usd:cost,operation:p.p_operation};tables.marketing_generation_jobs.push(job);return {data:{accepted:true,job:structuredClone(job)},error:null};
 },storage:{from:bucket=>({upload:async(path,bytes)=>{stored.push({bucket,path,bytes});return {error:null};},download:async(path)=>({data:{arrayBuffer:async()=>Buffer.alloc(1600)},error:null}),remove:async()=>({data:[],error:null}),getPublicUrl:path=>({data:{publicUrl:'https://storage.example/'+path}})})}};
 const cache={};
 function load(file){if(cache[file])return cache[file];const context={exports:{},Buffer,URL,AbortSignal,Intl,Date,console,setTimeout,clearTimeout,process:{env:{OPENAI_API_KEY:'mock-only'}},require:name=>{
  if(name==='./marketing-render-assets')return {loadEditorialAssets:async()=>({photo:null,photos:[],fonts:[]})};if(name==='server-only')return {};if(name==='./supabase/service')return {createServiceRoleClient:()=>db};
  if(name==='react')return {createElement:(tag,props,...children)=>({tag,props,children})};
  if(name==='next/og')return {ImageResponse:class{constructor(tree){this.tree=tree;}arrayBuffer(){return Promise.resolve(Buffer.from(JSON.stringify(this.tree)));}}};
  if(name==='sharp')return bytes=>{const api={metadata:async()=>({width:1080,height:1350}),rotate:()=>api,resize:()=>api,jpeg:()=>api,toBuffer:async()=>Buffer.from(bytes)};return api;};
  if(name.startsWith('./marketing-'))return load('src/lib/'+name.slice(2)+'.ts');return require(name);
 },fetch:async(url,init)=>{
  const body=JSON.parse(init.body);requests.push({url,body});if(network)throw new Error('timeout');
  if(url.endsWith('images/generations'))return photo403?{ok:false,status:403,json:async()=>({error:{message:'Verify organization'}})}:{ok:true,json:async()=>({data:[0,1,2].map(()=>({b64_json:Buffer.alloc(200).toString('base64')}))})};
  if(url.endsWith('/responses')){
   const seoul=String(body.input||'').includes('Seoul dating-location')||String(body.input||'').includes('6–10 real candidates');
   const notes=seoul
    ?'노들섬 (Nodeul Island) is a Seoul riverside cultural space. 서울공예박물관 (Seoul Museum of Craft Art) is a public craft museum in Jongno. 하늘공원 (Haneul Park) is a Seoul park known for open views and walking.'
    :'Listening Across Difference by Alex Lee explains attentive listening. Published by Fixture Press. Attentive Conversation Study (2024) observes association, not causation, in a limited sample.';
   const annotations=badSources?[]:seoul?[
    {type:'url_citation',url:'https://official.example/nodeul',title:'노들섬 official',start_index:0,end_index:notes.indexOf('서울공예박물관')-1},
    {type:'url_citation',url:'https://official.example/craftmuseum',title:'서울공예박물관 official',start_index:notes.indexOf('서울공예박물관'),end_index:notes.indexOf('하늘공원')-1},
    {type:'url_citation',url:'https://official.example/haneul',title:'하늘공원 official',start_index:notes.indexOf('하늘공원'),end_index:notes.length}
   ]:[{type:'url_citation',url:'https://publisher.example/listening',title:'Listening Across Difference by Alex Lee',start_index:0,end_index:notes.length}];
   return {ok:true,json:async()=>({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[{url:'https://unrelated.example/english-school'}]}},{type:'message',content:[{type:'output_text',text:notes,annotations}]}],usage:{input_tokens:800,output_tokens:180}})};
  }
  const data=JSON.parse(body.messages[1].content),c=fixture(data.editorial_type,data.language,load('src/lib/marketing-content-policy.ts').CONTENT_PROFILES);
  if(duplicate)c.slides=c.slides.map(s=>({...s,title:c.slides[0].title,body:c.slides[0].body}));
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(c)}}],usage:{prompt_tokens:400,completion_tokens:600}})};
 }};
 const source=fs.readFileSync(file,'utf8');vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);cache[file]=context.exports;return context.exports;}
 return {api:load('src/lib/marketing-generation.ts'),policy:load('src/lib/marketing-content-policy.ts'),editorial:load('src/lib/marketing-editorial.ts'),tables,requests,stored};
}
for(const language of ['en','ko'])for(const type of Object.keys(harness().policy.CONTENT_PROFILES)){
 const h=harness(),input={...base,language,content_mode:type==='prelaunch'||type==='live_event'?type:'growth_carousel',topic_type:type==='prelaunch'||type==='live_event'?undefined:type,instruction:type==='book_insight'?"You're Not Listening":''};
 const r=await h.api.runGeneration(id,input,null);
 check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));
 check(()=>assert.equal(h.requests.length,type==='book_insight'?2:h.policy.CONTENT_PROFILES[type].research?3:2));
 check(()=>assert.equal(r.draft.quality_report.status,'passed'));
 check(()=>assert.equal(r.draft.images.length,h.policy.CONTENT_PROFILES[type].roles.length));
 check(()=>assert.equal(new Set(h.stored.map(x=>x.bytes.toString())).size,h.stored.length));
 check(()=>assert.ok(h.tables.marketing_generation_jobs[0].result_snapshot.content_document));
 const write=h.requests.find(x=>x.url.endsWith('chat/completions')).body;
 check(()=>assert.equal(write.response_format.json_schema.strict,true));check(()=>assert.equal(write.tools,undefined));
 if(['trend_research','dating_myth','seoul_dating'].includes(type)){check(()=>assert.equal(h.requests[0].body.max_tool_calls,3));check(()=>assert.equal(h.requests[0].body.tools?.[0]?.search_context_size,'high'));check(()=>assert.equal(h.requests[0].body.tools?.[0]?.external_web_access,true));check(()=>assert.equal(h.requests[0].body.text,undefined));}
 const dup=await h.api.runGeneration(id,input,null);check(()=>assert.equal(dup.deduplicated,true));
}
{const h=harness({duplicate:true});const r=await h.api.runGeneration(id,{...base,content_mode:'growth_carousel',topic_type:'book_insight'},null);check(()=>assert.equal(r.job.status,'failed'));check(()=>assert.ok(h.tables.marketing_generation_jobs[0].quality_report.issues.some(x=>x.includes('중복'))));check(()=>assert.equal(h.stored.length,0));check(()=>assert.equal(h.tables.instagram_post_drafts[0].caption,'Original'));check(()=>assert.ok(h.tables.marketing_generation_jobs[0].result_snapshot));}
{const h=harness(),input={...base,request_key:'manual:mixed-state-fix',topic_type:'dating_archetype'};check(()=>assert.equal(h.api.validateGenerationInput(input).topic_type,undefined));const r=await h.api.runGeneration(id,input,null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(h.tables.marketing_generation_jobs[0].request_payload.topic_type,null));const p=h.policy,d=fixture('prelaunch','en',p.CONTENT_PROFILES),preset=p.contentSchema('prelaunch','en').properties.design_preset.enum[0];d.design_preset=preset;d.caption_en='One conversation at a time\nCrowded rooms can make it harder to follow one person closely.\nA slower format can leave more room for the answer.';d.caption_ko='한 번에 한 대화\n큰 모임에서는 한 사람의 이야기를 끝까지 따라가기 어려울 수 있어요.\n조금 느린 방식이 답에 더 머물 여유를 줄 수 있습니다.';d.caption=d.caption_en;d.tagline='One person at a time';d.hashtags=[];d.slides=d.slides.map((s,i)=>({...s,secondary_body:i===0?'여러 대화가 겹치면 한 사람의 말을 듣기 어려울 수 있어요.':i===1?'한 사람씩 마주 앉아 대화에 집중해보세요.':'서울에서 한 사람씩 만나보세요.'}));d.slides[0].body='A loud group can make it hard to hear one person clearly, especially when several conversations compete for attention at the same time.';d.slides[d.slides.length-1].role='concept';const prepared=p.prepareContent(d,'prelaunch','en',[]);check(()=>assert.ok(d.slides[0].body.length>110));check(()=>assert.equal(prepared.report.status,'passed',JSON.stringify(prepared.report)));check(()=>assert.equal(prepared.document.slides.at(-1).role,'cta'));}
{const h=harness({badSources:true});const r=await h.api.runGeneration(id,{...base,content_mode:'growth_carousel',topic_type:'dating_myth'},null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(h.requests.length,3));check(()=>assert.equal(r.draft.growth_topic_type,'conversation_prompt'));check(()=>assert.match(r.draft.generation_reason,/safe fallback/));check(()=>assert.equal(r.job.result_snapshot.generation_recovery.effective_type,'conversation_prompt'));}
{const h=harness({badSources:true});const r=await h.api.runGeneration(id,{...base,request_key:'manual:seoul-fallback',content_mode:'growth_carousel',topic_type:'seoul_dating'},null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(r.draft.growth_topic_type,'conversation_prompt'));check(()=>assert.match(r.draft.generation_reason,/safe fallback/));}
{const h=harness({network:true});const r=await h.api.runGeneration(id,base,null);check(()=>assert.equal(r.job.status,'uncertain'));check(()=>assert.equal(h.requests.length,1));check(()=>assert.ok(h.tables.marketing_ai_control[0].blocked_reason));}
{const h=harness({denied:true});await assert.rejects(h.api.runGeneration(id,base,null));check(()=>assert.equal(h.requests.length,0));}
{const h=harness({photo403:true});const r=await h.api.runGeneration(id,{...base,visual_mode:'photo',confirm_photo:true},null);check(()=>assert.equal(r.job.status,'failed'));check(()=>assert.equal(h.requests.length,2));check(()=>assert.notEqual(h.tables.instagram_post_drafts[0].caption,'Original'));check(()=>assert.ok(h.tables.marketing_ai_control[0].blocked_reason));}
{const h=harness();await h.api.runGeneration(id,base,null);const before=h.requests.length,d=h.tables.instagram_post_drafts[0];const r=await h.api.runGeneration(id,{...base,request_key:'manual:render-fixture',revision:d.revision,mode:'image',render_only:true},null);check(()=>assert.equal(r.job.status,'completed'));check(()=>assert.equal(h.requests.length,before+1));check(()=>assert.equal(h.requests.at(-1).body.n,3));}
{const h=harness();await h.api.runGeneration(id,{...base,request_key:'manual:upload-seed'},null);const d=h.tables.instagram_post_drafts[0];d.draft_role='candidate';d.generation_source='manual';d.visual_source='uploaded';h.tables.marketing_uploaded_images.push({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',draft_id:id,storage_path:id+'/originals/test.jpg',sort_order:0,role:'cover',asset_type:'photo',width:1080,height:1350,file_size:1600,mime_type:'image/jpeg'});const before=h.requests.length;const r=await h.api.runGeneration(id,{...base,request_key:'manual:uploaded-render',revision:d.revision,mode:'image',render_only:true,visual_source:'uploaded'},null);check(()=>assert.equal(r.job.status,'completed',JSON.stringify(r)));check(()=>assert.equal(r.job.operation,'render'));check(()=>assert.equal(r.job.reserved_usd,0));check(()=>assert.equal(h.requests.length,before));check(()=>assert.equal(r.draft.visual_source,'uploaded'));check(()=>assert.ok(r.draft.images.length>0));}
{const h=harness();for(const bad of [{...base,visual_mode:'photo'},{...base,revision:99},{...base,instruction:'x'.repeat(501)},{...base,language:'fr'},{...base,mode:'loop'}])check(()=>assert.throws(()=>h.api.validateGenerationInput(bad)));}
{const p=harness().policy,c=fixture('book_insight','en',p.CONTENT_PROFILES);const q=p.evaluateContent(c,'book_insight','en',[{id:'S1',url:'https://english-school.example',title:'English lessons',evidence:'Unrelated tutoring services'}]);check(()=>assert.equal(q.status,'rejected'));const quiz=fixture('mini_quiz','en',p.CONTENT_PROFILES);quiz.slides[2].options=['Same','Same'];check(()=>assert.equal(p.evaluateContent(quiz,'mini_quiz','en').status,'rejected'));}
{const p=harness().policy;check(()=>assert.equal(p.CONTENT_POLICY_VERSION,7));const ko=fixture('prelaunch','ko',p.CONTENT_PROFILES);ko.caption='진정한 인연을 위한 특별한 만남';check(()=>assert.equal(p.evaluateContent(ko,'prelaunch','ko').status,'rejected'));const en=fixture('prelaunch','en',p.CONTENT_PROFILES);en.caption='Discover meaningful human connections in a premium experience.';check(()=>assert.equal(p.evaluateContent(en,'prelaunch','en').status,'rejected'));check(()=>assert.match(p.writingInstructions('conversation_prompt','ko'),/실제 SNS|당장 써볼 수|AI\/마케팅 표현|AI\/marketing|상투적인|generic AI/i));}

{const p=harness().policy;check(()=>assert.equal(p.qualitySeverity('실제 인용된 출처가 없습니다.'),'critical'));check(()=>assert.equal(p.qualitySeverity('카드 제목이 중복되거나 지나치게 유사합니다.'),'quality'));const presentation=harness().api?null:null;}
const adminMarketingSource=fs.readFileSync(new URL('../src/components/admin-marketing.tsx',import.meta.url),'utf8');
check(()=>assert.ok(adminMarketingSource.includes("...(basis==='growth_carousel'?{topic_type:topic}:{})")));
check(()=>assert.ok(adminMarketingSource.includes("request.content_mode==='growth_carousel'")));
const generationSource=fs.readFileSync(new URL('../src/lib/marketing-generation.ts',import.meta.url),'utf8');
check(()=>assert.ok(generationSource.includes("IMAGE_MODEL='gpt-image-2.5-flare'")));
check(()=>assert.ok(generationSource.includes("size:'1024x1280'")));
check(()=>assert.ok(generationSource.includes("draft_role:'workspace'")));
check(()=>assert.ok(generationSource.includes("n:3")));
check(()=>assert.ok(generationSource.includes("FRESH_VISUAL_SET_REQUIRED")));
check(()=>assert.ok(generationSource.includes("static_photo_reuse:false")));
const editorialSource=fs.readFileSync(new URL('../src/lib/marketing-editorial.ts',import.meta.url),'utf8');
const visualSource=fs.readFileSync(new URL('../src/lib/marketing-visuals.ts',import.meta.url),'utf8');
check(()=>assert.ok(visualSource.includes('OFFICIAL_ROUNDY_PATHS')));
check(()=>assert.ok(visualSource.includes('roundy.team')||visualSource.includes('BRAND.website')));
check(()=>assert.ok(editorialSource.includes('renderCompactEditorial')));
console.log('PASS '+checks+' editorial/runtime assertions; zero live API calls.');
