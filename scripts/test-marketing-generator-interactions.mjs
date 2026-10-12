import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),{create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const cache=new Map(),requests=[],confirmations=[];
const settings={carousel_mode:'fixed',carousel_default_slides:5,carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_brand_outro_enabled:true};
const gen={jobs:[],provider:{configured:true},control:{enabled:true},usage:{daily_call_limit:50}};
const makeDraft=(id,kind='brand',lang='en')=>({id,revision:2,status:'needs_approval',draft_role:'candidate',draft_kind:kind,content_mode:'prelaunch',content_language:lang,growth_topic_type:kind==='growth_carousel'?'conversation_prompt':null,caption:'A concrete original caption.',images:Array(5).fill('https://example.invalid/card.jpg'),carousel_slides:['cover','context','insight','insight','editorial_closing'].map(role=>({role,title:'Saved '+role,body:'Original copy.'})),content_document:{design_preset:'roundy_magazine_editorial_v2',photo_sourcing:{ai_image_slot:0}},quality_report:{status:'passed'},draft_date:'2026-10-12',updated_at:'2026-10-12T10:00:00Z'});
let drafts=[makeDraft('11111111-1111-4111-8111-111111111111'),makeDraft('22222222-2222-4222-8222-222222222222','growth_carousel','ko')],createdDraft;
async function fakeFetch(url,init={}){
 const route=String(url).replace('/api/admin/marketing',''),body=init.body?JSON.parse(init.body):null;requests.push({route,body,method:init.method||'GET'});
 let data;
 if(route==='')data={drafts,runs:[],templates:[],settings,generation:gen,connection:{instagram_status:'valid'},live_events:[]};
 else if(route==='/generation')data=gen;
 else if(route.startsWith('/quality/preflight?')){const id=new URLSearchParams(route.split('?')[1]).get('draft_id');data={draft_id:id,revision:2,preflight:{status:'passed',checks:[]},quality_report:{status:'passed'}};}
 else if(route.startsWith('/photos?'))data={photos:[],ready:false,required_count:3};
 else if(route.startsWith('/uploads?'))data={images:[]};
 else if(route.endsWith('/regenerate')){const id=route.split('/')[2];data={draft:drafts.find(d=>d.id===id),job:{id:'render-job',status:'completed'}};}
 else if(route==='/draft/generate'){createdDraft={...makeDraft('33333333-3333-4333-8333-333333333333','growth_carousel','ko'),growth_topic_type:body.topic_type};data={draft:createdDraft,job:{id:'new-job',status:'completed'}};}
 else if(route==='/generation/jobs/new-job/import'){drafts=[createdDraft,...drafts];data={draft:createdDraft};}
 else throw new Error('Unexpected API route in test: '+route);
 return {ok:true,status:200,json:async()=>data};
}
function stubModule(name){
 if(name==='./heading')return {Heading:({children,level=2})=>React.createElement('h'+level,null,children)};
 if(name==='./admin-marketing-editorial-studio')return {AdminMarketingEditorialStudio:props=>React.createElement('button',{'data-test':'saved-render',onClick:props.onRerenderCover},'Render saved draft')};
 return new Proxy({}, {get:(_,key)=>key==='__esModule'?true:()=>null});
}
function load(file){
 if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const localRequire=name=>{
  if(name.endsWith('.css')||name==='server-only')return {};
  if(name==='@/lib/locale')return {tr:(locale,en,ko)=>locale==='ko'?ko:en};
  if(name==='@/lib/uploads')return {uploadFile:()=>{throw Error('No uploads in interaction tests');},uploadMarketingFile:()=>{throw Error('No uploads');}};
  if(name==='@/lib/marketing-output-recovery')return {canOfferSavedCtaRecovery:()=>false};
  if(name==='@/lib/marketing-trend-guide')return {factPackReady:()=>false,groupTrendsByUsage:()=>({unused:[],used:[]})};
  if(name==='@/lib/marketing-editorial-settings')return {EDITORIAL_SETTINGS_DEFAULTS:{}};
  if(name==='lucide-react')return stubModule(name);
  if(name.startsWith('./')&&file.startsWith('src/components/'))return stubModule(name);
  if(name.startsWith('@/')||name.startsWith('.')){
   const base=name.startsWith('@/')?'src/'+name.slice(2):path.join(path.dirname(file),name);
   const resolved=['.ts','.tsx',''].map(ext=>base+ext).find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
   if(!resolved)throw Error('Missing module: '+name+' from '+file);return load(resolved);
  }
  return require(name);
 };
 vm.runInNewContext(code,{module,exports:module.exports,require:localRequire,console,Buffer,URL,URLSearchParams,Date,Intl,Set,Map,JSON,Math,crypto:webcrypto,structuredClone,AbortSignal,fetch:fakeFetch,setTimeout,clearTimeout,document:{visibilityState:'hidden',getElementById:()=>null},window:{confirm:message=>{confirmations.push(message);return true;},matchMedia:()=>({matches:false})}},{filename:file});
 return module.exports;
}
const {AdminMarketing}=load('src/components/admin-marketing.tsx');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?text(node.children):'';
let renderer;
const selectWith=value=>renderer.root.findAllByType('select').find(select=>select.findAllByType('option').some(option=>String(option.props.value)===String(value)));
async function choose(value){const select=selectWith(value);assert.ok(select,'Option exists: '+value);await act(async()=>{select.props.onChange({target:{value},currentTarget:{value}});await tick();});}
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
try{
 for(const locale of ['ko','en']){
  drafts=[makeDraft('11111111-1111-4111-8111-111111111111'),makeDraft('22222222-2222-4222-8222-222222222222','growth_carousel','ko')];requests.length=0;confirmations.length=0;
  await act(async()=>{renderer=create(React.createElement(AdminMarketing,{locale}));await tick();});
  const original=JSON.stringify(drafts);
  if(selectWith('growth_carousel'))await choose('growth_carousel');
  await choose('dating_myth');
  await test(locale+' topic selector renders dating myth without a component crash',()=>assert.equal(selectWith('dating_myth').props.value,'dating_myth'));
  for(const value of ['book_insight','meme_remix','conversation_prompt','dating_myth'])await choose(value);
  await test(locale+' changing type makes no paid request',()=>assert.equal(requests.filter(r=>r.body).length,0));
  const otherButton=renderer.root.findAllByType('button').find(b=>text(b)===(locale==='ko'?'편집':'Edit'));
  assert.ok(otherButton,'Second draft edit action exists');
  await act(async()=>{otherButton.props.onClick();await tick();});
  await test(locale+' selecting another draft preserves new-post topic',()=>assert.equal(selectWith('dating_myth').props.value,'dating_myth'));
  await test(locale+' existing drafts not changed by generator selections',()=>assert.equal(JSON.stringify(drafts),original));
  // Test the parent rerender callback while new-post controls point at a different topic.
  await act(async()=>{renderer.root.findByProps({'data-test':'saved-render'}).props.onClick();await tick();});
  const render=requests.find(r=>r.route.endsWith('/regenerate'));
  await test(locale+' render uses saved topic, not new-post topic',()=>{assert.ok(render);assert.equal(render.body.topic_type,'conversation_prompt');assert.equal(render.body.content_mode,'growth_carousel');assert.equal(render.body.render_only,true);assert.equal(render.body.instruction,'');});
  await test(locale+' render does not reset new-post topic',()=>assert.equal(selectWith('dating_myth').props.value,'dating_myth'));
  await choose('ko');
  const directionField=renderer.root.findAllByType('textarea').find(x=>x.props.maxLength===500);
  await act(async()=>{directionField.props.onChange({target:{value:'첫인상의 설렘만으로 관계를 단정할 수 있을까?'},currentTarget:{value:'첫인상의 설렘만으로 관계를 단정할 수 있을까?'}});await tick();});
  const createButton=renderer.root.findAllByType('button').find(b=>text(b)===(locale==='ko'?'콘텐츠 생성':'Generate content'));
  assert.ok(createButton,'Create button exists');
  await act(async()=>{createButton.props.onClick();await tick();});
  const creation=requests.find(r=>r.route==='/draft/generate');
  await test(locale+' generate submits requested myth once and imports once',()=>{assert.ok(creation);assert.equal(creation.body.topic_type,'dating_myth');assert.equal(creation.body.content_mode,'growth_carousel');assert.equal(creation.body.language,'ko');assert.equal(requests.filter(r=>r.route==='/draft/generate').length,1);assert.equal(requests.filter(r=>r.route==='/generation/jobs/new-job/import').length,1);});
  await test(locale+' generating does not approve or publish',()=>assert.equal(requests.filter(r=>/publish|approve|schedule/.test(r.route)).length,0));
  await act(async()=>renderer.unmount());renderer=null;
 }
 const {generatorSelection,generatorMediaPlan,savedRenderContent}=load('src/lib/marketing-generator-ui.ts');
 await test('invalid UI values do not throw',()=>assert.equal(generatorSelection('toString'),null));
 await test('5 story cards plus final brand need 4 real photos with AI cover',()=>{const p=generatorMediaPlan(settings,'growth_carousel',5,0);assert.equal(p.total,6);assert.equal(p.realPhotos,4);});
 await test('3 story cards plus brand need 3 real photos and no AI',()=>{const p=generatorMediaPlan(settings,'growth_carousel',3,0);assert.equal(p.total,4);assert.equal(p.realPhotos,3);assert.equal(p.aiSlot,null);});
 await test('all-real images, legacy format and alternating counts',()=>{assert.equal(generatorMediaPlan(settings,'growth_carousel',5,null).realPhotos,5);assert.equal(generatorMediaPlan(settings,'prelaunch',5,0).realPhotos,3);const p=generatorMediaPlan({...settings,carousel_mode:'alternating'},'growth_carousel',0,0);assert.equal(p.known,false);assert.equal(p.aiSlot,null);});
 await test('render keeps saved language and rejects invalid saved content',()=>{assert.equal(savedRenderContent(makeDraft('x')).language,'en');assert.throws(()=>savedRenderContent({content_mode:'invalid'}),/INVALID_SAVED_CONTENT_TYPE/);});
 console.log('PASS '+checks+' generator interaction checks with real React state and mocked HTTP. No live AI or Instagram calls.');
}finally{if(renderer)await act(async()=>renderer.unmount());}
