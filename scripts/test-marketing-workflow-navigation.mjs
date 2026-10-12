import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),cache={};
function load(file){
 if(cache[file])return cache[file];
 const context={exports:{},Date,console,require:name=>name.startsWith('./')?load('src/lib/'+name.slice(2)+'.ts'):require(name)};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context,{filename:file});
 return cache[file]=context.exports;
}
const {workflowNavigation,carouselCounts,focusWorkflowTarget}=load('src/lib/marketing-workflow-navigation.ts');
const copy={id:'draft',status:'needs_approval',caption:'Saved copy',carousel_slides:[{title:'Cover',body:'Copy'}],images:['https://example.invalid/a.jpg'],content_document:{},quality_report:{status:'passed'}};
let count=0;
const check=(label,fn)=>{fn();count++;};
check('ready has final action',()=>{const next=workflowNavigation(copy);assert.equal(next.phase,2);assert.equal(next.targets[0],'#roundy-marketing-approval');});
for(const state of ['published','scheduled','sent','queued'])check('terminal '+state,()=>{const next=workflowNavigation({...copy,status:state});assert.equal(next.action,null);assert.equal(next.targets.length,0);});
for(const state of ['running','uncertain','failed'])check('nonterminal '+state,()=>{const next=workflowNavigation({...copy,status:state});assert.equal(next.phase,null);assert.equal(next.action,null);});
check('empty targets generator',()=>assert.equal(workflowNavigation(null).targets[0],'.marketing-generator-card'));
check('topic review targets generator',()=>assert.equal(workflowNavigation({status:'failed',error_code:'TOPIC_CANDIDATES_DISCARDED'}).targets[0],'.marketing-generator-card'));
for(const [field,value] of [['source_review_required',true],['editorial_review_required',true],['translation_pending_indices',[0]]])check(field,()=>{const next=workflowNavigation({...copy,content_document:{[field]:value}});assert.equal(next.phase,0);assert.equal(next.targets[0],'#roundy-editorial-studio');});
check('photo review',()=>{const next=workflowNavigation({...copy,photos_pending_review:true});assert.equal(next.phase,1);assert.equal(next.targets[0],'#roundy-marketing-photo-editor');});
check('render targets required action first',()=>{const next=workflowNavigation({...copy,content_document:{thumbnail_render_pending:true}});assert.equal(next.phase,1);assert.equal(next.targets[0],'#roundy-editorial-render-action');});
for(const stories of [3,5])check(stories+' stories plus brand',()=>{const counts=carouselCounts({...copy,carousel_slides:Array(stories+1).fill({}),content_document:{brand_outro_version:1}});assert.equal(counts.total,stories+1);assert.equal(counts.stories,stories);assert.equal(counts.brand,1);});
check('legacy count preserved',()=>assert.equal(carouselCounts({...copy,carousel_slides:Array(5).fill({})}).stories,5));
check('empty count never negative',()=>{assert.equal(carouselCounts({content_document:{brand_outro_version:1}}).stories,0);assert.equal(carouselCounts(null).brand,0);});
check('missing anchor does not throw',()=>assert.equal(focusWorkflowTarget(['#missing'],{querySelector:()=>null}),false));
check('hidden anchor falls back',()=>{let focused=false;const target={closest:()=>null,tagName:'SECTION',parentElement:null,getAttribute:()=>'-1',focus:()=>{focused=true;},scrollIntoView:()=>{}};assert.equal(focusWorkflowTarget(['#hidden','#fallback'],{querySelector:id=>id==='#hidden'?{closest:()=>({})}:target}),true);assert.equal(focused,true);});
check('opens nested disclosures, focuses and restores tabindex',()=>{
 const outer={tagName:'DETAILS',open:false,parentElement:null};
 const parent={tagName:'DETAILS',open:false,parentElement:outer};
 const events=[],attributes=new Map(),handlers={};
 const target={tagName:'SECTION',parentElement:parent,closest:()=>null,getAttribute:key=>attributes.get(key)??null,setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),addEventListener:(event,fn)=>{handlers[event]=fn;},focus:()=>events.push('focus'),scrollIntoView:()=>events.push('scroll')};
 assert.equal(focusWorkflowTarget(['#target'],{querySelector:()=>target}),true);
 assert.equal(parent.open,true);assert.equal(outer.open,true);assert.equal(attributes.get('tabindex'),'-1');assert.deepEqual(events,['focus','scroll']);handlers.blur();assert.equal(attributes.has('tabindex'),false);
});
const source=fs.readFileSync('src/lib/marketing-workflow-navigation.ts','utf8');
check('navigation has no paid/publish actions',()=>assert.doesNotMatch(source,/\b(fetch|rpc|media_publish|reserve_marketing_generation)\s*\(/));
console.log(`PASS ${count} workflow navigation assertions. No browser session or external requests used.`);
