import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
import { hasAdvertOnGopasFirstPage, publishToKoreapas } from './koreapas.ts';

const url=Deno.env.get('SUPABASE_URL')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const token=()=>Deno.env.get('INSTAGRAM_ACCESS_TOKEN');
const userId=()=>Deno.env.get('INSTAGRAM_USER_ID');
const apiVersion=()=>Deno.env.get('INSTAGRAM_API_VERSION')||'v25.0';
const connection=()=>({instagram:Boolean(token()&&userId()),koreapas:Boolean(Deno.env.get('KOREAPAS_USER_ID')&&Deno.env.get('KOREAPAS_PASSWORD'))});
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

type Template={channel:'instagram'|'koreapas';title:string;caption:string;cta:string;destination_url:string;images:string[];name?:string};
type EventRow={
 id:string;slug:string;title:string;starts_at:string;venue:string;neighborhood:string;
 age_min:number;age_max:number;capacity:number;seats_remaining:number;images:string[];
 price_gents:number;price_ladies:number;
};
type InboxRow={id:string;external_id:string;kind:'comment'|'dm';sender_id:string;status:string};

async function graph(path:string,fields?:Record<string,string>){
 const root='https://graph.instagram.com/'+apiVersion()+'/';
 const response=await fetch(root+path,{method:fields?'POST':'GET',headers:{Authorization:'Bearer '+token(),...(fields?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:fields?new URLSearchParams(fields):undefined,signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok||data.error)throw new Error('Instagram API error '+(data.error?.code??response.status)+'. Check account access, token expiry and media requirements.');return data;
}
async function graphJson(path:string,body:Record<string,unknown>){
 const response=await fetch('https://graph.instagram.com/'+apiVersion()+'/'+path,{
  method:'POST',
  headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},
  body:JSON.stringify(body),
  signal:AbortSignal.timeout(25000)
 });
 const data=await response.json();if(!response.ok||data.error)throw new Error('Instagram API error '+(data.error?.code??response.status)+'. Check messaging/comment permissions and token access.');return data;
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
async function sendInstagramDm(recipientId:string,message:string){
 const result=await graphJson(userId()+'/messages',{recipient:{id:recipientId},message:{text:message}});
 return String(result.message_id??result.id??'');
}
async function replyInstagramComment(commentId:string,message:string){
 const result=await graph(commentId+'/replies',{message});
 return String(result.id??'');
}
async function replyInbox(item:InboxRow,message:string){
 if(!message.trim()||message.length>2000)throw new Error('Reply must be 1–2,000 characters.');
 if(!['needs_review','new','failed'].includes(item.status))throw new Error('This message is no longer waiting for a reply.');
 const externalReplyId=item.kind==='dm'?await sendInstagramDm(item.sender_id,message.trim()):await replyInstagramComment(item.external_id,message.trim());
 const {error}=await service.from('instagram_inbox').update({status:'replied',reply_text:message.trim(),external_reply_id:externalReplyId,replied_at:new Date().toISOString(),decision_reason:'Replied by Roundy admin'}).eq('id',item.id);
 if(error)throw error;
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

function kstNow(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const get=(type:string)=>parts.find(part=>part.type===type)?.value??'00';
 return {date:get('year')+'-'+get('month')+'-'+get('day'),hour:Number(get('hour')),minute:Number(get('minute'))};
}
function dailyCaption(event:EventRow,dateKey:string){
 const date=new Date(event.starts_at);
 const enDate=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',weekday:'short',month:'short',day:'numeric'}).format(date);
 const enTime=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}).format(date);
 const koDate=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}).format(date);
 const koTime=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}).format(date);
 const hooks=[
  ['Skip the swipe. Meet in real life.','스와이프 대신, 직접 만나보세요.'],
  ['Real conversations beat endless texting.','끝없는 채팅보다 직접 나누는 대화.'],
  ['Meet one person at a time.','한 번에 한 사람씩, 제대로 만나보세요.'],
  ['Your next hello can start offline.','다음 인사는 오프라인에서 시작해보세요.'],
  ['A different way to meet people in Seoul.','서울에서 새로운 사람을 만나는 다른 방법.'],
  ['One room. A series of 1:1 conversations.','한 공간에서 이어지는 1:1 대화.'],
  ['Dating apps can wait. Meet face to face.','데이트 앱은 잠시 내려두고, 직접 만나보세요.']
 ];
 const hook=hooks[(Number(dateKey.slice(-2))-1)%hooks.length];
 const filled=Math.max(0,event.capacity-event.seats_remaining);
 const gents=Number(event.price_gents||49000).toLocaleString('ko-KR');
 const ladies=Number(event.price_ladies||29000).toLocaleString('ko-KR');
 return [
  hook[0],
  '',
  'Roundy is a 1:1 rotation mingle in Seoul. Meet each participant face to face, one conversation at a time.',
  '',
  '📍 '+event.venue,
  '🗓 '+enDate+' · '+enTime,
  'Ages '+event.age_min+'–'+event.age_max+' · '+filled+'/'+event.capacity+' spots filled',
  'Gents ₩'+gents+' · Ladies ₩'+ladies,
  '',
  '---',
  '',
  hook[1],
  '',
  'Roundy는 참가자들과 한 명씩 직접 대화하는 서울 오프라인 1:1 로테이션 밍글입니다.',
  '',
  '📍 '+event.venue,
  '🗓 '+koDate+' · '+koTime,
  event.age_min+'–'+event.age_max+'세 · 현재 '+filled+'/'+event.capacity+'명',
  '남성 '+gents+'원 · 여성 '+ladies+'원',
  '',
  '#Roundy #SeoulDating #MeetInSeoul #서울소개팅 #로테이션소개팅'
 ].join('\n');
}
async function enqueueDailyInstagram(){
 const {data:settings,error:settingsError}=await service.from('marketing_automation_settings').select('daily_instagram_enabled,daily_time_kst').eq('singleton',true).maybeSingle();
 if(settingsError)throw settingsError;
 if(!settings?.daily_instagram_enabled||!connection().instagram)return;
 const now=kstNow();
 const [dueHour,dueMinute]=String(settings.daily_time_kst||'20:00').split(':').map(Number);
 if(now.hour*60+now.minute<dueHour*60+dueMinute)return;
 const requestKey='auto:instagram:'+now.date;
 const {data:existing,error:existingError}=await service.from('marketing_runs').select('id').eq('request_key',requestKey).maybeSingle();
 if(existingError)throw existingError;if(existing)return;
 const {data:event,error:eventError}=await service.from('events')
  .select('id,slug,title,starts_at,venue,neighborhood,age_min,age_max,capacity,seats_remaining,images,price_gents,price_ladies')
  .eq('status','live').is('deleted_at',null).gt('starts_at',new Date().toISOString()).order('starts_at').limit(1).maybeSingle();
 if(eventError)throw eventError;
 const imagePrefix=url+'/storage/v1/object/public/wis-event-images/';
 const images=((event?.images??[]) as string[]).filter(image=>image.startsWith(imagePrefix)&&/^[-a-f0-9]+\/[-a-f0-9]+\.jpg$/.test(image.slice(imagePrefix.length))).slice(0,10);
 if(!event||!images.length){
  const snapshot={channel:'instagram',name:'Daily Instagram · '+now.date,title:'',caption:'',cta:'',destination_url:'https://roundy.team/events',images:[],auto_generated:true};
  const {error}=await service.from('marketing_runs').upsert({channel:'instagram',snapshot,request_key:requestKey,status:'skipped',message:'Daily auto-post skipped: no upcoming live event with a publishable image.',finished_at:new Date().toISOString()},{onConflict:'request_key',ignoreDuplicates:true});
  if(error)throw error;return;
 }
 const typed=event as EventRow;
 const snapshot={channel:'instagram',name:'Daily Instagram · '+now.date,title:typed.title,caption:dailyCaption(typed,now.date),cta:'See event details',destination_url:'https://roundy.team/events/'+typed.slug,images,days:[],time_kst:String(settings.daily_time_kst),enabled:true,auto_generated:true,event_id:typed.id};
 const {error}=await service.from('marketing_runs').upsert({channel:'instagram',snapshot,request_key:requestKey,scheduled_for:new Date().toISOString()},{onConflict:'request_key',ignoreDuplicates:true});
 if(error)throw error;
}

