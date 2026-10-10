import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const sharp=require('sharp');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const kst=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(x);
const tomorrow=(day)=>kst(new Date(Date.parse(day+'T00:00:00+09:00')+86400000));
const today=kst(new Date()),day=tomorrow(today);
const fakeBase='https://demo.supabase.co',owner='11111111-1111-4111-8111-111111111111';
const mediaId='22222222-2222-4222-8222-222222222222';
const cover=fakeBase+'/storage/v1/object/public/wis-event-images/'+owner+'/'+mediaId+'.jpg';
const run={id:'33333333-3333-4333-8333-333333333333',
 status:'queued',channel:'instagram',scheduled_for:day+'T20:00:00+09:00',
 snapshot:{draft_id:'44444444-4444-4444-8444-444444444444',images:[cover]}};
const draft={id:run.snapshot.draft_id,status:'scheduled',marketing_run_id:run.id,
 approved_at:new Date().toISOString(),approved_by:'admin',quality_revision:3,revision:3,
 quality_report:{status:'passed',preflight:{status:'passed'}},
 content_language:'ko',content_document:{slides:[{title:'성수 첫 데이트, 서울숲 산책부터 시작하기'}]},
 images:[cover],carousel_slides:[{title:'성수 첫 데이트'}]};
const original=await sharp({create:{width:1080,height:1350,channels:3,background:'#888888'}})
 .jpeg({quality:82}).toBuffer();
const fakeStory=await sharp({create:{width:1080,height:1920,channels:3,background:'#20211f'}})
 .jpeg({quality:82}).toBuffer();
let tree=null,renderCalls=0,uploaded=[];
class FakeImageResponse{
 constructor(node,opts){tree=node;assert.equal(opts.width,1080);assert.equal(opts.height,1920);renderCalls++;}
 async arrayBuffer(){return Uint8Array.from(fakeStory).buffer;}
}
const tables={marketing_automation_settings:[{singleton:true,story_preview_auto_enabled:true}],
 marketing_runs:[run],instagram_post_drafts:[draft],marketing_story_previews:[]};
