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
const approvedAssets=[1,2].map(n=>({
 id:'aaaaaaaa-aaaa-4aaa-8aaa-00000000000'+n,review_status:'approved',provider:'pexels',
 photographer:'Approved Photographer '+n,license_name:'Pexels commercial reuse',
 preview_url:'https://example.invalid/approved-'+n+'.jpg'
}));
const makeDraft=(id,kind='brand',lang='en')=>({id,revision:2,status:'needs_approval',draft_role:'candidate',visual_source:'stock',draft_kind:kind,content_mode:'prelaunch',content_language:lang,growth_topic_type:kind==='growth_carousel'?'conversation_prompt':null,caption:'A concrete original caption.',images:Array(5).fill('https://example.invalid/card.jpg'),carousel_slides:['cover','context','insight','insight','editorial_closing'].map(role=>({role,title:'Saved '+role,body:'Original copy.'})),content_document:{design_preset:'roundy_magazine_editorial_v2',photo_sourcing:{version:1,slide_count:5,min_real_photos:3,ai_thumbnail_enabled:true,requested_ai_thumbnail:true,ai_image_slot:0}},quality_report:{status:'passed'},draft_date:'2026-10-12',updated_at:'2026-10-12T10:00:00Z'});
let drafts=[makeDraft('11111111-1111-4111-8111-111111111111'),makeDraft('22222222-2222-4222-8222-222222222222','growth_carousel','ko')],createdDraft;
async function fakeFetch(url,init={}){
 const route=String(url).replace('/api/admin/marketing',''),body=init.body?JSON.parse(init.body):null;requests.push({route,body,method:init.method||'GET'});
 let data;
 if(route==='')data={drafts,runs:[],templates:[],settings,generation:gen,connection:{instagram_status:'valid'},live_events:[]};
 else if(route==='/generation')data=gen;
 else if(route.startsWith('/quality/preflight?')){const id=new URLSearchParams(route.split('?')[1]).get('draft_id');data={draft_id:id,revision:2,preflight:{status:'passed',checks:[]},quality_report:{status:'passed'}};}
 else if(route==='/photos/assets?status=approved')data={assets:approvedAssets};
 else if(route.startsWith('/photos?'))data={photos:[],ready:false,required_count:4};
 else if(route.endsWith('/assign-stock')){
  const id=route.split('/')[2],target=drafts.find(d=>d.id===id);
  if(!target)throw Error('Assignment target does not exist');
  if(body.revision!==target.revision)throw Error('Stale revision');
  if(!['aaaaaaaa-aaaa-4aaa-8aaa-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-000000000002'].includes(body.asset_id))throw Error('Unapproved asset');
  if(![1,2,3,4].includes(body.slot))throw Error('Invalid card photo slot');
  target.revision++;
  data={draft:{...target},photos:[{slot:body.slot,asset_id:body.asset_id,review_status:'approved'}]};
 }
 else if(route.startsWith('/uploads?'))data={images:[]};
 else if(route.endsWith('/regenerate')){const id=route.split('/')[2];data={draft:drafts.find(d=>d.id===id),job:{id:'render-job',status:'completed'}};}
 else if(route==='/draft/generate'){
  createdDraft={...makeDraft('33333333-3333-4333-8333-333333333333','growth_carousel','ko'),growth_topic_type:body.topic_type,
   images:[],carousel_slides:['cover','context','insight','insight','editorial_closing','brand_outro'].map(role=>({role,title:'New '+role,body:'Original body'})),
   content_document:{design_preset:'roundy_magazine_editorial_v2',brand_outro_version:1,photo_sourcing:{version:2,slide_count:6,min_real_photos:4,ai_thumbnail_enabled:true,requested_ai_thumbnail:true,ai_image_slot:0}}};
  data={draft:createdDraft,job:{id:'new-job',status:'completed'}};
 }
 else if(route==='/generation/jobs/new-job/import'){drafts=[createdDraft,...drafts];data={draft:createdDraft};}
 else throw new Error('Unexpected API route in test: '+route);
 return {ok:true,status:200,json:async()=>data};
}
function stubModule(name){
 if(name==='./heading')return {Heading:({children,level=2})=>React.createElement('h'+level,null,children)};
 if(name==='./admin-marketing-editorial-studio')return {AdminMarketingEditorialStudio:props=>React.createElement(React.Fragment,null,React.createElement('button',{'data-test':'saved-render',onClick:props.onRerenderCover},'Render saved draft'),props.renderPhotoEditor&&React.createElement('div',{id:'roundy-marketing-photo-editor'},props.renderPhotoEditor(1)))};
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
  await test(locale+' new-post composer starts open even when drafts exist',()=>{
   const generator=renderer.root.findAllByType('details').find(e=>e.props.className==='marketing-generator-card');
   assert.ok(generator?.props.open,'New content is visible, not silently collapsed');
  });
  await test(locale+' unified visual selector has three labeled modes and four real-photo slots',()=>{
   const workflow=renderer.root.findByProps({'data-testid':'marketing-visual-workflow'});
   const modes=workflow.findAllByProps({className:'marketing-image-mode-grid'})[0].findAllByType('button');
   assert.equal(modes.length,3);assert.equal(modes.filter(b=>b.props['aria-pressed']===true).length,1);
   assert.equal(workflow.findAllByProps({className:'marketing-photo-plan-card'}).length,5);
   assert.equal(workflow.findAllByProps({className:'marketing-photo-plan-brand'}).length,1);
  });
  const plannedCards=()=>renderer.root.findAllByProps({className:'marketing-photo-plan-card'});
  const selectPhoto=async(index,assetIndex)=>{
   const slot=plannedCards()[index];
   const btn=slot.findAllByType('button').find(b=>text(b)===(locale==='ko'?'사진 선택':'Choose photo'));
   assert.ok(btn,'Selection exists for story card '+index);
   await act(async()=>{btn.props.onClick();await tick();});
   const gallery=renderer.root.findByProps({'data-testid':'marketing-approved-photo-grid'});
   const actions=gallery.findAllByProps({className:'marketing-approved-picker-actions'});
   const use=actions.map(section=>section.findByType('button'));
   assert.equal(use.length,2);
   assert.equal(Boolean(use[0].props.disabled),assetIndex===1,'Selected image cannot be duplicated on a different card');
   assert.equal(Boolean(use[assetIndex].props.disabled),false,'The intended photo remains selectable');
   await act(async()=>{use[assetIndex].props.onClick();await tick();});
  };
  await selectPhoto(1,0);
  await test(locale+' gallery choice is local only, no draft mutation before generation',()=>{
   assert.equal(requests.filter(r=>r.route.endsWith('/assign-stock')).length,0);
   assert.equal(requests.filter(r=>r.route==='/photos/assets?status=approved').length,1);
   assert.equal(plannedCards()[1].findAllByType('img').length,1);
  });
  await selectPhoto(2,1);
  await test(locale+' separate slots do not reuse a selected approved asset',()=>{
   assert.equal(plannedCards()[2].findAllByType('img').length,1);
   assert.equal(requests.filter(r=>r.route.endsWith('/assign-stock')).length,0);
  });
  await choose('ko');
  const directionField=renderer.root.findAllByType('textarea').find(x=>x.props.maxLength===500);
  await act(async()=>{directionField.props.onChange({target:{value:'첫인상의 설렘만으로 관계를 단정할 수 있을까?'},currentTarget:{value:'첫인상의 설렘만으로 관계를 단정할 수 있을까?'}});await tick();});
  const createButton=renderer.root.findAllByType('button').find(b=>text(b)===(locale==='ko'?'콘텐츠 생성':'Generate content'));
  assert.ok(createButton,'Create button exists');
  await act(async()=>{createButton.props.onClick();await tick();});
  const creation=requests.find(r=>r.route==='/draft/generate');
  await test(locale+' selected approved photos are assigned after import with fresh revisions',()=>{
   const assignment=requests.filter(r=>r.route.endsWith('/assign-stock'));
   assert.equal(assignment.length,2);
   assert.deepEqual(assignment.map(a=>a.body.slot),[1,2]);
   assert.deepEqual(assignment.map(a=>a.body.revision),[2,3]);
   assert.equal(assignment.every(a=>a.body.confirm_replace===false),true);
   const oldDrafts=drafts.filter(d=>!d.id.startsWith('3333'));
   assert.ok(oldDrafts.every(d=>d.revision===2),'Existing drafts untouched');
  });
  await test(locale+' generate submits requested myth once and imports once',()=>{assert.ok(creation);assert.equal(creation.body.topic_type,'dating_myth');assert.equal(creation.body.content_mode,'growth_carousel');assert.equal(creation.body.language,'ko');assert.equal(requests.filter(r=>r.route==='/draft/generate').length,1);assert.equal(requests.filter(r=>r.route==='/generation/jobs/new-job/import').length,1);});
  await test(locale+' generating does not approve or publish',()=>assert.equal(requests.filter(r=>r.method!=='GET'&&/\/(approve|publish|schedule)(?:\/|$)/.test(r.route)).length,0));
  await act(async()=>renderer.unmount());renderer=null;
 }
 const {generatorSelection,generatorMediaPlan,savedRenderContent,savedDraftMediaPlan}=load('src/lib/marketing-generator-ui.ts');
 await test('invalid UI values do not throw',()=>assert.equal(generatorSelection('toString'),null));
 await test('5 story cards plus final brand need 4 real photos with AI cover',()=>{const p=generatorMediaPlan(settings,'growth_carousel',5,0);assert.equal(p.total,6);assert.equal(p.realPhotos,4);});
 await test('3 story cards plus brand need 3 real photos and no AI',()=>{const p=generatorMediaPlan(settings,'growth_carousel',3,0);assert.equal(p.total,4);assert.equal(p.realPhotos,3);assert.equal(p.aiSlot,null);});
 await test('all-real images, legacy format and alternating counts',()=>{assert.equal(generatorMediaPlan(settings,'growth_carousel',5,null).realPhotos,5);assert.equal(generatorMediaPlan(settings,'prelaunch',5,0).realPhotos,3);const p=generatorMediaPlan({...settings,carousel_mode:'alternating'},'growth_carousel',0,0);assert.equal(p.known,false);assert.equal(p.aiSlot,null);});
 await test('render keeps saved language and rejects invalid saved content',()=>{assert.equal(savedRenderContent(makeDraft('x')).language,'en');assert.throws(()=>savedRenderContent({content_mode:'invalid'}),/INVALID_SAVED_CONTENT_TYPE/);});

 const brandedDraft=(stories,aiSlot)=>({...makeDraft('44444444-4444-4444-8444-444444444444','growth_carousel','ko'),images:[],carousel_slides:[...Array.from({length:stories},(_,index)=>({role:index===0?'cover':index===stories-1?'editorial_closing':'insight',title:'Card '+index,body:'Saved body'})),{role:'brand_outro',title:'Roundy',body:'Brand introduction'}],content_document:{design_preset:'roundy_magazine_editorial_v2',brand_outro_version:1,photo_sourcing:{version:2,slide_count:stories+1,min_real_photos:stories-(aiSlot===null?0:1),ai_thumbnail_enabled:aiSlot===0,requested_ai_thumbnail:aiSlot===0,ai_image_slot:aiSlot}}});
 for(const stories of [3,5])for(const locale of ['ko','en']){
  drafts=[brandedDraft(stories,stories===5?0:null)];
  await act(async()=>{renderer=create(React.createElement(AdminMarketing,{locale}));await tick();});
  const editor=renderer.root.findByProps({id:'roundy-marketing-photo-editor'});
  const options=editor.findAllByType('select')[0].findAllByType('option');
  await test(locale+' branded '+(stories+1)+'-card editor displays saved AI value',()=>{assert.ok(options.some(o=>String(o.props.value)===String(stories===5?0:'none')));assert.equal(options.find(o=>o.props.value==='none').props.disabled,undefined);assert.equal(options.filter(o=>o.props.value!=='none').length,stories===5?4:0);});
  await test(locale+' branded real-photo count follows shared policy',()=>{const plan=savedDraftMediaPlan(drafts[0]);assert.equal(plan.realPhotos,stories===5?4:3);assert.equal(plan.realSlots.includes(stories),false);});
  await act(async()=>renderer.unmount());renderer=null;
 }
 await test('legacy no-AI layout keeps exact three-photo cap',()=>{const d=makeDraft('legacy');d.content_document.photo_sourcing={version:1,slide_count:5,min_real_photos:3,ai_thumbnail_enabled:false,requested_ai_thumbnail:false,ai_image_slot:null};const plan=savedDraftMediaPlan(d);assert.equal(plan.realPhotos,3);assert.equal(plan.realSlots.length,3);assert.equal(generatorMediaPlan(settings,'prelaunch',5,null).realPhotos,3);});
 await test('six-card all-real layout requires five approved photos',()=>assert.equal(savedDraftMediaPlan(brandedDraft(5,null)).realPhotos,5));
 console.log('PASS '+checks+' generator interaction checks with real React state and mocked HTTP. No live AI or Instagram calls.');
}finally{if(renderer)await act(async()=>renderer.unmount());}
