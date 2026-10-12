import 'server-only';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';
import {createServiceRoleClient} from './supabase/service';
import {inspectReelMp4} from './marketing-reel-mp4';
import {performanceEditorialHint} from './marketing-performance';
import {REEL_PILLARS} from './marketing-reel-policy';
import {
 evaluateReelIdeas,validateReelPlan,reelPlanHash,videoSourceRights,
 reelAiIdeasPrompt,reelAiScriptPrompt,reelIdeasJsonSchema,reelScriptJsonSchema,
 type ReelIdea,type ReelPlan
} from './marketing-reel-creative';

type DB=ReturnType<typeof createServiceRoleClient>;
type Row=Record<string,any>;
const json=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'private,no-store'}});
const checked=<T>(x:{data:T;error:any}):T=>{if(x.error)throw x.error;return x.data;};
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
export const REEL_ASSET_BUCKET='marketing-reel-assets';
const MODEL='gpt-6-luna',IMAGE_MODEL='gpt-image-2.5-flare';
const tokenSafe=(e:unknown)=>String(e instanceof Error?e.message:e).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,180);
const editable=(r:Row)=>['draft','needs_review'].includes(String(r.status))&&!r.marketing_run_id&&!r.approved_at;
async function reel(db:DB,id:string){
 if(!uuid(id))throw new Error('INVALID_REEL_ID');
 const r=checked(await db.from('instagram_reel_drafts').select('*').eq('id',id).maybeSingle()) as Row|null;
 if(!r)throw new Error('REEL_NOT_FOUND');
 return r;
}
async function assetsWithPreview(db:DB,rows:Row[]){
 return Promise.all(rows.map(async row=>{
  const url=await db.storage.from(REEL_ASSET_BUCKET).createSignedUrl(String(row.storage_path),1800);
  return {...row,preview_url:url.error?null:url.data?.signedUrl||null};
 }));
}
async function verifiedSceneAssets(db:DB,plan:ReelPlan){
 const ids=[...new Set(plan.scenes.map(s=>s.asset_id).filter((s):s is string=>Boolean(s)))];
 if(!ids.length)return [];
 const rows=checked(await db.from('marketing_reel_assets').select('*').in('id',ids)) as Row[];
 if(rows.length!==ids.length||rows.some(row=>row.review_status!=='approved'||row.rights_attested!==true||
    row.commercial_use_allowed!==true||row.modifications_allowed!==true||!row.storage_path))
  throw new Error('REEL_APPROVED_ASSETS_ONLY');
 const known=new Map(rows.map(row=>[row.id,row]));
 for(const s of plan.scenes){
  if(!s.asset_id)continue;
  const row=known.get(s.asset_id);
  if(!row)throw new Error('REEL_SCENE_ASSET_MISSING');
  if(row.kind==='licensed_video'&&s.duration_sec>Number(row.duration_seconds||0))
   throw new Error('REEL_SOURCE_VIDEO_TOO_SHORT_FOR_SCENE');
 }
 return rows;
}
export async function assertReadyReelPlan(db:DB,row:Row,expectRender=true){
 if(row.creative_plan?.version!==1)return null; // legacy reels stay compatible
 const plan=validateReelPlan(row.creative_plan,row.language==='ko'?'ko':'en');
 if(row.title!==plan.title||row.caption!==plan.caption||row.hook_text!==plan.hook_text)
  throw new Error('REEL_COPY_CHANGED_AFTER_SCRIPT');
 await verifiedSceneAssets(db,plan);
 if(expectRender&&row.rendered_plan_hash!==reelPlanHash(plan))
  throw new Error('REEL_STORYBOARD_RENDER_STALE');
 return plan;
}
async function cloneCreativeReel(db:DB,source:Row,plan:ReelPlan,userId:string,key:string){
 if(!editable(source))throw new Error('REEL_LOCKED_AFTER_APPROVAL');
 if(typeof key!=='string'||!/^(script|storyboard):[0-9a-f-]{36}$/i.test(key))throw new Error('REEL_VERSION_KEY_INVALID');
 const earlier=checked(await db.from('instagram_reel_drafts').select('*').eq('creative_request_key',key).maybeSingle()) as Row|null;
 if(earlier)return earlier;
 const root=String(source.version_root_id||source.id);
 const rows=checked(await db.from('instagram_reel_drafts').select('version_number').eq('version_root_id',root)
   .order('version_number',{ascending:false}).limit(1)) as Row[];
 const version=Math.max(Number(source.version_number||1),Number(rows[0]?.version_number||1))+1;
 const style=plan.format_type==='three_quick_tips'?'practical':plan.format_type==='relatable_observation'?'humor':'curiosity';
 const copy={
  title:plan.title,hook_text:plan.hook_text,caption:plan.caption,pillar:source.pillar,language:plan.language,hook_style:style,
  creative_plan:plan,version_root_id:root,version_parent_id:source.id,version_number:version,
  creative_request_key:key,created_by:userId,revision:1,
  video_storage_path:null,rendered_plan_hash:null,source_kind:null,
  rights_attested:false,status:'draft',marketing_run_id:null,approved_at:null,approved_by:null,
  scheduled_for:null,published_at:null
 };
 const next=checked(await db.from('instagram_reel_drafts').insert(copy).select('*').single()) as Row;
 return next;
}
async function reserve(db:DB,actor:string,kind:'ideas'|'script'|'ai_image',requestKey:string,reelId?:string){
 if(!/^reel-(ideas|script|image):[a-f0-9-]{36}$/i.test(requestKey))
  throw new Error('REEL_AI_REQUEST_KEY_REQUIRED');
 const r=checked(await db.rpc('reserve_marketing_reel_ai',{
  p_key:requestKey,p_kind:kind,p_actor:actor,p_reel:reelId||null
 })) as Row;
 return {accepted:r.accepted===true,job:r.job as Row};
}
async function callAi(endpoint:'chat/completions'|'images/generations',body:Row,timeout=45000){
 const key=process.env.OPENAI_API_KEY?.trim();
 if(!key)throw new Error('OPENAI_KEY_MISSING');
 let response:Response;
 try{response=await fetch('https://api.openai.com/v1/'+endpoint,{
  method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),
  cache:'no-store',redirect:'error'
 });}
 catch{throw new Error('UPSTREAM_OUTCOME_UNKNOWN');}
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data)throw new Error('REEL_AI_PROVIDER_'+response.status+': '+tokenSafe(data?.error?.message||'Provider response failed'));
 return data;
}
async function paid<T>(db:DB,actor:string,kind:'ideas'|'script'|'ai_image',key:string,reelId:string|null,action:()=>Promise<{result:T;usage?:Row}>){
 const reserved=await reserve(db,actor,kind,key,reelId||undefined),job=reserved.job;
 if(!reserved.accepted){
  if(job.status==='completed'&&job.result)return {result:job.result as T,deduplicated:true,job_id:job.id};
  throw new Error('REEL_AI_REQUEST_ALREADY_RECORDED_'+String(job.status).toUpperCase());
 }
 try{
  const response=await action();
  checked(await db.from('marketing_reel_ai_runs').update({
   status:'completed',result:response.result,input_tokens:Number(response.usage?.prompt_tokens||response.usage?.input_tokens||0),
   output_tokens:Number(response.usage?.completion_tokens||response.usage?.output_tokens||0),updated_at:new Date().toISOString()
  }).eq('id',job.id).eq('status','running'));
  return {result:response.result,deduplicated:false,job_id:job.id};
 }catch(error){
  const unknown=error instanceof Error&&error.message==='UPSTREAM_OUTCOME_UNKNOWN';
  await db.from('marketing_reel_ai_runs').update({
   status:unknown?'uncertain':'failed',error_code:tokenSafe(error),updated_at:new Date().toISOString()
  }).eq('id',job.id).eq('status','running');
  throw error;
 }
}
function parseMessage(result:Row){
 const first=result?.choices?.[0],text=first?.message?.content;
 if(first?.finish_reason!=='stop'||first.message.refusal||typeof text!=='string')
  throw new Error('REEL_AI_INCOMPLETE_RESPONSE');
 try{return JSON.parse(text);}catch{throw new Error('REEL_AI_BAD_JSON');}
}
export async function reelCreativeApi(req:NextRequest,actor:string,path:string[]){
 const db=createServiceRoleClient(),[id,route,detail]=path;
 if(id==='ai'&&route==='ideas'&&req.method==='POST'){
  const body=await req.json().catch(()=>({}));const pillar=String(body.pillar||''),
   language=body.language==='ko'?'ko':'en';
  if(!(REEL_PILLARS as readonly string[]).includes(pillar)||!['ko','en'].includes(body.language)||
    body.confirm_paid_ai!==true)throw new Error('REEL_IDEA_INPUT_INVALID');
  const recent=checked(await db.from('instagram_reel_drafts').select('title')
   .gte('created_at',new Date(Date.now()-60*86400000).toISOString())
   .order('created_at',{ascending:false}).limit(30)) as Row[];
  const learned=await performanceEditorialHint(db,'reel',language).catch(()=> ''),
   input=reelAiIdeasPrompt(language,pillar,recent.map(x=>String(x.title||'')))+
    (learned?'\n'+learned:''),
   runKey=String(body.request_key||'');
  const generated=await paid(db,actor,'ideas',runKey,null,async()=>{
   const out=await callAi('chat/completions',{model:MODEL,reasoning_effort:'none',max_completion_tokens:2600,
    response_format:{type:'json_schema',json_schema:{name:'roundy_reel_ideas_v1',strict:true,schema:reelIdeasJsonSchema()}},
    messages:[{role:'system',content:input},{role:'user',content:'Generate five distinct truthful Reel concepts.'}]});
   return {result:{candidates:evaluateReelIdeas(parseMessage(out),language,recent.map(x=>x.title)),pillar,language},usage:out.usage};
  });
  return json({...generated.result,run_id:generated.job_id,deduplicated:generated.deduplicated});
 }
 if(id==='ai'&&route==='history'&&req.method==='GET'){
  const jobs=checked(await db.from('marketing_reel_ai_runs').select('id,kind,status,result,created_at')
   .eq('kind','ideas').eq('status','completed').order('created_at',{ascending:false}).limit(5)) as Row[];
  return json({runs:jobs});
 }
 if(id==='assets'&&path.length===1&&req.method==='GET'){
  const rows=checked(await db.from('marketing_reel_assets').select('*').order('created_at',{ascending:false}).limit(100)) as Row[];
  return json({assets:await assetsWithPreview(db,rows)});
 }
 if(id==='assets'&&route==='register'&&req.method==='POST'){
  const b=await req.json().catch(()=>({}));const rights=videoSourceRights(b);
  const storagePath=String(b.storage_path||''),mime=String(b.content_type||'');
  if(!new RegExp('^'+actor+'/[a-f0-9-]{36}\\.(mp4|jpg|jpeg|png|webp)$','i').test(storagePath))
   throw new Error('REEL_ASSET_STORAGE_PATH_INVALID');
  if(rights.kind==='licensed_video'&&mime!=='video/mp4')throw new Error('REEL_ASSET_VIDEO_REQUIRED');
  if(rights.kind!=='licensed_video'&&!['image/jpeg','image/png','image/webp'].includes(mime))
   throw new Error('REEL_ASSET_IMAGE_REQUIRED');
  const existing=checked(await db.from('marketing_reel_assets').select('id').eq('storage_path',storagePath).maybeSingle());
  if(existing)throw new Error('REEL_ASSET_ALREADY_REGISTERED');
  const data=await db.storage.from(REEL_ASSET_BUCKET).download(storagePath);
  if(data.error||!data.data)throw new Error('REEL_ASSET_UPLOAD_NOT_FOUND');
  const bytes=new Uint8Array(await data.data.arrayBuffer());
  if(bytes.length>41943040||bytes.length<300)throw new Error('REEL_ASSET_SIZE_INVALID');
  let width:number,height:number,duration_seconds:number|null=null;
  if(rights.kind==='licensed_video'){
   const meta=inspectReelMp4(bytes);width=meta.width;height=meta.height;duration_seconds=meta.duration_seconds;
   if(!duration_seconds)throw new Error('REEL_FOOTAGE_DURATION_NOT_VERIFIED');
  }else{
   if(bytes.length>10*1024*1024)throw new Error('REEL_ASSET_IMAGE_TOO_LARGE');
   const meta=await sharp(Buffer.from(bytes)).metadata();
   if(!['jpeg','png','webp'].includes(String(meta.format))||!meta.width||!meta.height)
    throw new Error('REEL_ASSET_IMAGE_METADATA_INVALID');
   const expected=meta.format==='jpeg'?'image/jpeg':'image/'+meta.format;
   if(expected!==mime)throw new Error('REEL_ASSET_MIME_MISMATCH');
   width=meta.width;height=meta.height;
  }
  const asset=checked(await db.from('marketing_reel_assets').insert({
   ...rights,storage_path:storagePath,content_type:mime,file_size:bytes.length,width,height,duration_seconds,
   created_by:actor,review_status:'pending'
  }).select('*').single()) as Row;
  return json({asset:(await assetsWithPreview(db,[asset]))[0]},201);
 }
 if(id==='assets'&&route==='import-photo'&&req.method==='POST'){
  const body=await req.json().catch(()=>({})),photoId=String(body.photo_id||'');
  if(!uuid(photoId)||body.confirm_import!==true)throw new Error('REEL_PHOTO_IMPORT_REQUIRED');
  const photo=checked(await db.from('marketing_photo_assets').select('*')
   .eq('id',photoId).eq('review_status','approved').maybeSingle()) as Row|null;
  if(!photo||!photo.storage_path||photo.commercial_use_allowed!==true||
    photo.modifications_allowed!==true||!photo.license_checked_at||!photo.photographer)
   throw new Error('REEL_PHOTO_SOURCE_NOT_APPROVED');
  const data=await db.storage.from('marketing-images').download(String(photo.storage_path));
  if(data.error||!data.data)throw new Error('REEL_PHOTO_ARCHIVE_UNAVAILABLE');
  const bytes=new Uint8Array(await data.data.arrayBuffer());
  if(bytes.length<300||bytes.length>10*1024*1024)throw new Error('REEL_PHOTO_IMAGE_SIZE_INVALID');
  const meta=await sharp(Buffer.from(bytes)).metadata();
  if(!meta.width||!meta.height)throw new Error('REEL_PHOTO_IMAGE_INVALID');
  const archive=actor+'/'+randomUUID()+'.jpg',archived=await sharp(Buffer.from(bytes)).jpeg({quality:88}).toBuffer();
  checked(await db.storage.from(REEL_ASSET_BUCKET).upload(archive,archived,{contentType:'image/jpeg',upsert:false}));
  const asset=checked(await db.from('marketing_reel_assets').insert({
   kind:'approved_photo',storage_path:archive,content_type:'image/jpeg',
   file_size:archived.length,width:meta.width,height:meta.height,creator:String(photo.photographer),
   source_url:String(photo.source_url||''),license_url:String(photo.license_url||''),
   license_note:'Imported from pre-approved Roundy photo library. Source: '+String(photo.provider||'stock'),
   original_owned:false,commercial_use_allowed:true,modifications_allowed:true,
   rights_attested:true,review_status:'approved',reviewed_by:actor,reviewed_at:new Date().toISOString(),
   created_by:actor
  }).select('*').single()) as Row;
  return json({asset:(await assetsWithPreview(db,[asset]))[0],imported:true});
 }
 if(id==='assets'&&route==='ai-image'&&req.method==='POST'){
  const b=await req.json().catch(()=>({})),prompt=String(b.prompt||'').trim();
  if(b.confirm_paid_ai!==true||prompt.length<12||prompt.length>350)
   throw new Error('REEL_AI_IMAGE_PROMPT_INVALID');
  const key=String(b.request_key||'');
  const result=await paid(db,actor,'ai_image',key,null,async()=>{
   const out=await callAi('images/generations',{model:IMAGE_MODEL,n:1,size:'1024x1280',
    quality:'low',output_format:'jpeg',output_compression:85,
    prompt:'Original photorealistic vertical 9:16-friendly editorial background. No text, logos, headlines, brand marks, real-person likeness, or fake documentary/news events. Seoul city life: '+prompt},65000);
   const encoded=out.data?.[0]?.b64_json;
   if(typeof encoded!=='string'||encoded.length<300)throw new Error('REEL_AI_IMAGE_INVALID_RESPONSE');
   const bytes=await sharp(Buffer.from(encoded,'base64')).jpeg({quality:88}).toBuffer();
   if(bytes.length>10*1024*1024)throw new Error('REEL_AI_IMAGE_TOO_LARGE');
   const meta=await sharp(bytes).metadata(),storagePath=actor+'/'+randomUUID()+'.jpg';
   checked(await db.storage.from(REEL_ASSET_BUCKET).upload(storagePath,bytes,{contentType:'image/jpeg',upsert:false}));
   const asset=checked(await db.from('marketing_reel_assets').insert({
    kind:'ai_image',storage_path:storagePath,content_type:'image/jpeg',file_size:bytes.length,
    width:meta.width,height:meta.height,creator:'Roundy AI Studio',source_url:'',license_url:'',
    license_note:'Original generated editorial image; verify commercial usage and image content before approval.',
    original_owned:false,commercial_use_allowed:true,modifications_allowed:true,
    rights_attested:true,ai_model:IMAGE_MODEL,created_by:actor,review_status:'pending'
   }).select('*').single()) as Row;
   return {result:{asset_id:asset.id}};
  });
  const asset=checked(await db.from('marketing_reel_assets').select('*').eq('id',result.result.asset_id).single()) as Row;
  return json({asset:(await assetsWithPreview(db,[asset]))[0],deduplicated:result.deduplicated});
 }
 if(id==='assets'&&uuid(route)&&detail==='review'&&req.method==='POST'){
  const b=await req.json().catch(()=>({})),row=checked(await db.from('marketing_reel_assets').select('*').eq('id',route).single()) as Row;
  if(row.review_status!=='pending'||!['approved','rejected'].includes(b.status)||b.confirm_rights!==true)
   throw new Error('REEL_ASSET_REVIEW_REQUIRED');
  const patch={review_status:b.status,reviewed_by:actor,reviewed_at:new Date().toISOString()};
  const asset=checked(await db.from('marketing_reel_assets').update(patch)
   .eq('id',route).eq('review_status','pending').select('*').maybeSingle()) as Row|null;
  if(!asset)throw new Error('REEL_ASSET_CHANGED');
  return json({asset:(await assetsWithPreview(db,[asset]))[0]});
 }
 if(!uuid(id))return json({error:'INVALID_REEL_CREATIVE_ROUTE'},404);
 const source=await reel(db,id);
 if(route==='ai'&&detail==='script'&&req.method==='POST'){
  const b=await req.json().catch(()=>({}));
  if(b.confirm_paid_ai!==true||source.revision!==b.revision||!editable(source)||
     !uuid(b.ideas_run_id)||!Number.isInteger(b.idea_index)||b.idea_index<0||b.idea_index>4)
   throw new Error('REEL_SCRIPT_REQUEST_INVALID');
  const previous=checked(await db.from('marketing_reel_ai_runs').select('kind,status,result')
   .eq('id',b.ideas_run_id).single()) as Row;
  const idea=previous.kind==='ideas'&&previous.status==='completed'?previous.result?.candidates?.[b.idea_index] as ReelIdea:null;
  if(!idea||idea.status!=='eligible'||previous.result.language!==source.language||previous.result.pillar!==source.pillar)
   throw new Error('REEL_IDEA_NOT_APPROVED_FOR_SCRIPT');
  const runKey=String(b.request_key||'');
  const response=await paid(db,actor,'script',runKey,source.id,async()=>{
   const out=await callAi('chat/completions',{model:MODEL,reasoning_effort:'none',max_completion_tokens:3400,
    response_format:{type:'json_schema',json_schema:{name:'roundy_reel_script_v1',strict:true,schema:reelScriptJsonSchema()}},
    messages:[{role:'system',content:reelAiScriptPrompt(source.language==='ko'?'ko':'en',idea)},
     {role:'user',content:'Create a 15–30 second storyboard for the selected concept.'}]});
   const plan=validateReelPlan(parseMessage(out),source.language==='ko'?'ko':'en');
   return {result:{plan,source_idea:{title:idea.title,format_type:idea.format_type,score:idea.score}},usage:out.usage};
  });
  const plan=validateReelPlan(response.result.plan,source.language==='ko'?'ko':'en');
  const next=await cloneCreativeReel(db,source,plan,actor,'script:'+runKey.split(':')[1]);
  return json({draft:next,plan,selected_idea:response.result.source_idea,deduplicated:response.deduplicated});
 }
 if(route==='storyboard'&&detail==='version'&&req.method==='POST'){
  const b=await req.json().catch(()=>({}));
  if(b.confirm_version!==true||source.revision!==b.revision||!editable(source))
   throw new Error('REEL_STORYBOARD_VERSION_INVALID');
  const plan=validateReelPlan(b.plan,source.language==='ko'?'ko':'en');
  await verifiedSceneAssets(db,plan);
  const next=await cloneCreativeReel(db,source,plan,actor,String(b.request_key||''));
  return json({draft:next,needs_video_render:true});
 }
 if(route==='assets'&&req.method==='GET'){
  const plan=source.creative_plan?.version===1
   ?validateReelPlan(source.creative_plan,source.language==='ko'?'ko':'en'):null;
  const used=plan?await verifiedSceneAssets(db,plan):[];
  return json({assets:await assetsWithPreview(db,used)});
 }
 return json({error:'INVALID_REEL_CREATIVE_ROUTE'},404);
}
