import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const worker=fs.readFileSync(new URL('../supabase/functions/roundy-marketing/index.ts',import.meta.url),'utf8');
function between(start,end){
 const a=worker.indexOf(start),b=worker.indexOf(end,a);
 assert.ok(a>=0&&b>a,'worker boundary: '+start);return worker.slice(a,b);
}
// Execute the PRODUCTION publishInstagram implementation with a stubbed Meta API.
// The test never makes a network request.
const source=between('async function graph(','async function graphJson(')
 +between('async function ready(','class ReelProcessingPending(');
assert.match(source,/await beforeFirstExternalPost\(\)/);
const script=ts.transpileModule(source+'\nexports.publishInstagram=publishInstagram;',{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
function mockPublisher({loseAfterPublish=false,loseAtFirstPost=false,wrongAccount=false}={}){
 const events=[],calls=[];let postCount=0,marked=false;
 const fakeFetch=async(url,opts={})=>{
  assert.ok(String(url).startsWith('https://graph.instagram.com/'),'external URLs must be mocked');
  const call={url:String(url),method:opts.method||'GET'};
  events.push(call.method+' '+call.url);calls.push(call);
  if(call.url.includes('me?fields=user_id,username'))return response({user_id:'123',username:wrongAccount?'not-roundy':'roundy.meet'});
  if(call.url.includes('/media_publish')){
   postCount++;
   if(loseAfterPublish)throw new TypeError('Network timeout after media_publish; outcome unknown');
   return response({id:'fake-post-id'});
  }
  if(call.url.includes('/media')&&call.method==='POST'){
   if(loseAtFirstPost)throw new TypeError('Network timeout during carousel media creation');
   return response({id:'container-'+calls.length});
  }
  if(call.url.includes('fields=status_code'))return response({status_code:'FINISHED'});
  if(call.url.includes('fields=permalink'))return response({permalink:'https://instagram.example/mock-post'});
  throw new Error('Unexpected mock URL: '+call.url);
 };
 const response=data=>({ok:true,status:200,json:async()=>data});
 const module={exports:{}},ctx={
  module,exports:module.exports,URL,URLSearchParams,AbortSignal,Date,
  token:()=> 'mock-token',userId:()=> '123',apiVersion:()=> 'v25.0',
  fetch:fakeFetch,setTimeout,clearTimeout,console
 };
 vm.runInNewContext(script,ctx);
 const t={channel:'instagram',caption:'Test with mocked Meta',cta:'Follow',
  destination_url:'https://roundy.team',
  images:Array.from({length:3},(_,i)=> 'https://mock.roundy.team/'+i+'.jpg')};
 let externalAttempt=false;
 const invoke=()=>module.exports.publishInstagram(t,
  ()=>{externalAttempt=true;events.push('media_publish about to start');},
  async()=>{externalAttempt=true;marked=true;events.push('persisted external attempt in mock DB');});
 return {invoke,events,calls,get marked(){return marked;},get externalAttempt(){return externalAttempt;},
  get publishCalls(){return postCount;}};
}
{
 const p=mockPublisher(),result=await p.invoke();
 assert.equal(result.external_id,'fake-post-id');
 assert.equal(p.publishCalls,1);
 assert.ok(p.marked);
 const firstPost=p.events.findIndex(x=>x.startsWith('POST '));
 assert.ok(firstPost>0&&p.events.indexOf('persisted external attempt in mock DB')<firstPost);
 assert.ok(p.events.indexOf('media_publish about to start')<p.events.findIndex(x=>x.includes('/media_publish')));
}
for(const opts of [{loseAfterPublish:true},{loseAtFirstPost:true}]){
 const p=mockPublisher(opts);
 await assert.rejects(p.invoke(),/Network timeout/);
 assert.ok(p.marked&&p.externalAttempt,'uncertain Meta response has a durable marker');
 assert.equal(p.externalAttempt?'needs_review':'failed','needs_review','must quarantine rather than retry');
 assert.equal(opts.loseAfterPublish?p.publishCalls:0,opts.loseAfterPublish?1:0);
}
{
 const p=mockPublisher({wrongAccount:true});
 await assert.rejects(p.invoke(),/Instagram credentials must belong/);
 assert.equal(p.marked,false,'an account mismatch never reaches a side-effectful Meta POST');
 assert.equal(p.publishCalls,0);
}
console.log('PASS actual Feed publisher with mocked Meta API: one publication, durable attempt before POST, timeouts quarantined, account mismatch safe. ZERO real API calls.');
