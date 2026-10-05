import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
let assertions=0;const check=f=>{f();assertions++;};
export function harness(language){
 const id='74c39df2-4be9-4dd5-99f4-1f82fa64a0ec';
 const tables={instagram_post_drafts:[{id,status:'needs_approval',revision:1,caption:'Original',cta:'Follow',images:[],carousel_slides:[],content_mode:'prelaunch'}],marketing_generation_jobs:[],marketing_ai_control:[{singleton:true,enabled:true,blocked_reason:null}]};
 const requests=[],stored=[],reservations=[],cache={};
 class Q{constructor(t){this.rows=tables[t]||[];this.pred=[];this.patch=null;this.n=Infinity;}select(){return this;}update(p){this.patch=p;return this;}eq(k,v){this.pred.push(r=>r[k]===v);return this;}gt(k,v){this.pred.push(r=>r[k]>v);return this;}gte(k,v){this.pred.push(r=>r[k]>=v);return this;}is(k,v){return this.eq(k,v);}in(k,v){this.pred.push(r=>v.includes(r[k]));return this;}order(){return this;}limit(n){this.n=n;return this;}single(){return this.exec(true);}maybeSingle(){return this.exec(true);}then(a,b){return this.exec().then(a,b);}exec(single=false){const rows=this.rows.filter(r=>this.pred.every(p=>p(r))).slice(0,this.n);if(this.patch)rows.forEach(r=>Object.assign(r,this.patch));return Promise.resolve({data:structuredClone(single?rows[0]||null:rows),error:null});}}
 const db={from:t=>new Q(t),rpc:async(name,p)=>{
  if(name==='set_marketing_quality'){const d=tables.instagram_post_drafts[0];assert.equal(d.revision,p.p_revision);Object.assign(d,{quality_report:p.p_report,quality_revision:d.revision});return {data:structuredClone(d),error:null};}
  assert.equal(name,'reserve_marketing_generation');reservations.push(structuredClone(p));
  const old=tables.marketing_generation_jobs.find(j=>j.request_key===p.p_key);if(old)return {data:{accepted:false,job:structuredClone(old)},error:null};
  const job={id:'a4f06003-4779-4a1d-9cae-8c895089fe30',draft_id:p.p_draft,request_key:p.p_key,status:'running',created_at:new Date().toISOString(),reserved_usd:p.p_operation==='render'?0:p.p_operation==='copy_photo'?.07:.02,operation:p.p_operation};tables.marketing_generation_jobs.push(job);return {data:{accepted:true,job:structuredClone(job)},error:null};
 },storage:{from:()=>({upload:async(path,bytes)=>{stored.push({path,bytes});return {error:null};},getPublicUrl:path=>({data:{publicUrl:'https://storage.example/'+path}})})}};
 const copy={schema_version:2,design_preset:'roundy_compact_editorial_v1',post_type:'prelaunch',caption:'',caption_ko:'여럿이 모인 자리에서 누구에게 말을 걸지 고민됐다면, 한 사람씩 대화해보세요.',caption_en:'Not sure who to approach in a group? Try meeting one person at a time.',cta:language==='ko'?'라운디 소식 보기':'Follow Roundy',tagline:language==='ko'?'첫 대화부터 한 사람씩':'One conversation at a time',hashtags:['#서울데이트','#firstmeeting'],book:{title:'',author:'',source_id:'',source_context:''},slides:[
  {role:'cover',eyebrow:'Roundy Notes',title:language==='ko'?'첫 대화가 어려운가요?':'Not sure how to start?',body:language==='ko'?'한 사람씩 마주 앉아 시작해보세요.':'Start by meeting one person at a time.',secondary_body:language==='ko'?'Start by meeting one person at a time.':'한 사람씩 마주 앉아 시작해보세요.',highlight:'',options:[],source_ids:[]},
  {role:'concept',eyebrow:'',title:language==='ko'?'한 사람에게 집중하기':'Give one person your attention',body:language==='ko'?'큰 모임에서 말을 끼워 넣기보다, 맞은편 사람의 이야기를 들어보세요.':'Instead of trying to join a crowded conversation, listen to the person across from you.',secondary_body:language==='ko'?'Listen to the person across from you, rather than trying to join a crowded conversation.':'큰 모임에서 말을 끼워 넣기보다, 맞은편 사람의 이야기를 들어보세요.',highlight:'',options:[],source_ids:[]},
  {role:'cta',eyebrow:'Roundy',title:language==='ko'?'서울에서 직접 만나요':'Meet face to face in Seoul',body:language==='ko'?'라운디에서 한 사람씩 대화해보세요.':'Try a 1:1 mingle with Roundy.',secondary_body:language==='ko'?'Try a 1:1 mingle with Roundy.':'라운디에서 한 사람씩 대화해보세요.',highlight:'',options:[],source_ids:[]},
 ]};copy.caption=language==='ko'?copy.caption_ko:copy.caption_en;
 function load(file){if(cache[file])return cache[file];const context={exports:{},Buffer,URL,AbortSignal,Intl,Date,console,setTimeout,clearTimeout,process:{env:{OPENAI_API_KEY:'test-not-real'}},require:n=>{
  if(n==='server-only')return {};if(n==='./supabase/service')return {createServiceRoleClient:()=>db};
  if(n==='./marketing-render-assets')return {loadEditorialAssets:async()=>({photo:'data:image/jpeg;base64,brand-test-image',fonts:[]})};
  if(n==='react')return {createElement:(tag,props,...children)=>({tag,props,children})};
  if(n==='next/og')return {ImageResponse:class{constructor(tree){this.tree=tree;}arrayBuffer(){return Promise.resolve(Buffer.from(JSON.stringify(this.tree)));}}};
  if(n==='sharp')return bytes=>({jpeg:()=>({toBuffer:async()=>Buffer.from(bytes)})});
  if(n.startsWith('./marketing-'))return load('src/lib/'+n.slice(2)+'.ts');return require(n);
 },fetch:async(url,init)=>{const body=JSON.parse(init.body);requests.push({url,body});
  if(url.endsWith('/images/generations'))return {ok:true,json:async()=>({data:[{b64_json:Buffer.alloc(200).toString('base64')}]})};
  assert.ok(url.endsWith('/chat/completions'));check(()=>assert.equal(body.response_format.json_schema.strict,true));check(()=>assert.ok(body.response_format.json_schema.schema.required.includes('caption_ko')));check(()=>assert.ok(body.response_format.json_schema.schema.properties.slides.items.required.includes('secondary_body')));check(()=>assert.equal(body.tools,undefined));
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(copy)}}],usage:{prompt_tokens:600,completion_tokens:850}})};
 }};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);return cache[file]=context.exports;}
 return {id,tables,requests,stored,reservations,copy,api:load('src/lib/marketing-generation.ts'),policy:load('src/lib/marketing-content-policy.ts'),presentation:load('src/lib/marketing-presentation.ts'),recovery:load('src/lib/marketing-output-recovery.ts'),research:load('src/lib/marketing-research-task.ts'),editorial:load('src/lib/marketing-editorial.ts')};
}
for(const language of ['ko','en'])for(const visual_mode of ['cards','photo']){
 const h=harness(language),input={request_key:'manual:compact-runtime-'+language+'-'+visual_mode,revision:1,mode:'both',content_mode:'prelaunch',visual_mode,language,confirm_photo:visual_mode==='photo'};
 const result=await h.api.runGeneration(h.id,input,null);
 check(()=>assert.equal(result.job.status,'completed',JSON.stringify(result)));
 check(()=>assert.equal(h.requests.length,visual_mode==='photo'?2:1));
 check(()=>assert.equal(result.draft.images.length,3));
 check(()=>assert.equal(result.draft.content_document.design_preset,'roundy_compact_editorial_v1'));
 check(()=>assert.equal(result.draft.quality_report.status,'passed'));
 check(()=>assert.equal(result.draft.content_document.hashtag_selection.search_volume_verified,false));
 check(()=>assert.ok(result.draft.caption.includes('출처 / Sources')&&result.draft.caption.includes('roundy.team')));
 check(()=>assert.equal(h.tables.marketing_generation_jobs[0].result_snapshot.images.length,3));
 check(()=>assert.ok(h.stored.every(s=>s.bytes.toString().includes('M22 40C28.6274'))));
 const outro=h.stored.at(-1).bytes.toString();check(()=>assert.ok(outro.includes('@roundy.meet')&&outro.includes('roundy.team')));
 if(visual_mode==='photo'){const call=h.requests.find(r=>r.url.endsWith('/images/generations')).body;check(()=>assert.equal(call.model,'gpt-image-2.5-flare'));check(()=>assert.equal(call.n,1));check(()=>assert.equal(call.quality,'low'));check(()=>assert.equal(call.size,'1024x1280'));check(()=>assert.ok(!call.prompt.includes('English-only')));}
 const count=h.requests.length,repeated=await h.api.runGeneration(h.id,input,null);check(()=>assert.equal(repeated.deduplicated,true));check(()=>assert.equal(h.requests.length,count));
}
console.log('PASS '+assertions+' compact runtime assertions: bilingual copy, full 3-card photo/carousel output, original logo, idempotency, one image request only. Zero live paid requests.');
