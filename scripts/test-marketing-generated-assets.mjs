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
console.log('Central render recovery integration is covered by test-marketing-central-runtime.mjs.');
