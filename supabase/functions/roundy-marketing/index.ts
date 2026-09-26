import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
import { hasAdvertOnGopasFirstPage, publishToKoreapas } from './koreapas.ts';
const url=Deno.env.get('SUPABASE_URL')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const token=()=>Deno.env.get('INSTAGRAM_ACCESS_TOKEN');
const userId=()=>Deno.env.get('INSTAGRAM_USER_ID');
const connection=()=>({instagram:Boolean(token()&&userId()),koreapas:Boolean(Deno.env.get('KOREAPAS_USER_ID')&&Deno.env.get('KOREAPAS_PASSWORD'))});
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
type Template={channel:'instagram'|'koreapas';title:string;caption:string;cta:string;destination_url:string;images:string[]};
async function graph(path:string,fields?:Record<string,string>){
 const root='https://graph.instagram.com/'+(Deno.env.get('INSTAGRAM_API_VERSION')||'v25.0')+'/';
 const response=await fetch(root+path,{method:fields?'POST':'GET',headers:{Authorization:'Bearer '+token(),...(fields?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:fields?new URLSearchParams(fields):undefined,signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok||data.error)throw new Error('Instagram API error '+(data.error?.code??response.status)+'. Check account access, token expiry and media requirements.');return data;
}
async function ready(id:string){
 for(let i=0;i<8;i++){const data=await graph(id+'?fields=status_code');if(data.status_code==='FINISHED')return;if(['ERROR','EXPIRED'].includes(data.status_code))throw new Error('Instagram rejected the media container');await new Promise(resolve=>setTimeout(resolve,1500));}
 throw new Error('Instagram media processing timed out');
}
async function publishInstagram(t:Template,beforePublish:()=>void){
 const account=await graph('me?fields=user_id,username');
 if(account.username?.toLowerCase()!=='roundy.meet'||String(account.user_id)!==userId())throw new Error('Instagram credentials must belong to @roundy.meet');
 const caption=[t.caption,[t.cta,t.destination_url].filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
 if(caption.length>2200)throw new Error('Instagram caption including the link exceeds 2,200 characters');
 let container:string;
 if(t.images.length===1)container=(await graph(userId()+'/media',{image_url:t.images[0],caption})).id;
 else {const children:string[]=[];for(const image of t.images){const child=await graph(userId()+'/media',{image_url:image,is_carousel_item:'true'});await ready(child.id);children.push(child.id);}container=(await graph(userId()+'/media',{media_type:'CAROUSEL',children:children.join(','),caption})).id;}
 await ready(container);beforePublish();const post=await graph(userId()+'/media_publish',{creation_id:container});
 const details=await graph(post.id+'?fields=permalink').catch(()=>({}));return {external_id:post.id,external_url:details.permalink??'https://www.instagram.com/roundy.meet/'};
}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function validate(t:Template){
 if(!['instagram','koreapas'].includes(t.channel)||!t.caption?.trim())throw new Error('Add post copy before publishing');
 if(t.destination_url){const u=new URL(t.destination_url);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Invalid destination URL');}
 if(!Array.isArray(t.images)||t.images.length>10||t.images.some(image=>!image.startsWith(url+'/storage/v1/object/public/wis-event-images/')||!/^[-a-f0-9]+\/[-a-f0-9]+\.jpg$/.test(image.split('/wis-event-images/')[1]??'')))throw new Error('Use uploaded JPEG marketing images');
 if(t.channel==='instagram'&&!t.images.length)throw new Error('Instagram needs at least one image');
 if(t.channel==='koreapas'&&!t.title?.trim())throw new Error('Add a Koreapas title');
 if(!connection()[t.channel])throw new Error('Channel is not connected');
}
Deno.serve(async req=>{
 try{
  let adminClient:ReturnType<typeof createClient>|null=null;
  const schedulerKey=req.headers.get('x-marketing-secret');
  if(schedulerKey){const {data,error}=await service.rpc('marketing_scheduler_authorized',{p_secret:schedulerKey});if(error||data!==true)return json({error:'Unauthorized'},401);}
  else {const authorization=req.headers.get('Authorization')??'';adminClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});const {data:{user},error}=await adminClient.auth.getUser();if(error||!user||user.app_metadata.provider!=='kakao')return json({error:'Sign in required'},401);const {data:admin,error:adminError}=await adminClient.rpc('is_admin');if(adminError||admin!==true)return json({error:'Administrator access required'},403);}
  if(req.method==='GET')return json(connection());
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(adminClient){const body=await req.json();const {data:template,error}=await adminClient.from('marketing_templates').select('*').eq('id',body.template_id).single();if(error||!template)return json({error:'Template not found'},404);validate(template);const result=await adminClient.rpc('enqueue_marketing',{p_template:body.template_id,p_request_key:body.request_key});if(result.error)throw result.error;}
  const {data:runs,error}=await service.rpc('claim_marketing');if(error)throw error;
  const results=[];
  for(const run of runs??[]){let externalAttempt=false;let outcome:Record<string,unknown>;
   try{const t=run.snapshot as Template;validate(t);
    if(t.channel==='koreapas'&&await hasAdvertOnGopasFirstPage(t.title))outcome={status:'skipped',message:'A post with this title is already on the first Koreapas page.'};
    else if(t.channel==='instagram'){const result=await publishInstagram(t,()=>{externalAttempt=true;});outcome={status:'sent',message:'Published to @roundy.meet',...result};}
    else {const html='<p>'+escapeHtml(t.caption).replace(/\n/g,'<br>')+'</p>'+t.images.map(image=>'<p><img src="'+escapeHtml(image)+'" alt="Roundy event"></p>').join('')+(t.destination_url?'<p><a href="'+escapeHtml(t.destination_url)+'">'+escapeHtml(t.cta||t.destination_url)+'</a></p>':'');externalAttempt=true;const external_url=await publishToKoreapas(t.title,html);outcome={status:'sent',message:'Published to Koreapas',external_url};}
   }catch(error){outcome={status:externalAttempt?'needs_review':'failed',message:(error instanceof Error?error.message:'Publishing failed').slice(0,500)};}
   const {error:updateError}=await service.from('marketing_runs').update({...outcome,finished_at:new Date().toISOString()}).eq('id',run.id).eq('status','publishing');if(updateError)throw updateError;results.push({id:run.id,...outcome});
  }
  return json({ok:true,runs:results});
 }catch(error){return json({error:error instanceof Error?error.message:'Marketing request failed'},400);}
});