class Query{
 constructor(name){this.name=name;this.pred=[];this.patch=null;this.orderField=null;this.max=Infinity;}
 select(){return this;}eq(k,v){this.pred.push(x=>x[k]===v);return this;}
 gte(k,v){this.pred.push(x=>String(x[k])>=String(v));return this;}
 lt(k,v){this.pred.push(x=>String(x[k])<String(v));return this;}
 in(k,a){this.pred.push(x=>a.includes(x[k]));return this;}
 order(){return this;}limit(n){this.max=n;return this;}
 update(p){this.patch=p;return this;}
 async single(){const r=await this.exec();return {data:r.data?.[0]||null,error:null};}
 async upsert(input,{ignoreDuplicates}={}){const table=tables[this.name];
  const prior=table.find(x=>x.feed_run_id===input.feed_run_id);
  if(prior&&ignoreDuplicates)return {data:[],error:null};
  const row={id:'55555555-5555-4555-8555-555555555555',...input};table.push(row);
  return {data:[structuredClone(row)],error:null};
 }
 then(resolve,reject){return this.exec().then(resolve,reject);}
 async exec(){
  let rows=tables[this.name].filter(x=>this.pred.every(pred=>pred(x))).slice(0,this.max);
  if(this.patch)rows.forEach(r=>Object.assign(r,this.patch));
  return {data:structuredClone(rows),error:null};
 }
}
const storage={
 from:bucket=>{assert.equal(bucket,'wis-event-images');return {
  download:async path=>{assert.equal(path,owner+'/'+mediaId+'.jpg');return {data:new Blob([original]),error:null};},
  upload:async(path,bytes)=>{uploaded.push({path,bytes});return {data:{path},error:null};},
  getPublicUrl:path=>({data:{publicUrl:fakeBase+'/storage/v1/object/public/wis-event-images/'+path}})
 };}
};
const db={from:name=>{assert.ok(tables[name],name);return new Query(name);},storage};
const path='src/lib/marketing-story-generation.ts';
const transpiled=ts.transpileModule(read(path),{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true
}}).outputText;
const refs={
 './supabase/service':{createServiceRoleClient:()=>db},
 './marketing-render-assets':{loadEditorialAssets:async()=>({fonts:[]})},
 './marketing-carousel-template':null,
 './marketing-presentation':{ROUNDY_IDENTITY:{accent:'#ff6666',ink:'#20211f',paper:'#fffefa'}}
};
const cmp={exports:{}};
vm.runInNewContext(ts.transpileModule(read('src/lib/marketing-carousel-template.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports:cmp.exports,module:cmp
});
refs['./marketing-carousel-template']=cmp.exports;
const module={exports:{}};
const context={exports:module.exports,module,process:{env:{NEXT_PUBLIC_SUPABASE_URL:fakeBase}},
 Buffer,Date,Intl,URL,Blob,console,
 require:name=>{if(name==='server-only')return {};
  if(name==='react')return {createElement:(tag,props,...children)=>({tag,props,children})};
  if(name==='next/og')return {ImageResponse:FakeImageResponse};
  if(name==='sharp')return sharp;
  if(name==='node:crypto')return require('node:crypto');
  if(name in refs)return refs[name];
  throw Error('UNKNOWN_STORY_REQUIRE '+name);}
};
vm.runInNewContext(transpiled,context);
const generator=module.exports;
const first=await generator.generateTomorrowStoryPreviews();
assert.equal(first.checked_feeds,1,JSON.stringify({first,run,draft,today,day}));
assert.equal(first.created,1,JSON.stringify(first));
assert.equal(tables.marketing_story_previews.length,1);
assert.equal(tables.marketing_story_previews[0].status,'generated');
assert.equal(tables.marketing_story_previews[0].approved_by,undefined,'No automatic Story approval');
assert.equal(uploaded.length,1);
assert.equal(renderCalls,1);
assert.match(uploaded[0].path,/^story-previews\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/);
assert.ok(uploaded[0].bytes.length>1000);
const meta=await sharp(uploaded[0].bytes).metadata();
assert.equal(meta.width,1080);assert.equal(meta.height,1920);
const imageNodes=[];
function visit(node){if(!node||typeof node!=='object')return;
 if(node.tag==='img')imageNodes.push(node);
 if(Array.isArray(node))node.forEach(visit);
 else if(node.children)node.children.forEach(visit);}
visit(tree);
assert.equal(imageNodes.length,1);
const cropped=imageNodes[0].props.src;
assert.match(cropped,/^data:image\/jpeg;base64,/);
const cropMeta=await sharp(Buffer.from(cropped.split(',')[1],'base64')).metadata();
assert.equal(cropMeta.width,924);
assert.equal(cropMeta.height,724,'Teaser reveals only a crop of the original 1350-high Feed cover');
const duplicate=await generator.generateTomorrowStoryPreviews();
assert.equal(duplicate.created,0,'Cron retries must not create duplicate Stories');
assert.equal(uploaded.length,1,'No second rendered asset');
tables.marketing_automation_settings[0].story_preview_auto_enabled=false;
assert.equal((await generator.generateTomorrowStoryPreviews()).skipped,true);
assert.equal((await generator.generateTomorrowStoryPreviews({manual:true})).created,0);
run.status='sent';
assert.equal((await generator.generateTomorrowStoryPreviews({manual:true})).checked_feeds,0,'Published Feed is not teased');
const source=read('supabase/functions/roundy-story-previews/index.ts');
for(const m of [/account_type/,/account_type\|\|''\)\.toUpperCase\(\)!=='BUSINESS'/,
 /media_type:'STORIES'/,/media_publish/,/mark_marketing_story_external_attempt/,
 /STORY_UNSUPPORTED_AUTO_PUBLISH_FORMAT/,/needs_review/,/manual_ready/])assert.match(source,m);
const sql=read('supabase/migrations/20261010184000_instagram_story_feed_previews.sql');
for(const m of [/feed_run_id uuid not null unique/,/marketing_story_publish_attempts/,
 /story_id uuid not null unique/,/claim_marketing_story_previews/,/schedule_marketing_story_preview/,
 /approve_marketing_story_preview/,/marketing_story_source_valid/])assert.match(sql,m);
const cron=read('supabase/migrations/20261010185000_instagram_story_cron.sql');
assert.match(cron,/cron.schedule/);
assert.match(cron,/story_preview_auto_enabled/);
assert.match(cron,/status='scheduled'/);
assert.doesNotMatch(cron,/update public\.marketing_runs|update public\.instagram_post_drafts/);
const feed=read('supabase/functions/roundy-marketing/index.ts');
assert.doesNotMatch(feed,/roundy-story-previews|marketing_story_previews/);
console.log('PASS Story previews: next-day approved Feed gating, 1080x1920 crop, no duplicate generation, opt-in, separate approval, Business-only API, no Feed mutations. NO Meta calls.');
