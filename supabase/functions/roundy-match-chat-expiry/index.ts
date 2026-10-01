import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
import { StreamChat } from 'npm:stream-chat@9.53.0';

const url=Deno.env.get('SUPABASE_URL')??'';
const anonKey=Deno.env.get('SUPABASE_ANON_KEY')??'';
const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const streamApiKey=Deno.env.get('STREAM_CHAT_API_KEY')??'';
const streamApiSecret=Deno.env.get('STREAM_CHAT_API_SECRET')??'';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const validJob=(value:unknown):value is {id:string;channel_id:string}=>Boolean(value&&typeof value==='object'&&typeof (value as {id?:unknown}).id==='string'&&typeof (value as {channel_id?:unknown}).channel_id==='string');

Deno.serve(async request=>{
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!anonKey||request.headers.get('authorization')!==`Bearer ${anonKey}`)return json({error:'Unauthorized'},401);
 if(!url||!serviceRoleKey||!streamApiKey||!streamApiSecret)return json({error:'Match chat expiry is not configured.'},503);

 const database=createClient(url,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await database.rpc('claim_match_chat_cleanup',{p_limit:50});
 if(error)return json({error:'Could not claim expired chat rooms.'},503);
 const jobs=Array.isArray(data)?data.filter(validJob):[];
 if(!jobs.length)return json({claimed:0,submitted:0,failed:0});

 const stream=StreamChat.getInstance(streamApiKey,streamApiSecret);
 let submitted=0,failed=0;
 for(const job of jobs){
  try{
   const result=await stream.deleteChannels(['roundy_match:'+job.channel_id],{hard_delete:true});
   const {error:finishError}=await database.rpc('finish_match_chat_cleanup',{
    p_matches:[job.id],p_succeeded:true,p_error:null,p_task_id:typeof result.task_id==='string'?result.task_id:null,
   });
   if(finishError)throw finishError;
   submitted+=1;
  }catch(error){
   const message=error instanceof Error?error.message.slice(0,500):'Stream cleanup failed';
   await database.rpc('finish_match_chat_cleanup',{p_matches:[job.id],p_succeeded:false,p_error:message,p_task_id:null});
   failed+=1;
  }
 }
 return json({claimed:jobs.length,submitted,failed});
});
