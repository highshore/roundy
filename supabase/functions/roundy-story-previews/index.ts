import {createClient} from 'npm:@supabase/supabase-js@2.117.0';
const url=Deno.env.get('SUPABASE_URL')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
 auth:{persistSession:false,autoRefreshToken:false}});
const token=()=>Deno.env.get('INSTAGRAM_ACCESS_TOKEN')||'';
const instagramId=()=>Deno.env.get('INSTAGRAM_USER_ID')||'';
const apiVersion=()=>Deno.env.get('INSTAGRAM_API_VERSION')||'v25.0';
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{
 status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
type Story=Record<string,any>;
const checked=(r:{data:any;error:any})=>{if(r.error)throw r.error;return r.data;};
async function graph(path:string,post?:Record<string,string>){
 const response=await fetch('https://graph.instagram.com/'+apiVersion()+'/'+path,{
  method:post?'POST':'GET',
  headers:{Authorization:'Bearer '+token(),...(post?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
  body:post?new URLSearchParams(post):undefined,signal:AbortSignal.timeout(25000)
 });
 const body=await response.json().catch(()=>({}));
 if(!response.ok||body.error)throw new Error('META_STORY_API_'+String(body.error?.code||response.status));
 return body;
}
async function businessCapability(){
 if(!token()||!instagramId())return {supported:false,reason:'META_STORY_ACCOUNT_NOT_CONFIGURED',account_type:'unknown'};
 // Account lookup is READ-ONLY, does not publish a test Story.
 try{
  const profile=await graph('me?fields=user_id,username,account_type');
  if(String(profile.user_id)!==instagramId()||
   String(profile.username||'').toLowerCase()!=='roundy.meet')
   return {supported:false,reason:'META_STORY_ACCOUNT_MISMATCH',account_type:String(profile.account_type||'unknown')};
  if(String(profile.account_type||'').toUpperCase()!=='BUSINESS')
   return {supported:false,reason:'META_STORY_BUSINESS_ACCOUNT_REQUIRED',account_type:String(profile.account_type||'unknown')};
  return {supported:true,reason:null,account_type:'BUSINESS'};
 }catch(error){
  return {supported:false,reason:error instanceof Error?error.message:'META_STORY_ACCOUNT_UNVERIFIED',account_type:'unknown'};
 }
}
function assertImage(story:Story){
 const prefix=url.replace(/\/$/,'')+'/storage/v1/object/public/wis-event-images/story-previews/';
 if(story.media_format!=='jpeg_static'||!String(story.image_url||'').startsWith(prefix)
  ||!/^[-a-f0-9]{36}\/[-a-f0-9]{36}\.jpg$/i.test(String(story.image_url).slice(prefix.length)))
  throw new Error('STORY_UNSUPPORTED_AUTO_PUBLISH_FORMAT');
}
async function markState(story:Story,status:'published'|'needs_review'|'manual_ready'|'failed',
 error:string|null=null,media?:string,link?:string){
 const fields:Record<string,unknown>={status,updated_at:new Date().toISOString(),
  error_code:error?error.slice(0,100):null,error_message:error?error.slice(0,500):null};
 if(status==='published')Object.assign(fields,{publication_mode:'api',published_at:new Date().toISOString(),
  instagram_media_id:media||null,instagram_permalink:link||null});
 checked(await service.from('marketing_story_previews').update(fields)
  .eq('id',story.id).eq('status','publishing'));
 checked(await service.from('marketing_story_publish_attempts').update({
  state:status==='published'?'sent':status,
  finished_at:new Date().toISOString(),error_code:fields.error_code,
  error_message:fields.error_message,instagram_media_id:media||null
 }).eq('story_id',story.id));
}
async function publishStory(story:Story){
 let sentExternalPost=false;
 try{
  assertImage(story);
  const capability=await businessCapability();
  if(!capability.supported){
   await markState(story,'manual_ready',String(capability.reason||'META_STORY_ACCOUNT_UNVERIFIED'));
   return {id:story.id,status:'manual_ready',reason:capability.reason};
  }
  // Durable record before ANY side-effectful Meta call, not just /media_publish.
  // No automatic retry is possible, even if the provider never returned a response.
  const marked=await service.rpc('mark_marketing_story_external_attempt',{p_story:story.id});
  if(marked.error||marked.data!==true)throw new Error('STORY_EXTERNAL_ATTEMPT_NOT_DURABLE');
  sentExternalPost=true;
  const container=await graph(instagramId()+'/media',{
   media_type:'STORIES',image_url:story.image_url
  });
  const creationId=String(container.id||'');
  if(!/^\d+$/.test(creationId))throw new Error('STORY_META_CONTAINER_ID_MISSING');
  checked(await service.from('marketing_story_previews').update({
   instagram_container_id:creationId,updated_at:new Date().toISOString()
  }).eq('id',story.id).eq('status','publishing'));
  checked(await service.from('marketing_story_publish_attempts').update({
   instagram_container_id:creationId
  }).eq('story_id',story.id));
  let ready=false;
  for(let attempt=0;attempt<7;attempt++){
   const media=await graph(creationId+'?fields=status_code');
   if(media.status_code==='FINISHED'){ready=true;break;}
   if(['ERROR','EXPIRED','FAILED'].includes(String(media.status_code)))
    throw new Error('STORY_META_CONTAINER_FAILED');
   await new Promise(resolve=>setTimeout(resolve,1500));
  }
  if(!ready)throw new Error('STORY_META_CONTAINER_UNCONFIRMED');
  const published=await graph(instagramId()+'/media_publish',{creation_id:creationId});
  const mediaId=String(published.id||'');
  if(!/^\d+$/.test(mediaId))throw new Error('STORY_META_PUBLISH_RESULT_UNKNOWN');
  const permalink=await graph(mediaId+'?fields=permalink').then(x=>String(x.permalink||'')).catch(()=>'');
  await markState(story,'published',null,mediaId,permalink);
  return {id:story.id,status:'published',media_id:mediaId};
 }catch(error){
  const reason=error instanceof Error?error.message:'STORY_META_OUTCOME_UNKNOWN';
  // Once the first Meta POST may have been sent, do NOT auto-retry the Story.
  const status=sentExternalPost?'needs_review':reason==='STORY_UNSUPPORTED_AUTO_PUBLISH_FORMAT'?'manual_ready':'failed';
  try{await markState(story,status,reason);}catch(e){console.error('Story result persistence failed',e);}
  return {id:story.id,status,error:reason};
 }
}
Deno.serve(async req=>{
 try{
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  const secret=req.headers.get('x-marketing-secret');
  let authorized=false;
  if(secret){
   const r=await service.rpc('marketing_scheduler_authorized',{p_secret:secret});
   authorized=!r.error&&r.data===true;
  }else{
   const auth=req.headers.get('Authorization')||'';
   if(auth.startsWith('Bearer ')){
    const userClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{
     global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const user=await userClient.auth.getUser();
    if(!user.error&&user.data.user){
     const role=await userClient.rpc('is_admin');
     authorized=!role.error&&role.data===true;
    }
   }
  }
  if(!authorized)return json({error:'UNAUTHORIZED'},401);
  const body=await req.json().catch(()=>({}));
  if(body.action==='capability'){
   return json(await businessCapability());
  }
  const claimed=checked(await service.rpc('claim_marketing_story_previews')) as Story[];
  const results=[];
  for(const story of claimed)results.push(await publishStory(story));
  return json({processed:results.length,results});
 }catch(error){
  return json({error:error instanceof Error?error.message:'STORY_WORKER_FAILED'},400);
 }
});
