import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;

// Real local-font loader, isolated filesystem failures and forbidden network.
{
 let reads=0,healthy=false;
 const context={exports:{},Uint8Array,ArrayBuffer,Buffer,Promise,process:{cwd:()=>'/fixture'},require:name=>{
  if(name==='node:fs/promises')return {readFile:async p=>{reads++;if(!healthy)throw Error('missing');const b=Buffer.alloc(256);b.write(p.endsWith('.otf')?'OTTO':'wOFF');return b;}};
  return require(name);
 },fetch:()=>{throw Error('Runtime font network is forbidden');}};
 vm.runInNewContext(compile('src/lib/marketing-render-assets.ts'),context);
 await assert.rejects(()=>context.exports.loadEditorialAssets(),/FONT_ASSET_UNAVAILABLE/);
 assert.equal(reads,4);healthy=true;
 const [a,b]=await Promise.all([context.exports.loadEditorialAssets(),context.exports.loadEditorialAssets()]);
 assert.equal(reads,8);assert.equal(a.fonts.length,6);assert.equal(b.fonts.length,6);
 await context.exports.loadEditorialAssets();assert.equal(reads,8);
 console.log('PASS local fonts fail closed, retry cleanly and never use runtime network');
}

// Test the actual selection writer. Rights/scene predicates are isolated here;
// the existing stock-photo policy suite separately covers the real predicates.
async function assignPhotos({fail=false,concurrent=false,replace=false}={}){
 const photos=Array.from({length:4},(_,i)=>({id:'asset-'+i,asset_id:'asset-'+i,review_status:'approved',
  storage_path:'photo/'+i,topic_key:'conversation_prompt',width:1080,height:1350}));
 const tables={marketing_photo_assets:photos,marketing_draft_photos:[{draft_id:'draft',slot:0,asset_id:'asset-0'}]};
 let upserts=0,deletes=0;
 class Q{
  constructor(table){this.table=table;this.filters=[];}
  select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}
  neq(k,v){this.filters.push(r=>r[k]!==v);return this;}gte(){return this;}
  order(){return this;}limit(){return this;}
  upsert(rows,options){this.write=rows;this.options=options;return this;}
  delete(){deletes++;throw Error('Delete-before-insert would lose saved photos');}
  then(resolve,reject){return this.exec().then(resolve,reject);}
  async exec(){
   if(this.write){
    upserts++;assert.equal(this.table,'marketing_draft_photos');
    if(concurrent)tables.marketing_draft_photos.push({draft_id:'draft',slot:1,asset_id:'asset-3'});
    if(fail)return {data:null,error:{message:'simulated atomic write failure'}};
    for(const item of this.write){
     const old=tables.marketing_draft_photos.find(r=>r.draft_id===item.draft_id&&r.slot===item.slot);
     if(old){if(!this.options.ignoreDuplicates)Object.assign(old,item);}else tables.marketing_draft_photos.push({...item});
    }
   }
   let data=(tables[this.table]||[]).filter(r=>this.filters.every(f=>f(r)));
   if(this.table==='marketing_draft_photos')data=data.map(r=>({...r,marketing_photo_assets:photos.find(p=>p.id===r.asset_id)}));
   return {data,error:null};
  }
 }
 const context={exports:{},Buffer,Date,Map,Set,URL,AbortSignal,console,require:name=>{
  if(name==='server-only')return {};
  if(name==='./marketing-editor-first')return {isEditorFirst:()=>true};
  if(name==='./marketing-stock-photo-policy')return {savedPhotoSourcingPolicy:()=>null,requiredPhotoSlotsForRoles:()=>[0,1,2]};
  if(name==='./marketing-photo-rights')return {PHOTO_PROVIDERS:[],validLicensedPhoto:()=>true};
  if(name==='./marketing-photo-providers')return {};
  if(name==='./marketing-photo-intent')return {approvedPhotoFitsScene:()=>true};
  if(name==='sharp')return ()=>{throw Error('This selection path must not render images');};
  return require(name);
 }};
 vm.runInNewContext(compile('src/lib/marketing-stock-photos.ts'),context);
 let error;
 try{await context.exports.prepareStockSelections({from:t=>new Q(t)},
  {id:'draft',draft_kind:'growth_carousel',growth_topic_type:'conversation_prompt',carousel_slides:[{},{},{}]}, {replace});}
 catch(e){error=e;}
 return {tables,upserts,deletes,error};
}
{
 const r=await assignPhotos({fail:true});assert.match(r.error.message,/atomic write failure/);
 assert.equal(r.deletes,0);assert.equal(r.tables.marketing_draft_photos.length,1);
 assert.equal(r.tables.marketing_draft_photos[0].asset_id,'asset-0');
 console.log('PASS rejected assignment upsert leaves the previous approved photo untouched');
}
{
 const r=await assignPhotos({concurrent:true});assert.equal(r.error,undefined);assert.equal(r.upserts,1);
 assert.equal(r.tables.marketing_draft_photos.find(r=>r.slot===1).asset_id,'asset-3');
 assert.equal(r.tables.marketing_draft_photos.find(r=>r.slot===0).asset_id,'asset-0');
 console.log('PASS fill-missing does not overwrite a concurrent human photo selection');
}
{
 const r=await assignPhotos({replace:true,fail:true});assert.match(r.error.message,/atomic write failure/);
 assert.equal(r.deletes,0);assert.equal(r.tables.marketing_draft_photos[0].asset_id,'asset-0');
 console.log('PASS failed explicit replacement cannot erase earlier assignments');
}
