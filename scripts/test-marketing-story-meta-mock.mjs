import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../supabase/functions/roundy-story-previews/index.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const imgUrl='https://demo.supabase.co/storage/v1/object/public/wis-event-images/story-previews/'
 +'11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';
function harness({accountType='BUSINESS',timeoutAfterPublish=false,invalidMedia=false}={}){
 let callback,externalMarked=false,claimed=false;
 const events=[],posts=[],states={};
 const story={id:'11111111-1111-4111-8111-111111111111',media_format:'jpeg_static',
  image_url:invalidMedia?'https://external.example/sticker.png':imgUrl,status:'publishing'};
 const attempt={story_id:story.id,state:'claimed'};
 states.story=story;states.attempt=attempt;
 class Builder{
  constructor(table,patch){this.table=table;this.patch=patch;this.filters=[];}
  eq(field,value){this.filters.push([field,value]);return this;}
  then(resolve,reject){
   const target=this.table==='marketing_story_previews'?story:attempt;
   if(this.filters.every(([key,value])=>target[key]===value))Object.assign(target,this.patch);
   return Promise.resolve({data:target,error:null}).then(resolve,reject);
  }
 }
 const db={rpc:async(name)=>{
   if(name==='marketing_scheduler_authorized')return {data:true,error:null};
   if(name==='claim_marketing_story_previews'){
    if(claimed)return {data:[],error:null};claimed=true;
    return {data:[structuredClone(story)],error:null};
   }
   if(name==='mark_marketing_story_external_attempt'){
    externalMarked=true;events.push('DB_BEFORE_FIRST_META_POST');
    attempt.state='external_started';return {data:true,error:null};
   }
   throw Error('UNEXPECTED_DB_RPC '+name);
  },from:name=>({update:patch=>new Builder(name,patch)})};
 const graphFetch=async(url,init)=>{
  const method=init?.method||'GET',address=String(url);
  assert.match(address,/^https:\/\/graph\.instagram\.com\/v25\.0\//);
  events.push(method+' '+address);
  if(method==='POST')posts.push({url:address,params:Object.fromEntries(new URLSearchParams(init.body))});
  const response=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
  if(address.includes('me?fields=user_id,username,account_type'))return response({user_id:'123456789',username:'roundy.meet',account_type:accountType});
  if(address.endsWith('/123456789/media'))return response({id:'1987654321'});
  if(address.includes('1987654321?fields=status_code'))return response({status_code:'FINISHED'});
  if(address.endsWith('/123456789/media_publish')){
   if(timeoutAfterPublish)throw new Error('SIMULATED_META_NETWORK_TIMEOUT_AFTER_PUBLISH');
   return response({id:'1987654322'});
  }
  if(address.includes('1987654322?fields=permalink'))return response({permalink:'https://www.instagram.com/stories/roundy.meet/1234/'});
  throw Error('MOCK_UNEXPECTED_GRAPH '+address);
 };
 const module={exports:{}};
 const Deno={env:{get:key=>({
  SUPABASE_URL:'https://demo.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake-test-only',
  SUPABASE_ANON_KEY:'anon-test',INSTAGRAM_ACCESS_TOKEN:'fake-ig-token',
  INSTAGRAM_USER_ID:'123456789',INSTAGRAM_API_VERSION:'v25.0'
 }[key])},serve:fn=>{callback=fn;}};
 const mockRequire=name=>{
  if(name==='npm:@supabase/supabase-js@2.117.0')return {createClient:()=>db};
  throw Error('UNEXPECTED_IMPORT '+name);
 };
 vm.runInNewContext(compiled,{module,exports:module.exports,require:mockRequire,
  Deno,Response,Request,URL,URLSearchParams,AbortSignal,fetch:graphFetch,
  setTimeout,clearTimeout,console});
 assert.equal(typeof callback,'function');
 const run=async()=>{
  const req=new Request('https://demo.supabase.co/functions/v1/roundy-story-previews',
   {method:'POST',headers:{'x-marketing-secret':'test-only'},body:'{}'});
  const result=await callback(req);return result.json();
 };
 return {run,story,attempt,posts,events,get externalMarked(){return externalMarked;}};
}
{
 const h=harness(),r=await h.run();
 assert.equal(r.processed,1,JSON.stringify(r));
 assert.equal(r.results[0].status,'published');
 assert.equal(h.story.status,'published');
 assert.equal(h.attempt.state,'sent');
 assert.equal(h.story.publication_mode,'api');
 assert.equal(h.posts.length,2);
 assert.deepEqual(h.posts[0].params,{media_type:'STORIES',image_url:imgUrl});
 assert.deepEqual(h.posts[1].params,{creation_id:'1987654321'});
 assert.ok(h.externalMarked);
 assert.ok(h.events.indexOf('DB_BEFORE_FIRST_META_POST')<
  h.events.findIndex(x=>x.includes('POST https://graph.instagram.com')),'must persist external intent before Meta POST');
 const second=await h.run();
 assert.equal(second.processed,0);
 assert.equal(h.posts.length,2,'same Story must not post twice');
}
for(const accountType of ['CREATOR','PERSONAL','UNKNOWN']){
 const h=harness({accountType}),r=await h.run();
 assert.equal(r.results[0].status,'manual_ready');
 assert.equal(h.story.status,'manual_ready');
 assert.equal(h.posts.length,0,'non-Business account cannot issue a Meta publication POST');
 assert.equal(h.externalMarked,false);
}
{
 const h=harness({timeoutAfterPublish:true}),r=await h.run();
 assert.equal(r.results[0].status,'needs_review');
 assert.equal(h.story.status,'needs_review');
 assert.equal(h.attempt.state,'needs_review');
 assert.equal(h.posts.length,2);
 assert.equal((await h.run()).processed,0,'uncertain results cannot retry without review');
}
{
 const h=harness({invalidMedia:true}),r=await h.run();
 assert.equal(r.results[0].status,'manual_ready');
 assert.equal(h.posts.length,0);
}
console.log('PASS Stories Meta mock: Business JPEG POSTS once; Creator/Personal fallback; bad media manual; lost response quarantined. No live Instagram calls.');
