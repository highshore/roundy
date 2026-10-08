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
  const job={id:'a4f06003-4779-4a1d-9cae-8c895089fe30',draft_id:p.p_draft,request_key:p.p_key,status:'running',created_at:new Date().toISOString(),reserved_usd:p.p_operation==='render'?0:p.p_operation==='research'?.05:p.p_operation==='photo'?.15:p.p_operation==='copy_photo'?.20:.02,operation:p.p_operation};tables.marketing_generation_jobs.push(job);return {data:{accepted:true,job:structuredClone(job)},error:null};
 },storage:{from:()=>({upload:async(path,bytes)=>{stored.push({path,bytes});return {error:null};},getPublicUrl:path=>({data:{publicUrl:'https://storage.example/'+path}})})}};
 const ko=language==='ko';
 const koTitles=['화면 밖에서 시작하기','한 사람의 이야기에 집중','서울에서 직접 만나기'];
 const enTitles=['Meet face to face','Give one person your attention','Discover Roundy'];
 const koBodies=['서로 마주 앉아 자연스럽게 만나기','한 사람과 차분하게 대화를 나눠요','다음 만남을 기대해보세요'];
 const enBodies=['Meet in person, away from the screen','Focus on one conversation at a time','See what unfolds with Roundy'];
 // Prelaunch uses a dedicated campaign format, not the old compact-editorial preset.
 const copy={
  schema_version:2,campaign_version:'prelaunch_campaign_v1',design_preset:'roundy_prelaunch_campaign_v1',
  post_type:'prelaunch',campaign_pattern:'poster',campaign_tone:'modern_premium',campaign_goal:'awareness',
  caption_ko:'화면 대신 마주 앉기\n한 번에 한 사람과 차분하게 이야기하는 만남을 준비합니다.',
  caption_en:'One conversation at a time\nMeet face to face and make room for each person to speak.',
  slides:['hook','benefit','cta'].map((role,i)=>({
   role,eyebrow:'',title:ko?koTitles[i]:enTitles[i],
   body:ko?koBodies[i]:enBodies[i],secondary_body:ko?enBodies[i]:koBodies[i],
   visual_direction:'Candid lifestyle photograph of adults talking in contemporary Seoul, no text',
   step_number:0,source_ids:[]
  }))
 };
 function load(file){if(cache[file])return cache[file];const context={exports:{},Buffer,URL,AbortSignal,Intl,Date,console,setTimeout,clearTimeout,process:{env:{OPENAI_API_KEY:'test-not-real'}},require:n=>{
  if(n==='server-only')return {};if(n==='./supabase/service')return {createServiceRoleClient:()=>db};
  if(n==='./marketing-render-assets')return {loadEditorialAssets:async()=>({photo:null,photos:[],fonts:[]})};
  if(n==='react')return {createElement:(tag,props,...children)=>({tag,props,children})};
  if(n==='next/og')return {ImageResponse:class{constructor(tree){this.tree=tree;}arrayBuffer(){return Promise.resolve(Buffer.from(JSON.stringify(this.tree)));}}};
  if(n==='sharp')return bytes=>({jpeg:()=>({toBuffer:async()=>Buffer.from(bytes)})});
  if(n.startsWith('./')&&fs.existsSync('src/lib/'+n.slice(2)+'.ts'))return load('src/lib/'+n.slice(2)+'.ts');return require(n);
 },fetch:async(url,init)=>{const body=JSON.parse(init.body);requests.push({url,body});
  if(url.endsWith('/images/generations'))return {ok:true,json:async()=>({data:[0,1,2].map(()=>({b64_json:Buffer.alloc(200).toString('base64')}))})};
  assert.ok(url.endsWith('/chat/completions'));check(()=>assert.equal(body.response_format.json_schema.strict,true));check(()=>assert.ok(body.response_format.json_schema.schema.required.includes('caption_ko')));check(()=>assert.ok(body.response_format.json_schema.schema.properties.slides.items.required.includes('secondary_body')));check(()=>assert.equal(body.tools,undefined));
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(copy)}}],usage:{prompt_tokens:600,completion_tokens:850}})};
 }};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);return cache[file]=context.exports;}
 return {id,tables,requests,stored,reservations,copy,api:load('src/lib/marketing-generation.ts'),policy:load('src/lib/marketing-content-policy.ts'),presentation:load('src/lib/marketing-presentation.ts'),recovery:load('src/lib/marketing-output-recovery.ts'),research:load('src/lib/marketing-research-task.ts'),editorial:load('src/lib/marketing-editorial.ts')};
}
for(const language of ['ko','en'])for(const visual_mode of ['cards','photo']){
 const h=harness(language),input={request_key:'manual:compact-runtime-'+language+'-'+visual_mode,revision:1,mode:'both',content_mode:'prelaunch',campaign_pattern:'poster',visual_mode,language,confirm_photo:visual_mode==='photo'};
 const result=await h.api.runGeneration(h.id,input,null);
 check(()=>assert.equal(result.job.status,'completed',JSON.stringify(result)));
 check(()=>assert.equal(h.requests.length,2));
 check(()=>assert.equal(result.draft.images.length,3));
 check(()=>assert.equal(result.draft.content_document.design_preset,'roundy_prelaunch_campaign_v1'));
 check(()=>assert.equal(result.draft.quality_report.status,'passed'));
 check(()=>assert.equal(result.draft.content_document.hashtag_selection.search_volume_verified,false));
 check(()=>assert.ok(!result.draft.caption.includes('출처 / Sources')&&result.draft.caption.includes('roundy.team')));
 check(()=>assert.ok(result.draft.caption.includes('오픈 소식은 프로필에서 확인하세요.')&&result.draft.caption.includes('Follow the profile for launch updates.')));
 check(()=>assert.equal(h.tables.marketing_generation_jobs[0].result_snapshot.images.length,3));
 check(()=>assert.ok(h.stored.every(s=>s.bytes.toString().includes('M22 40C28.6274'))));
 const bodyCard=h.stored[1].bytes.toString();
 check(()=>assert.ok(bodyCard.includes(h.copy.slides[1].body),'Main-language campaign copy is rendered'));
 check(()=>assert.ok(!bodyCard.includes(h.copy.slides[1].secondary_body),'Secondary-language copy is not rendered'));
 const coverCard=h.stored[0].bytes.toString();check(()=>assert.ok(!coverCard.includes('@roundy.meet')&&!coverCard.includes('roundy.team')&&!coverCard.includes('Roundy Notes')));
 const outro=h.stored.at(-1).bytes.toString();check(()=>assert.ok(outro.includes('@roundy.meet')&&outro.includes('roundy.team')));
 const call=h.requests.find(r=>r.url.endsWith('/images/generations')).body;check(()=>assert.equal(call.model,'gpt-image-2.5-flare'));check(()=>assert.equal(call.n,3));check(()=>assert.equal(call.quality,'low'));check(()=>assert.equal(call.size,'1024x1280'));check(()=>assert.ok(call.prompt.includes('THREE distinct')&&call.prompt.includes('Carousel context:')));
 const count=h.requests.length,repeated=await h.api.runGeneration(h.id,input,null);check(()=>assert.equal(repeated.deduplicated,true));check(()=>assert.equal(h.requests.length,count));
}
console.log('PASS '+assertions+' campaign runtime assertions: fresh three-image visual set, localized campaign cards, original logo and idempotency. Zero live paid requests.');
