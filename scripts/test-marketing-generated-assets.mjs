import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),sharp=require('sharp');
const context={exports:{},Buffer,require};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/marketing-generated-assets.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);
const api=context.exports,objects=new Map();let uploads=0,corrupt=false,fail=false;
const db={storage:{from:bucket=>{assert.equal(bucket,'marketing-images');return {
 upload:async(p,b,o)=>{uploads++;assert.equal(o.upsert,false);if(fail)return {error:{message:'offline'}};objects.set(p,b);return {error:null};},
 download:async p=>({data:objects.has(p)?{arrayBuffer:async()=>corrupt?Buffer.from('corrupt'):objects.get(p)}:null,error:null})
};}}};
const key=api.generatedAssetKey('specific cover scene','test-model');
assert.notEqual(key,api.generatedAssetKey('different scene','test-model'));
assert.equal(await api.loadGeneratedAsset(db,{},key),null);
const jpeg=await sharp({create:{width:512,height:640,channels:3,background:'#ddd'}}).jpeg().toBuffer();
const saved=await api.persistGeneratedAsset(db,'11111111-1111-4111-8111-111111111111',key,jpeg.toString('base64'));
const doc={generated_ai_assets:{[key]:saved.asset}};
assert.equal(await api.loadGeneratedAsset(db,doc,key),saved.image);assert.equal(uploads,1);
assert.equal((await sharp(Buffer.from(saved.image.split(',')[1],'base64')).metadata()).width,1080);
assert.equal(await api.loadGeneratedAsset(db,doc,api.generatedAssetKey('changed title','test-model')),null);
corrupt=true;await assert.rejects(()=>api.loadGeneratedAsset(db,doc,key),/AI_ASSET_RECOVERY_REQUIRED/);corrupt=false;
await assert.rejects(()=>api.loadGeneratedAsset(db,{generated_ai_assets:{[key]:{...saved.asset,path:'../../private'}}},key),/AI_ASSET_RECOVERY_REQUIRED/);
objects.clear();await assert.rejects(()=>api.loadGeneratedAsset(db,doc,key),/AI_ASSET_RECOVERY_REQUIRED/);
fail=true;await assert.rejects(()=>api.persistGeneratedAsset(db,'11111111-1111-4111-8111-111111111111',key,jpeg.toString('base64')),/AI_ASSET_SAVE_FAILED/);
console.log('PASS private AI image durability, exact-context reuse, changed-context isolation, corrupt/missing asset and failed-save safeguards');

// Reuse the generator suite's external-service fixtures, not a replacement generator.
// Fault injection is limited to storage; runGeneration and asset helpers are real.
let harnessSource=fs.readFileSync('scripts/test-marketing-generation.mjs','utf8').split("\nfor(const language of ['en','ko'])")[0];
assert.ok(harnessSource.includes('function harness('));
harnessSource=harnessSource.replace(/^import .*;\n/gm,'').replace('const require=createRequire(import.meta.url),','const ');
const replaceOnce=(old,value)=>{assert.equal(harnessSource.split(old).length,2,'Fixture anchor changed');harnessSource=harnessSource.replace(old,value);};
replaceOnce('writerFailuresLeft=writerFailures;','writerFailuresLeft=writerFailures; let injectedRenderFailure=false;');
replaceOnce('upload:async(path,bytes)=>{stored.push',"upload:async(path,bytes)=>{if(bucket==='wis-event-images'&&!injectedRenderFailure){injectedRenderFailure=true;return {error:{message:'INJECTED_RENDER_SAVE_FAILURE'}};}stored.push");
replaceOnce('arrayBuffer:async()=>Buffer.alloc(1600)','arrayBuffer:async()=>stored.find(x=>x.bucket===bucket&&x.path===path)?.bytes||Buffer.alloc(1600)');
const fixtureContext={exports:{},assert,fs,vm,require,Buffer,URL,AbortSignal,Intl,Date,console,setTimeout,clearTimeout,structuredClone};
vm.runInNewContext(harnessSource+'\nexports.harness=harness;exports.base=base;exports.id=id;',fixtureContext);
const h=fixtureContext.exports.harness({answerFirst:true,photoFixture:'ready',
 templateSettings:{carousel_mode:'fixed',carousel_default_slides:5,carousel_brand_outro_enabled:true},
 photoSettings:{carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:true}});
const input={...fixtureContext.exports.base,request_key:'manual:durable-ai-before-render',content_mode:'growth_carousel',
 topic_type:'conversation_prompt',language:'ko',visual_source:'stock',story_card_count:5,editorial_workflow_version:2,
 editorial_series:'different_words',instruction:'같은 상황에서 실제로 꺼낼 다른 한마디',ai_image_slot:0};
const first=await h.api.runGeneration(fixtureContext.exports.id,input,null);
assert.equal(first.job.status,'failed');assert.match(first.job.error_message,/INJECTED_RENDER_SAVE_FAILURE/);
const draft=h.tables.instagram_post_drafts[0];
assert.equal(Object.keys(draft.content_document.generated_ai_assets).length,1);
assert.equal(h.stored.filter(x=>x.bucket==='marketing-images').length,1);
assert.equal(h.requests.filter(x=>x.url.endsWith('images/generations')).length,1);
const {ai_image_slot,...imageInput}=input;
const second=await h.api.runGeneration(fixtureContext.exports.id,{...imageInput,request_key:'manual:durable-image-completion',
 revision:draft.revision,mode:'image',render_only:true},null);
assert.equal(second.job.status,'completed',JSON.stringify(second.job));assert.equal(second.draft.images.length,6);
assert.equal(h.requests.filter(x=>x.url.endsWith('images/generations')).length,1,'render recovery must reuse the already paid AI image');
assert.equal(h.requests.filter(x=>x.url.endsWith('chat/completions')).length,1,'render recovery must preserve the existing copy');
assert.equal(second.draft.approved_at,undefined,'completion must not approve publication');
console.log('PASS actual generator saves optional AI card before render failure and completes six cards without another image/copy request');
