import 'server-only';
import {NextRequest,NextResponse} from 'next/server';
import type {createClient} from './supabase/server';
import {createServiceRoleClient} from './supabase/service';
import {generateTomorrowStoryPreviews} from './marketing-story-generation';
type Client=Awaited<ReturnType<typeof createClient>>;
type Row=Record<string,any>;
const ok=(r:{data:any;error:any})=>{if(r.error)throw r.error;return r.data;};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private,no-store'}});
const uuid=(x:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);

export async function marketingStoryApi(req:NextRequest,client:Client,path:string[]){
 const db=createServiceRoleClient(),action=path[0]||'';
 const user=(await client.auth.getUser()).data.user;
 if(!user)return json({error:'ADMIN_SIGN_IN_REQUIRED'},401);
 if(req.method==='GET'&&path.length===0){
  const stories=ok(await db.from('marketing_story_previews').select('*')
   .order('created_at',{ascending:false}).limit(60)) as Row[];
  const ids=stories.map(s=>s.id);
  const attempts=ids.length?ok(await db.from('marketing_story_publish_attempts')
   .select('story_id,state,started_at,external_started_at,finished_at,error_code,error_message,instagram_media_id')
   .in('story_id',ids)):[];
  return json({stories,attempts,support:{
   automatic:'Only static JPEG 9:16 Stories on eligible Instagram Business accounts with content-publish permissions.',
   requires_account_check:true,
   unsupported:'Interactive stickers, polls, links, music and Creator/personal account auto-posting use manual upload.'
  }});
 }
 if(req.method==='POST'&&path.length===1&&action==='generate'){
  try{return json(await generateTomorrowStoryPreviews({manual:true}));}
  catch(e){return json({error:e instanceof Error?e.message:'STORY_GENERATION_FAILED'},409);}
 }
 if(!uuid(action))return json({error:'INVALID_STORY_REQUEST'},404);
 const story=ok(await db.from('marketing_story_previews').select('*').eq('id',action).maybeSingle()) as Row|null;
 if(!story)return json({error:'STORY_NOT_FOUND'},404);
 if(req.method==='GET'&&path.length===2&&path[1]==='download'){
  if(!story.image_path)return json({error:'STORY_IMAGE_NOT_GENERATED'},409);
  const image=await db.storage.from('wis-event-images').download(story.image_path);
  if(image.error||!image.data)return json({error:'STORY_IMAGE_UNAVAILABLE'},404);
  const bytes=Buffer.from(await image.data.arrayBuffer());
  return new NextResponse(bytes,{headers:{
   'Content-Type':'image/jpeg',
   'Content-Disposition':'attachment; filename="roundy-story-'+story.preview_date_kst+'.jpg"',
   'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'
  }});
 }
 if(req.method!=='POST'||path.length!==2)return json({error:'INVALID_STORY_ROUTE'},404);
 try{
  if(path[1]==='approve'){
   const data=ok(await db.rpc('approve_marketing_story_preview',{p_story:story.id,p_actor:user.id}));
   return json({story:data});
  }
  if(path[1]==='schedule'){
   const data=ok(await db.rpc('schedule_marketing_story_preview',{p_story:story.id,p_actor:user.id}));
   return json({story:data});
  }
  if(path[1]==='manual'){
   if(!['approved','scheduled'].includes(story.status)||!story.image_path||!story.approved_at)
    return json({error:'STORY_MUST_BE_APPROVED_FIRST'},409);
   const data=ok(await db.from('marketing_story_previews').update({
    status:'manual_ready',error_code:'STORY_MANUAL_UPLOAD_SELECTED',
    error_message:'Download the JPEG and upload it manually; no Meta API request was made.',
    updated_at:new Date().toISOString()
   }).eq('id',story.id).in('status',['approved','scheduled']).select('*').maybeSingle());
   if(!data)return json({error:'STORY_CHANGED_REFRESH_FIRST'},409);
   return json({story:data});
  }
  if(path[1]==='confirm-manual'){
   const body=await req.json().catch(()=>null);
   if(body?.confirm_manual_upload!==true)return json({error:'MANUAL_UPLOAD_CONFIRMATION_REQUIRED'},400);
   const data=ok(await db.rpc('confirm_marketing_story_manual_post',{p_story:story.id,p_actor:user.id}));
   return json({story:data});
  }
  return json({error:'INVALID_STORY_ROUTE'},404);
 }catch(e){return json({error:e instanceof Error?e.message:'STORY_ACTION_FAILED'},409);}
}
