import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const load=(path,mocks={})=>{
 const src=readFileSync(path,'utf8'),module={exports:{}};
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,require:name=>mocks[name]||require(name),
  Date,Set,Map,Number,Math,JSON},{filename:path});
 return module.exports;
};
const parser=load('supabase/functions/roundy-marketing/insight-parser.ts');
const worker=load('supabase/functions/roundy-marketing/insights-worker.ts',{'./insight-parser.ts':parser});
const observed=(name,value)=>({name,values:[{value}]});
const core={data:[observed('reach',250),observed('views',320),observed('likes',26),
 observed('comments',5),observed('saved',9),observed('shares',11),observed('total_interactions',51)]};
let assertions=0;const check=f=>{f();assertions++;};
const calls=[];
const feed=await worker.mediaPerformanceObserved(async path=>{
 calls.push(path);
 if(path.includes('fields='))return {like_count:26,comments_count:5};
 if(path.includes('follows,profile_visits'))return {data:[observed('follows',3),observed('profile_visits',7)]};
 return core;
},'17890000012345',false);
check(()=>assert.equal(feed.source,'insights'));
check(()=>assert.equal(feed.metric_availability.reach,true));
check(()=>assert.equal(feed.metric_availability.saved,true));
check(()=>assert.equal(feed.metric_availability.shares,true));
check(()=>assert.equal(feed.media_follows,3));
check(()=>assert.equal(feed.media_profile_visits,7));
check(()=>assert.equal(calls.some(x=>x.includes('follows')),true));
check(()=>assert.equal(calls.some(x=>x.includes('media_publish')),false));
const reel=await worker.mediaPerformanceObserved(async path=>{
 if(path.includes('fields='))return {like_count:26,comments_count:5};
 if(path.includes('ig_reels_avg_watch_time'))return {data:[observed('ig_reels_avg_watch_time',5500.5),observed('ig_reels_video_view_total_time',1200000)]};
 return core;
},'17890000045678',true);
check(()=>assert.equal(reel.media_follows,null));
check(()=>assert.equal(reel.metric_availability.follows,false));
check(()=>assert.equal(reel.reel_avg_watch_time_ms,5501));
check(()=>assert.equal(reel.reel_total_watch_time_ms,1200000));
const missing=await worker.mediaPerformanceObserved(async path=>{
 if(path.includes('fields='))return {like_count:3,comments_count:1};
 if(path.includes('insights'))throw new Error('Permission denied');
 return {};
},'17890000045679',true);
check(()=>assert.equal(missing.source,'basic'));
check(()=>assert.equal(missing.reach,null));
check(()=>assert.equal(missing.shares,0));
check(()=>assert.equal(missing.metric_availability.shares,false));
check(()=>assert.equal(missing.metric_availability.saved,false));
// A real zero is observable and different from an API that omitted the metric.
const zero=await worker.mediaPerformanceObserved(async path=>{
 if(path.includes('fields='))return {};
 if(path.includes('follows'))throw new Error('Unsupported');
 return {data:[observed('reach',80),observed('shares',0),observed('saved',0)]};
},'17890000045680',false);
check(()=>assert.equal(zero.source,'insights'));
check(()=>assert.equal(zero.metric_availability.shares,true));
check(()=>assert.equal(zero.shares,0));
check(()=>assert.equal(zero.media_follows,null));
// Daily idempotency: once claimed, failed/unsupported never silently retries.
const writes=[];
function db(allowClaim){
 return {from:table=>{
  check(()=>assert.equal(table,'instagram_audience_reach_snapshots'));
  return {
   upsert:payload=>{
    writes.push({type:'claim',payload});
    return {select:async()=>({data:allowClaim?[{snapshot_date:payload.snapshot_date}]:[],error:null})};
   },
   update:payload=>{
    writes.push({type:'result',payload});
    return {eq:async()=>({error:null})};
   }
  };
 }};
}
const audience={data:[{name:'reach',total_value:{value:400,breakdowns:[{
 dimension_keys:['follow_type'],results:[{dimension_values:['FOLLOWER'],value:120},
 {dimension_values:['NON_FOLLOWER'],value:280}]
}]}}]};
const result=await worker.captureAccountAudienceReach(db(true),async path=>{
 check(()=>assert.equal(path.includes('breakdown=follow_type'),true));
 return audience;
},'1789000001','2026-10-12');
check(()=>assert.equal(result,true));
check(()=>assert.equal(writes.at(-1).payload.status,'captured'));
check(()=>assert.equal(writes.at(-1).payload.reached_nonfollowers,280));
const noRetry=await worker.captureAccountAudienceReach(db(false),async()=>{
 throw Error('Repeated Meta call!');},'1789000001','2026-10-12');
check(()=>assert.equal(noRetry,false));
const unavailable=await worker.captureAccountAudienceReach(db(true),async()=>{throw Error('Unsupported breakdown');},
 '1789000001','2026-10-13');
check(()=>assert.equal(unavailable,false));
check(()=>assert.equal(writes.at(-1).payload.status,'unavailable'));
check(()=>assert.equal(writes.at(-1).payload.reached_nonfollowers,undefined));
console.log('PASS '+assertions+' Meta worker mocks: optional observed Feed/Reel metrics, absent vs zero, account follow-type breakdown, no repeated unsupported API calls or publishing.');