Deno.serve(async req=>{
 try{
  let adminClient:ReturnType<typeof createClient>|null=null;
  const schedulerKey=req.headers.get('x-marketing-secret');
  if(schedulerKey){const {data,error}=await service.rpc('marketing_scheduler_authorized',{p_secret:schedulerKey});if(error||data!==true)return json({error:'Unauthorized'},401);}
  else {const authorization=req.headers.get('Authorization')??'';adminClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});const {data:{user},error}=await adminClient.auth.getUser();if(error||!user||user.app_metadata.provider!=='kakao')return json({error:'Sign in required'},401);const {data:admin,error:adminError}=await adminClient.rpc('is_admin');if(adminError||admin!==true)return json({error:'Administrator access required'},403);}
  if(req.method==='GET')return json(connection());
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(adminClient){
   const body=await req.json();
   if(body.action==='reply_inbox'){
    if(!/^[0-9a-f-]{36}$/i.test(body.inbox_id)||typeof body.reply!=='string')return json({error:'Invalid inbox reply'},400);
    const {data:item,error}=await service.from('instagram_inbox').select('id,external_id,kind,sender_id,status').eq('id',body.inbox_id).single();
    if(error||!item)return json({error:'Inbox item not found'},404);
    await replyInbox(item as InboxRow,body.reply);
    return json({ok:true});
   }
   const {data:template,error}=await adminClient.from('marketing_templates').select('*').eq('id',body.template_id).single();if(error||!template)return json({error:'Template not found'},404);validate(template);const result=await adminClient.rpc('enqueue_marketing',{p_template:body.template_id,p_request_key:body.request_key});if(result.error)throw result.error;
  }
  if(schedulerKey)await enqueueDailyInstagram();
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
