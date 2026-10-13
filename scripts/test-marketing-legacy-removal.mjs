import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('src/lib/marketing.ts','utf8');
const calls=[];
const service={};
const actor={id:'actor-fixture'};
const db={auth:{getUser:async()=>({data:{user:actor}})}};
const next={NextResponse:{json:(data,init={})=>({status:init.status||200,data})}};
const module={exports:{}};
const controller={
 contentWorkflowApi:async(...args)=>{calls.push(['contents',...args]);return {status:200};},
 startContentWorkflow:async(...args)=>{calls.push(['start',...args]);return {content:{id:'content-fixture'}};}
};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{
 module,exports:module.exports,URL,Buffer,console,process:{env:{}},
 require:name=>name==='next/server'?next:name==='./supabase/service'?{createServiceRoleClient:()=>service}:
 name==='./marketing-content-controller'?controller:name==='./marketing-admin-api'?{marketingAdministrationApi:async()=>{calls.push(['administration']);return {status:200}}}:{}
});
let checks=0;
for(const path of [['draft','saved-id','regenerate'],['draft','saved-id','growth-generate'],['draft','saved-id','versions'],['draft','saved-id','publish-now'],['generation','jobs','saved-id','retry']]){
 const before=calls.length,result=await module.exports.marketingApi({method:'POST'},db,path);
 assert.equal(result.status,410);assert.equal(result.data.error,'CONTENT_WORKFLOW_REQUIRED');assert.equal(calls.length,before);checks+=3;
}
const current=await module.exports.marketingApi({method:'POST',json:async()=>({instruction:'Human subject'})},db,['draft','generate']);
assert.equal(current.status,202);assert.equal(calls.at(-1)[0],'start');checks+=2;
await module.exports.marketingApi({method:'GET'},db,['contents']);assert.equal(calls.at(-1)[0],'contents');checks++;
await module.exports.marketingApi({method:'GET'},db,['settings']);assert.equal(calls.at(-1)[0],'administration');checks++;
for(const file of ['src/lib/marketing-legacy.ts','src/lib/marketing-regeneration.ts','src/components/admin-marketing-editorial-studio.tsx','src/components/admin-marketing-regeneration.tsx']){
 assert.equal(fs.existsSync(file),false,file);checks++;
}
const front=fs.readFileSync('src/components/admin-marketing.tsx','utf8');
assert.doesNotMatch(front,/activeTab==='draft'|AdminMarketingEditorialStudio|AdminMarketingRegeneration/);checks++;
assert.match(front,/AdminMarketingContentLibrary/);checks++;
assert.match(fs.readFileSync('src/lib/marketing-editorial.ts','utf8'),/editorFirstWritingInstructions/);checks++;
assert.doesNotMatch(fs.readFileSync('src/lib/marketing-editorial.ts','utf8'),/topicDiscoveryPrompt|copyCriticPrompt|ONE BOUNDED EDITORIAL REWRITE/);checks++;
assert.doesNotMatch(fs.readFileSync('src/lib/marketing-admin-api.ts','utf8'),/api\.openai|chat\/completions|images\/generations/);checks++;
console.log('PASS '+checks+' retired-route and current-controller regression checks; no DB writes or external calls.');
