import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=path=>fs.readFileSync(path,'utf8');
const compile=code=>ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const clone=value=>structuredClone(value);
function declarations(path,names){
 const source=read(path),file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
 return names.map(name=>{
  const node=file.statements.find(s=>ts.isFunctionDeclaration(s)?s.name?.text===name:
   ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(file)===name));
  assert.ok(node,'Missing production declaration '+name);return node.getText(file);
 }).join('\n');
}
const stockContext={exports:{},Error};
vm.runInNewContext(compile(declarations('src/lib/marketing-stock-photos.ts',['check','importStockSelections'])),stockContext);
const realImportStockSelections=stockContext.exports.importStockSelections;
const workflow={exports:{},Error,Date,require:()=>({})};
vm.runInNewContext(compile(read('src/lib/marketing-workflow.ts')),workflow);
const jobId='11111111-1111-4111-8111-111111111111';
const sourceId='22222222-2222-4222-8222-222222222222';
const candidateId='33333333-3333-4333-8333-333333333333';
const assetId='44444444-4444-4444-8444-444444444444';
const otherAssetId='55555555-5555-4555-8555-555555555555';
const request={method:'POST',json:async()=>({confirm_import:true})};
function harness({visualSource='stock',language='ko',snapshotPatch={},jobPatch={},existing=null}={}){
 const snapshot={draft_id:sourceId,draft_date:'2026-10-12',draft_kind:'growth_carousel',content_mode:'prelaunch',growth_topic_type:'mbti',content_language:language,
  caption:language==='ko'?'저장된 검토용 원고':'Saved copy for review',cta:'',destination_url:'https://roundy.team',
  carousel_slides:[{role:'cover',title:'Saved headline',body:'Saved scene'},
   {role:'key_insight',title:'Saved insight',body:'Original wording'},
   {role:'editorial_closing',title:'Saved ending',body:'Unchanged ending'},
   {role:'brand_outro',title:'Roundy',body:'Separate introduction'}],
  images:[],visual_source:visualSource,render_style:'editorial',editorial_review_required:true,
  content_document:{design_preset:'roundy_magazine_editorial_v2',brand_outro_version:1,editorial_review_required:true,source_review_required:false},
  quality_report:{version:2,status:'rejected',review_required:true,issues:['Needs a more concrete scene']},...clone(snapshotPatch)};
 const base={id:sourceId,status:'needs_approval',draft_role:'candidate',revision:1,caption:'Original workspace',images:[],carousel_slides:[],visual_source:visualSource,imported_at:null};
 const job={id:jobId,draft_id:sourceId,status:'completed',stage:'editorial_review_required',result_snapshot:snapshot,automatic:false,...clone(jobPatch)};
 const rows={marketing_generation_jobs:[job],instagram_post_drafts:[base,...(existing?[{...clone(snapshot),...clone(existing),id:candidateId,source_generation_job_id:jobId}]:[])],marketing_draft_photos:[]};
 const writes=[],photoImports=[],rpcCalls=[];
 const before=JSON.stringify({base,job});
 class Q{
  constructor(table){this.table=table;this.filters=[];this.n=Infinity;this.action=null;}
  select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}
  order(){return this;}limit(n){this.n=n;return this;}
  insert(value){this.action={type:'insert',value};return this;}
  update(value){this.action={type:'update',value};return this;}
  upsert(value,options){this.action={type:'upsert',value,options};return this;}
  single(){return this.exec(true);}maybeSingle(){return this.exec(true);}then(a,b){return this.exec().then(a,b);}
  exec(single=false){
   const table=rows[this.table]||(rows[this.table]=[]);
   let selected=table.filter(r=>this.filters.every(f=>f(r))).slice(0,this.n);
   if(this.action){
    const {type,value,options}=this.action;writes.push({table:this.table,type,value:clone(value)});
    if(type==='insert'){
     selected=(Array.isArray(value)?value:[value]).map(v=>({id:candidateId,...clone(v)}));table.push(...selected);
    }else if(type==='update')selected.forEach(r=>Object.assign(r,clone(value)));
    else if(type==='upsert'){
     selected=[];
     for(const v of value){
      const old=table.find(r=>r.draft_id===v.draft_id&&r.slot===v.slot);
      if(old){if(!options?.ignoreDuplicates)Object.assign(old,clone(v));selected.push(old);}
      else {const added=clone(v);table.push(added);selected.push(added);}
     }
    }
   }
   return Promise.resolve({data:clone(single?selected[0]||null:selected),error:null});
  }
 }
 const service={from:table=>new Q(table),rpc:async(name,args)=>{
  rpcCalls.push({name,args});assert.equal(name,'create_marketing_candidate_from_generation','Unexpected RPC (publication is forbidden)');
  assert.equal(snapshot.quality_report.status,'passed','Rejected copy entered the passing-result RPC');
  const result={...clone(snapshot),id:candidateId,source_generation_job_id:jobId,revision:1,status:'needs_approval',draft_role:'candidate',approved_at:null,approved_by:null,marketing_run_id:null,published_at:null,scheduled_for:null,imported_at:'2026-10-12T14:30:00Z'};
  rows.instagram_post_drafts.push(result);return {data:clone(result),error:null};
 }};
 const stock={importStockSelections:async(db,id,photos)=>{
  photoImports.push({id,photos:clone(photos)});return realImportStockSelections(db,id,photos);
 }};
 const workspace={exports:{},Error,Date,require:name=>{
  if(name==='./marketing-workflow')return workflow.exports;
  if(name==='./marketing-stock-photos')return stock;
  return {};
 }};
 vm.runInNewContext(compile(read('src/lib/marketing-editorial-workspace.ts')),workspace);
 const context={exports:{},Error,Date,URL,console,process:{env:{}},fetch:()=>{throw Error('Unexpected live fetch');},require:name=>{
  if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options.status})}};
  if(name==='./supabase/service')return {createServiceRoleClient:()=>service};
  if(name==='./marketing-editorial-workspace')return workspace.exports;
  if(name==='./marketing-stock-photos')return stock;
  if(name==='node:crypto')return require(name);
  if(name==='./marketing-generation')return {runGeneration:()=>{throw Error('Import must not generate content');}};
  return {};
 }};
 vm.runInNewContext(compile(read('src/lib/marketing.ts')),context);
 const call=(confirmation=true)=>context.exports.marketingApi({...request,json:async()=>({confirm_import:confirmation})},{},['generation','jobs',jobId,'import']);
 return {call,rows,writes,photoImports,rpcCalls,service,snapshot,assertSourceUnchanged:()=>assert.equal(JSON.stringify({base:rows.instagram_post_drafts[0],job:rows.marketing_generation_jobs[0]}),before)};
}
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
if(process.argv.includes('--expect-unfixed')){
 const h=harness(),r=await h.call();
 assert.equal(r.status,400);assert.equal(r.body.error,'STOCK_PHOTO_SNAPSHOT_UNAVAILABLE');
 assert.equal(h.rows.instagram_post_drafts.length,2);assert.ok(h.rows.instagram_post_drafts[1].imported_at);
 assert.equal(h.photoImports.length,2);h.assertSourceUnchanged();
 console.log('REPRODUCED: copy was imported successfully, then duplicate stock restoration rejected the absent pre-photo snapshot.');
}else{
 for(const visualSource of ['stock','pexels'])for(const language of ['ko','en']){
  const h=harness({visualSource,language}),r=await h.call();
  check(visualSource+' '+language+' opens historical pre-photo review copy',()=>{
   assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.draft.id,candidateId);
   assert.equal(r.body.draft.content_language,language);assert.equal(r.body.draft.images.length,0);
   assert.equal(r.body.draft.quality_report.status,'rejected');assert.equal(r.body.draft.content_document.editorial_review_required,true);
   assert.equal(r.body.draft.approved_at,null);assert.equal(r.body.draft.marketing_run_id,null);
   assert.equal(h.rpcCalls.length,0);assert.equal(h.photoImports.length,1);assert.equal(h.photoImports[0].photos.length,0);
   assert.ok(r.body.draft.imported_at);h.assertSourceUnchanged();
  });
  const beforeWrites=h.writes.length,again=await h.call();
  check(visualSource+' '+language+' repeat import is read-only and keeps same candidate',()=>{
   assert.equal(again.status,200);assert.equal(again.body.draft.id,candidateId);assert.equal(h.rows.instagram_post_drafts.length,2);
   assert.equal(h.writes.length,beforeWrites);assert.equal(h.photoImports.length,1);h.assertSourceUnchanged();
  });
 }
 for(const value of [null,[],[{asset_id:assetId,slot:1}]]){
  const h=harness({snapshotPatch:{stock_photo_selections:value}}),r=await h.call();
  check('review snapshot '+JSON.stringify(value)+' restores only once',()=>{
   assert.equal(r.status,200);assert.equal(h.photoImports.length,1);
   assert.equal(h.rows.marketing_draft_photos.length,value?.length||0);h.assertSourceUnchanged();
  });
 }
 {
  const h=harness({existing:{revision:7,status:'needs_approval',imported_at:'2026-10-12T14:26:58Z',caption:'Admin-edited copy',visual_source:'uploaded',images:['https://example.invalid/new-card.jpg']}});
  h.rows.marketing_draft_photos.push({draft_id:candidateId,asset_id:otherAssetId,slot:1});
  const before=JSON.stringify(h.rows),r=await h.call();
  check('already imported user draft opens without stale snapshot overwrites',()=>{
   assert.equal(r.status,200);assert.equal(r.body.draft.revision,7);assert.equal(r.body.draft.caption,'Admin-edited copy');
   assert.equal(r.body.draft.visual_source,'uploaded');assert.equal(h.writes.length,0);assert.equal(h.photoImports.length,0);
   assert.equal(JSON.stringify(h.rows),before);
  });
 }
 {
  const h=harness({snapshotPatch:{quality_report:{status:'passed'},editorial_review_required:false,stock_photo_selections:[{asset_id:assetId,slot:1}]}}),r=await h.call();
  check('passing stock results keep existing atomic candidate path and photo validation',()=>{
   assert.equal(r.status,200);assert.equal(h.rpcCalls.length,1);assert.equal(h.photoImports.length,1);assert.equal(h.rows.marketing_draft_photos[0].asset_id,assetId);
   assert.equal(r.body.draft.status,'needs_approval');assert.equal(r.body.draft.approved_at,null);h.assertSourceUnchanged();
  });
  const writes=h.writes.length;const again=await h.call();
  check('reopening passing result does not repeat photo import or atomic creation',()=>{
   assert.equal(again.status,200);assert.equal(h.rpcCalls.length,1);assert.equal(h.photoImports.length,1);assert.equal(h.writes.length,writes);
  });
 }
 for(const visualSource of ['none','uploaded']){
  const h=harness({visualSource}),r=await h.call();
  check(visualSource+' review copy does not require a stock snapshot',()=>{assert.equal(r.status,200);assert.equal(h.photoImports.length,0);h.assertSourceUnchanged();});
 }
 for(const [name,args,confirmation,error] of [
  ['confirmation',{},false,'IMPORT_CONFIRMATION_REQUIRED'],
  ['failed job',{jobPatch:{status:'failed'}},true,'RESULT_NOT_COMPLETE'],
  ['uncertain job',{jobPatch:{status:'uncertain'}},true,'RESULT_NOT_COMPLETE'],
  ['published candidate',{existing:{status:'published',imported_at:'2026-10-12T14:00:00Z'}},true,'RESULT_ALREADY_USED'],
  ['scheduled candidate',{existing:{status:'scheduled',imported_at:'2026-10-12T14:00:00Z'}},true,'RESULT_ALREADY_USED'],
  ['missing copy',{snapshotPatch:{caption:'',carousel_slides:[]}},true,'SAVED_COPY_NOT_AVAILABLE'],
 ]){
  const h=harness(args),r=await h.call(confirmation);
  check(name+' still rejected',()=>{assert.equal(r.status,400);assert.equal(r.body.error,error);assert.equal(h.writes.length,0);assert.equal(h.rpcCalls.length,0);assert.equal(h.photoImports.length,0);h.assertSourceUnchanged();});
 }
 for(const value of [undefined,null,'invalid',{},Array(6).fill({asset_id:assetId,slot:1}),[{asset_id:'invalid',slot:0}],[{asset_id:assetId,slot:7}],[{asset_id:assetId,slot:0},{asset_id:assetId,slot:1}]]){
  const h=harness();await assert.rejects(()=>realImportStockSelections(h.service,candidateId,value),/STOCK_PHOTO_SNAPSHOT/);
  check('strict stock importer still rejects '+JSON.stringify(value),()=>assert.equal(h.writes.length,0));
 }
 console.log(`PASS ${checks} actual import-route/workspace/stock-import assertions with in-memory DB only; no live providers, generation, approvals or publishing.`);
}
