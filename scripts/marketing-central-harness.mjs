import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),ts=require('typescript');
export async function centralHarness(){
 const pg=new PGlite();
 // Use every application migration, including the real ledger, preflight and publication guards.
 const setup=fs.readFileSync('scripts/test-match-flow.mjs','utf8').split("const uid=n=>")[0].replace(/^import .*;\n/gm,'').replace('const db=new PGlite();','');
 await new Function('db','readFile','readdir','return (async()=>{'+setup+'})()')(pg,fs.promises.readFile,fs.promises.readdir);
 const q=async(sql,args=[])=>JSON.parse(JSON.stringify((await pg.query(sql,args)).rows));
 const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';await q('insert into auth.users(id) values($1)',[actor]);
 await pg.exec("update marketing_content_workflow_control set enabled=true;update marketing_ai_control set enabled=true,blocked_reason=null,daily_call_limit=50,monthly_call_limit=1000,daily_budget_usd=15,monthly_budget_usd=60;update marketing_automation_settings set carousel_mode='fixed',carousel_default_slides=5,carousel_brand_outro_enabled=true,carousel_ai_thumbnail_enabled=false");
 const objects=new Map(),uploads=[];let failRender=false,copyFailures=0;
 const ident=s=>{if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(s))throw Error('Unsafe fixture identifier '+s);return '"'+s+'"';};
 class Q{
  constructor(table){this.table=table;this.filters=[];this.sort=[];this.n=1000;this.cols='*';}
  select(cols='*'){this.cols=cols;return this;}eq(k,v){this.filters.push([k,'=',v]);return this;}neq(k,v){this.filters.push([k,'<>',v]);return this;}
  gte(k,v){this.filters.push([k,'>=',v]);return this;}gt(k,v){this.filters.push([k,'>',v]);return this;}lt(k,v){this.filters.push([k,'<',v]);return this;}
  in(k,v){this.filters.push([k,'in',v]);return this;}is(k,v){this.filters.push([k,'is',v]);return this;}contains(k,v){this.filters.push([k,'@>',v]);return this;}
  order(k,o={}){this.sort.push([k,o.ascending!==false]);return this;}limit(n){this.n=n;return this;}
  update(p){this.patch=p;return this;}insert(p){this.insertRows=Array.isArray(p)?p:[p];return this;}
  upsert(p,o={}){this.insertRows=Array.isArray(p)?p:[p];this.up=o;return this;}
  single(){return this.exec(true,true);}maybeSingle(){return this.exec(true);}then(a,b){return this.exec().then(a,b);}
  async exec(single=false,required=false){
   try{
    const args=[];const val=v=>{args.push(v);return '$'+args.length;};
    const filter=this.filters.map(([k,op,v])=>op==='in'?(v.length?ident(k)+' in ('+v.map(val).join(',')+')':'false'):op==='is'?ident(k)+(v===null?' is null':' is not null'):ident(k)+' '+op+' '+val(v)).join(' and ');
    let sql;
    if(this.patch)sql='update '+ident(this.table)+' set '+Object.entries(this.patch).map(([k,v])=>ident(k)+'='+val(v)).join(',')+(filter?' where '+filter:'')+' returning *';
    else if(this.insertRows){const keys=Object.keys(this.insertRows[0]);sql='insert into '+ident(this.table)+'('+keys.map(ident).join(',')+') values '+this.insertRows.map(row=>'('+keys.map(k=>val(row[k])).join(',')+')').join(',');
     if(this.up)sql+=' on conflict ('+this.up.onConflict.split(',').map(ident).join(',')+') '+(this.up.ignoreDuplicates?'do nothing':'do update set '+keys.map(k=>ident(k)+'=excluded.'+ident(k)).join(','));sql+=' returning *';}
    else sql='select * from '+ident(this.table)+(filter?' where '+filter:'')+(this.sort.length?' order by '+this.sort.map(([k,asc])=>ident(k)+(asc?' asc':' desc')).join(','):'')+' limit '+Number(this.n);
    let rows=await q(sql,args);
    if(this.table==='marketing_draft_photos'&&this.cols.includes('marketing_photo_assets('))rows=await Promise.all(rows.map(async row=>({...row,marketing_photo_assets:(await q('select * from marketing_photo_assets where id=$1',[row.asset_id]))[0]})));
    if(required&&rows.length!==1)throw Error('Fixture expected one '+this.table+' row, got '+rows.length);
    return {data:single?rows[0]||null:rows,error:null};
   }catch(error){return {data:null,error:{message:error.message,code:error.code}};}
  }
 }
 const db={from:t=>new Q(t),rpc:async(name,params={})=>{
  if(name==='dispatch_marketing_content_workflows')return {data:null,error:null};
  try{const keys=Object.keys(params),rows=await q('select public.'+ident(name)+'('+keys.map((k,i)=>ident(k)+'=>$'+(i+1)).join(',')+') result',Object.values(params));return {data:rows[0]?.result,error:null};}
  catch(e){return {data:null,error:{message:e.message,code:e.code}};}
 },storage:{from:bucket=>({
  upload:async(path,bytes)=>{if(failRender&&bucket==='wis-event-images'){failRender=false;return {error:{message:'INJECTED_RENDER_STORAGE_FAILURE'}};}objects.set(bucket+'/'+path,Buffer.from(bytes));uploads.push({bucket,path});return {error:null};},
  download:async(path)=>({data:objects.has(bucket+'/'+path)?{arrayBuffer:async()=>objects.get(bucket+'/'+path)}:null,error:objects.has(bucket+'/'+path)?null:{message:'NOT_FOUND'}}),
  getPublicUrl:path=>({data:{publicUrl:'https://sruzwoiyfjnebjmyxucy.supabase.co/storage/v1/object/public/'+bucket+'/'+path}}),
  createSignedUrls:async paths=>({data:paths.map(path=>({signedUrl:'https://fixture.invalid/'+path})),error:null})
 })}};
 const cache={};
 function load(file){
  if(cache[file])return cache[file];const context={exports:{},Buffer,URL,AbortSignal,Intl,Date,Uint8Array,ArrayBuffer,structuredClone,process,console,crypto:globalThis.crypto,setTimeout,clearTimeout,
   fetch:()=>{throw Error('LIVE_NETWORK_FORBIDDEN_IN_CENTRAL_TEST');},require:n=>{
    if(n==='server-only')return {};
    if(n==='./supabase/service')return {createServiceRoleClient:()=>db};
    if(n==='./marketing-photo-providers')return {providerConfigured:()=>false,searchLicensedPhotos:()=>{throw Error('LIVE_PHOTO_SEARCH_FORBIDDEN');},trackUnsplashDownload:async()=>{}};
    if(n.startsWith('./')&&fs.existsSync('src/lib/'+n.slice(2)+'.ts'))return load('src/lib/'+n.slice(2)+'.ts');
    return require(n);
   }};
  cache[file]=context.exports;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context,{filename:file});return context.exports;
 }
 // Reuse the existing strict-schema provider fixtures, not a replacement implementation of the writer.
 let fixtureSource=fs.readFileSync('scripts/test-marketing-generation.mjs','utf8').split("\nfor(const language of ['en','ko'])")[0];
 fixtureSource=fixtureSource.replace(/^import .*;\n/gm,'').replace('const require=createRequire(import.meta.url),','const ');
 fixtureSource=fixtureSource.replace('const requests=[],stored=[];','let providerFetch;const requests=[],stored=[];');
 fixtureSource=fixtureSource.replace('vm.runInNewContext(compiled(file),context);',"if(file==='src/lib/marketing-generation.ts')providerFetch=context.fetch;vm.runInNewContext(compiled(file),context);");
 fixtureSource=fixtureSource.replace("return {api:load('src/lib/marketing-generation.ts'),", "return {provider:async(endpoint,body)=>{const r=await providerFetch('https://api.openai.com/v1/'+endpoint,{body:JSON.stringify(body)});return r.json();},api:load('src/lib/marketing-generation.ts'),");
 const cx={exports:{},assert,fs,vm,require,Buffer,URL,AbortSignal,Intl,Date,console,setTimeout,clearTimeout,structuredClone};
 vm.runInNewContext(fixtureSource+'\nexports.harness=harness;',cx);
 const provider=cx.exports.harness({answerFirst:true,templateSettings:{carousel_mode:'fixed',carousel_default_slides:5,carousel_brand_outro_enabled:true}});
 const realSharp=require('sharp'),pixel=await realSharp({create:{width:1080,height:1350,channels:3,background:'#cbd1cd'}}).jpeg().toBuffer();
 const counts={copy:0,discovery:0,images:0};
 const call=async(endpoint,body)=>{if(endpoint==='chat/completions'&&copyFailures>0){copyFailures--;throw new (load('src/lib/marketing-generation.ts').GenerationError)('service_unavailable','Fixture writer unavailable',false);}counts[endpoint==='responses'?'discovery':endpoint==='chat/completions'?'copy':'images']++;if(endpoint==='images/generations')return {data:[{b64_json:pixel.toString('base64')}]};return provider.provider(endpoint,body);};
 const controller=load('src/lib/marketing-content-controller.ts'),worker=load('src/lib/marketing-content-workers.ts');
 const state=async id=>(await q('select * from marketing_contents where id=$1',[id]))[0];
 const task=async id=>{await q("update marketing_generation_jobs set created_at=least(created_at,now()-interval '31 seconds') where status<>'running'");return worker.processContentStep(db,id,{call,
  assets:async()=>({fonts:[]}),render:async(db,draft,job)=>{const images=[];for(let i=0;i<draft.carousel_slides.length;i++){const r=await db.storage.from('wis-event-images').upload(job.id+'/'+i+'.jpg',pixel);if(r.error)throw Error(r.error.message);images.push(db.storage.from('wis-event-images').getPublicUrl(job.id+'/'+i+'.jpg').data.publicUrl);}return images;}});};
 const frozen={request_key:'manual:central-runtime-'+Date.now(),mode:'both',visual_mode:'cards',visual_source:'stock',revision:1,language:'ko',content_mode:'growth_carousel',topic_type:'conversation_prompt',story_card_count:3,instruction:'같은 상황에서 실제로 꺼낼 다른 한마디',ai_image_slot:null};
 const rpc=async(n,p)=>{const r=await db.rpc(n,p);if(r.error)throw Error(r.error.message);return r.data;};
 const resume=async id=>rpc('resume_marketing_content',{p_content:id,p_state:(await state(id)).state_version,p_confirm_paid:true});
 let photoSequence=100000;
 async function photos(id){
  const draft=(await q('select * from instagram_post_drafts where id=$1',[id]))[0];
  const slots=load('src/lib/marketing-stock-photos.ts').requiredStockSlots(draft);
  for(const slot of slots){
   const asset=crypto.randomUUID(),providerId=String(++photoSequence),path='stock/pexels/'+providerId+'.jpg';objects.set('marketing-images/'+path,pixel);
   const value={id:asset,provider:'pexels',provider_photo_id:providerId,topic_key:draft.growth_topic_type||draft.content_mode,
    source_url:'https://www.pexels.com/photo/test-'+asset+'/',image_url:'https://images.pexels.com/photos/1/photo.jpg',preview_url:'https://images.pexels.com/photos/1/photo.jpg',
    photographer:'Fixture',photographer_url:'https://www.pexels.com/@fixture/',license_name:'Pexels License',license_url:'https://www.pexels.com/license/',license_evidence_url:'https://www.pexels.com/photo/test-'+asset+'/',
    license_checked_at:new Date().toISOString(),commercial_use_allowed:true,modifications_allowed:true,attribution_required:false,review_status:'approved',reviewed_at:new Date().toISOString(),reviewed_by:actor,
    width:1080,height:1350,perceptual_hash:'a'.repeat(16),storage_path:path,content_sha256:require('node:crypto').createHash('sha256').update(pixel).digest('hex')};
   const saved=await db.from('marketing_photo_assets').insert(value).select('*').single();if(saved.error)throw Error(saved.error.message);
   const linked=await db.from('marketing_draft_photos').insert({draft_id:id,asset_id:asset,slot}).select('*').single();if(linked.error)throw Error(linked.error.message);
  }
 }
 return {pg,q,rpc,db,load,actor,controller,worker,state,task,resume,photos,frozen,counts,uploads,failRender:()=>{failRender=true;},failCopy:()=>{copyFailures++;}};
}
