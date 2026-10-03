import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
import { hasAdvertOnGopasFirstPage, publishToKoreapas } from './koreapas.ts';

const url=Deno.env.get('SUPABASE_URL')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const token=()=>Deno.env.get('INSTAGRAM_ACCESS_TOKEN');
const userId=()=>Deno.env.get('INSTAGRAM_USER_ID');
const apiVersion=()=>Deno.env.get('INSTAGRAM_API_VERSION')||'v25.0';
const connection=()=>({instagram:Boolean(token()&&userId()),koreapas:Boolean(Deno.env.get('KOREAPAS_USER_ID')&&Deno.env.get('KOREAPAS_PASSWORD'))});
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

type Template={channel:'instagram'|'koreapas';title:string;caption:string;cta:string;destination_url:string;images:string[];name?:string;draft_id?:string;eligible_for_optimization?:boolean;content_pillar?:string};
type EventRow={
 id:string;slug:string;title:string;starts_at:string;venue:string;neighborhood:string;
 age_min:number;age_max:number;capacity:number;seats_remaining:number;images:string[];
 price_gents:number;price_ladies:number;
};
type InboxRow={id:string;external_id:string;kind:'comment'|'dm';sender_id:string;status:string};
type AutomationSettings={daily_instagram_enabled:boolean;daily_time_kst:string;draft_generation_time_kst:string;optimization_enabled:boolean};
type DraftRow={id:string;draft_date:string;event_id:string|null;content_pillar:'event'|'urgency'|'problem'|'concept'|'seoul'|'trust';caption:string;cta:string;destination_url:string;images:string[];status:string;recommended_time_kst:string;window_start_kst:string;window_end_kst:string;scheduled_for:string|null;revision:number;eligible_for_optimization:boolean};
type Recommendation={dow:number;recommended_time_kst:string;window_start_kst:string;window_end_kst:string;sample_size:number;score:number;source:string;rationale:string};

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

function kstNow(value:Date=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value);
 const get=(type:string)=>parts.find(part=>part.type===type)?.value??'00';
 const dayName=get('weekday');
 return {date:get('year')+'-'+get('month')+'-'+get('day'),dow:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(dayName),hour:Number(get('hour')),minute:Number(get('minute'))};
}
const timeMinutes=(value:string)=>{const [h,m]=value.slice(0,5).split(':').map(Number);return h*60+m;};
const minutesTime=(minutes:number)=>{const normalized=Math.max(0,Math.min(1439,Math.round(minutes)));return String(Math.floor(normalized/60)).padStart(2,'0')+':'+String(normalized%60).padStart(2,'0');};
const kstIso=(date:string,time:string)=>new Date(date+'T'+time.slice(0,5)+':00+09:00').toISOString();
const hashText=(value:string)=>{let hash=2166136261;for(const char of value){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return hash>>>0;};
function jitteredTime(center:string,start:string,end:string,key:string){
 const centerMinute=timeMinutes(center),startMinute=timeMinutes(start),endMinute=timeMinutes(end);
 const offsets=[-20,-15,-10,-5,0,5,10,15,20];
 const target=centerMinute+offsets[hashText(key)%offsets.length];
 return minutesTime(Math.max(startMinute,Math.min(endMinute,target)));
}
async function automationSettings(){
 const {data,error}=await service.from('marketing_automation_settings').select('daily_instagram_enabled,daily_time_kst,draft_generation_time_kst,optimization_enabled').eq('singleton',true).single();
 if(error)throw error;return data as AutomationSettings;
}
async function recommendationFor(dow:number,dateKey:string,settings:AutomationSettings){
 if(!settings.optimization_enabled){
  const time=String(settings.daily_time_kst||'20:00').slice(0,5);
  return {recommended:time,windowStart:time,windowEnd:time,source:'manual',sampleSize:0,score:0,rationale:'Automatic time optimization is paused.'};
 }
 const {data,error}=await service.from('instagram_posting_time_recommendations').select('*').eq('dow',dow).maybeSingle();
 if(error)throw error;
 const rec=data as Recommendation|null;
 const fallback=String(settings.daily_time_kst||'20:00').slice(0,5);
 if(!rec)return {recommended:fallback,windowStart:fallback,windowEnd:fallback,source:'fallback',sampleSize:0,score:0,rationale:'Using the fallback posting time until a recommendation is available.'};
 return {
  recommended:jitteredTime(String(rec.recommended_time_kst),String(rec.window_start_kst),String(rec.window_end_kst),dateKey),
  windowStart:String(rec.window_start_kst).slice(0,5),
  windowEnd:String(rec.window_end_kst).slice(0,5),
  source:rec.source,
  sampleSize:Number(rec.sample_size||0),
  score:Number(rec.score||0),
  rationale:rec.rationale
 };
}
function eventDetails(event:EventRow){
 const date=new Date(event.starts_at);
 const enDate=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',weekday:'short',month:'short',day:'numeric'}).format(date);
 const enTime=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}).format(date);
 const koDate=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}).format(date);
 const koTime=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}).format(date);
 const filled=Math.max(0,event.capacity-event.seats_remaining);
 const gents=Number(event.price_gents||49000).toLocaleString('ko-KR');
 const ladies=Number(event.price_ladies||29000).toLocaleString('ko-KR');
 return {enDate,enTime,koDate,koTime,filled,gents,ladies};
}
async function choosePillar(event:EventRow,revision:number){
 const hours=(new Date(event.starts_at).getTime()-Date.now())/3600000;
 if(hours<=30)return {pillar:'urgency' as const,reason:'The next live event is within about a day, so today prioritizes a clear last-call event message.'};
 if(hours<=84)return {pillar:'event' as const,reason:'The next live event is within 3.5 days, so today prioritizes concrete event information.'};
 const {data,error}=await service.from('instagram_post_drafts').select('content_pillar').in('status',['approved','scheduled','published']).order('draft_date',{ascending:false}).limit(7);
 if(error)throw error;
 const recent=(data??[]).map(row=>String(row.content_pillar));
 const candidates=['problem','concept','seoul','trust','event'] as const;
 const ranked=[...candidates].sort((a,b)=>{
  const ac=recent.filter(item=>item===a).length+(recent[0]===a?2:0);
  const bc=recent.filter(item=>item===b).length+(recent[0]===b?2:0);
  if(ac!==bc)return ac-bc;
  return ((hashText(a+String(revision))%17)-(hashText(b+String(revision))%17));
 });
 return {pillar:ranked[0],reason:'Selected '+ranked[0]+' because recent approved posts are rotated across content pillars to avoid turning the feed into repeated event ads.'};
}
function draftCaption(event:EventRow,pillar:DraftRow['content_pillar'],dateKey:string,revision:number){
 const d=eventDetails(event),link='https://roundy.team/events/'+event.slug;
 const hooks:Record<DraftRow['content_pillar'],Array<[string,string]>>={
  urgency:[
   ['Meet offline before another week disappears into DMs.','또 한 주를 DM으로 보내기 전에 직접 만나보세요.'],
   ['The next Roundy is close. Your next hello can be offline.','다음 Roundy가 얼마 남지 않았어요. 다음 인사는 오프라인에서.']
  ],
  event:[
   ['Skip the swipe. Meet in real life.','스와이프 대신, 직접 만나보세요.'],
   ['A room full of real conversations, one person at a time.','한 번에 한 사람씩, 실제 대화가 이어지는 자리.']
  ],
  problem:[
   ['You cannot feel chemistry through a profile card.','프로필 카드만으로는 케미를 알 수 없으니까요.'],
   ['Three weeks of texting is not a first date.','3주간의 채팅이 첫 만남을 대신할 수는 없어요.']
  ],
  concept:[
   ['One conversation. Then the next. No swiping required.','한 사람과 대화하고, 다음 사람을 만납니다. 스와이프는 필요 없어요.'],
   ['Meet everyone face to face, then choose privately.','모두 직접 만나고, 선택은 나중에 조용히.']
  ],
  seoul:[
   ['Meeting people in Seoul should not depend on another dating app match.','서울에서 새로운 사람을 만나는 일이 또 하나의 앱 매치에 달릴 필요는 없죠.'],
   ['New to Seoul or simply ready to meet someone new?','서울이 처음이든, 새로운 만남이 필요하든.']
  ],
  trust:[
   ['Roundy is designed around what works in real rooms, not swipe screens.','Roundy는 스와이프 화면이 아니라 실제 모임에서 통하는 방식으로 만들었습니다.'],
   ['We care more about the room you walk into than the profile you scroll past.','스크롤해 지나치는 프로필보다, 직접 들어가는 공간의 경험을 더 중요하게 봅니다.']
  ]
 };
 const options=hooks[pillar],hook=options[(hashText(dateKey+String(revision)+pillar))%options.length];
 const commonEn=['📍 '+event.venue,'🗓 '+d.enDate+' · '+d.enTime,'Ages '+event.age_min+'–'+event.age_max+' · '+d.filled+'/'+event.capacity+' spots filled','Gents ₩'+d.gents+' · Ladies ₩'+d.ladies];
 const commonKo=['📍 '+event.venue,'🗓 '+d.koDate+' · '+d.koTime,event.age_min+'–'+event.age_max+'세 · 현재 '+d.filled+'/'+event.capacity+'명','남성 '+d.gents+'원 · 여성 '+d.ladies+'원'];
 const body:Record<DraftRow['content_pillar'],[string,string]>={
  urgency:['The next 1:1 rotation mingle is coming up. Meet participants face to face and reconnect only when the interest is mutual.','다음 1:1 로테이션 밍글이 곧 열립니다. 직접 만나 대화하고, 서로 다시 만나고 싶은 경우에만 매칭됩니다.'],
  event:['Roundy is a 1:1 rotation mingle in Seoul. Meet each participant face to face, one conversation at a time.','Roundy는 서울에서 한 명씩 직접 만나 대화하는 오프라인 1:1 로테이션 밍글입니다.'],
  problem:['Dating apps are good at showing profiles. They are less good at telling you how a conversation actually feels. Roundy starts with the meeting instead.','데이트 앱은 프로필을 보여주는 데는 익숙하지만, 실제 대화의 느낌까지 알려주지는 못합니다. Roundy는 만남부터 시작합니다.'],
  concept:['You rotate through short 1:1 conversations. After the event, choices stay private and a connection opens only when both people choose each other.','짧은 1:1 대화를 순서대로 나누고, 행사 후 선택은 비공개로 진행됩니다. 서로 선택한 경우에만 연결됩니다.'],
  seoul:['Roundy brings Korean and international participants into the same offline room in Seoul for structured 1:1 conversations.','Roundy는 서울에서 한국인과 외국인 참가자가 한 공간에 모여 1:1로 직접 대화할 수 있도록 만든 오프라인 밍글입니다.'],
  trust:['Roundy is built around structured hosting, clear event information and face-to-face conversations. The goal is a better room, not more time spent swiping.','Roundy는 실제 운영, 명확한 행사 정보, 그리고 대면 대화를 중심으로 설계합니다. 더 오래 스와이프하게 만드는 것이 목표가 아닙니다.']
 };
 return [
  hook[0],'',body[pillar][0],'',...commonEn,'','---','',hook[1],'',body[pillar][1],'',...commonKo,'',
  'See the next Roundy: '+link,'','#Roundy #SeoulDating #MeetInSeoul #서울소개팅 #로테이션소개팅'
 ].join('\n');
}
async function nextLiveEvent(){
 const {data,error}=await service.from('events')
  .select('id,slug,title,starts_at,venue,neighborhood,age_min,age_max,capacity,seats_remaining,images,price_gents,price_ladies')
  .eq('status','live').is('deleted_at',null).gt('starts_at',new Date().toISOString()).order('starts_at').limit(1).maybeSingle();
 if(error)throw error;return data as EventRow|null;
}
function publishableImages(event:EventRow|null){
 const prefix=url+'/storage/v1/object/public/wis-event-images/';
 return ((event?.images??[]) as string[]).filter(image=>image.startsWith(prefix)&&/^[-a-f0-9]+\/[-a-f0-9]+\.jpg$/.test(image.slice(prefix.length))).slice(0,10);
}
async function buildDraft(dateKey:string,dow:number,revision:number){
 const settings=await automationSettings(),timing=await recommendationFor(dow,dateKey,settings),event=await nextLiveEvent(),images=publishableImages(event);
 const scheduledFor=kstIso(dateKey,timing.recommended);
 if(!event||!images.length){
  return {event:null,pillar:'event' as const,caption:'',images:[],timing,scheduledFor,reason:'No upcoming live event with a publishable image is available, so the day is skipped rather than publishing stale content.'};
 }
 const choice=await choosePillar(event,revision);
 return {event,pillar:choice.pillar,caption:draftCaption(event,choice.pillar,dateKey,revision),images,timing,scheduledFor,reason:choice.reason+' Timing: '+timing.rationale};
}
async function ensureDailyDraft(force=false){
 const settings=await automationSettings();if(!settings.daily_instagram_enabled||!connection().instagram)return null;
 const now=kstNow(),due=timeMinutes(String(settings.draft_generation_time_kst||'10:00'));
 if(!force&&now.hour*60+now.minute<due)return null;
 const {data:existing,error:existingError}=await service.from('instagram_post_drafts').select('*').eq('draft_date',now.date).maybeSingle();
 if(existingError)throw existingError;if(existing)return existing;
 const built=await buildDraft(now.date,now.dow,1);
 const base={
  draft_date:now.date,event_id:built.event?.id??null,content_pillar:built.pillar,caption:built.caption,cta:'See event details',
  destination_url:built.event?'https://roundy.team/events/'+built.event.slug:'https://roundy.team/events',images:built.images,
  generation_reason:built.reason,recommended_time_kst:built.timing.recommended,window_start_kst:built.timing.windowStart,
  window_end_kst:built.timing.windowEnd,scheduled_for:built.scheduledFor,revision:1
 };
 const {data,error}=await service.from('instagram_post_drafts').insert({...base,status:built.event&&built.images.length?'needs_approval':'skipped'}).select('*').single();
 if(error)throw error;return data;
}
async function regenerateDraft(draftId:string){
 const {data:current,error:currentError}=await service.from('instagram_post_drafts').select('*').eq('id',draftId).single();
 if(currentError||!current)throw currentError??new Error('Draft not found');
 if(current.status!=='needs_approval')throw new Error('Only a draft waiting for approval can be regenerated.');
 const local=kstNow(new Date(String(current.draft_date)+'T12:00:00+09:00')),revision=Number(current.revision||1)+1;
 const built=await buildDraft(String(current.draft_date),local.dow,revision);
 const {data,error}=await service.from('instagram_post_drafts').update({
  event_id:built.event?.id??null,content_pillar:built.pillar,caption:built.caption,images:built.images,
  destination_url:built.event?'https://roundy.team/events/'+built.event.slug:'https://roundy.team/events',
  generation_reason:built.reason,recommended_time_kst:built.timing.recommended,window_start_kst:built.timing.windowStart,
  window_end_kst:built.timing.windowEnd,scheduled_for:built.scheduledFor,revision,status:built.event&&built.images.length?'needs_approval':'skipped'
 }).eq('id',draftId).select('*').single();
 if(error)throw error;return data;
}
const insightMetric=(data:any,name:string)=>{
 const item=Array.isArray(data?.data)?data.data.find((entry:any)=>entry?.name===name):null;
 const value=item?.value??item?.values?.[0]?.value??item?.total_value?.value;
 return Number.isFinite(Number(value))?Number(value):null;
};
async function mediaPerformance(mediaId:string){
 const basic=await graph(mediaId+'?fields=like_count,comments_count').catch(()=>({}));
 const attempts=['views,reach,likes,comments,saved,shares,total_interactions','reach,likes,comments,saved,shares,total_interactions'];
 let rich:any=null;
 for(const metric of attempts){rich=await graph(mediaId+'/insights?metric='+metric).catch(()=>null);if(rich)break;}
 const likes=insightMetric(rich,'likes')??Number(basic.like_count??0);
 const comments=insightMetric(rich,'comments')??Number(basic.comments_count??0);
 const saves=insightMetric(rich,'saved')??0,shares=insightMetric(rich,'shares')??0;
 const reach=insightMetric(rich,'reach'),views=insightMetric(rich,'views'),total=insightMetric(rich,'total_interactions')??(likes+comments+saves+shares);
 const denominator=Math.max(1,reach??views??(likes+comments+1));
 const score=((likes+comments*2+saves*3+shares*4)/denominator)*1000+Math.log10(denominator+1)*10;
 return {source:rich?'insights':'basic',views,reach,likes,comments,saves,shares,total_interactions:total,performance_score:Number(score.toFixed(4))};
}
async function captureDueInsights(){
 const since=new Date(Date.now()-4*86400000).toISOString();
 const {data:runs,error}=await service.from('marketing_runs').select('id,external_id,finished_at,snapshot').eq('channel','instagram').eq('status','sent').not('external_id','is',null).gte('finished_at',since).order('finished_at',{ascending:true}).limit(30);
 if(error)throw error;if(!runs?.length)return false;
 const ids=runs.map(run=>run.id);
 const {data:existing,error:existingError}=await service.from('instagram_post_insights').select('run_id,horizon_hours').in('run_id',ids);
 if(existingError)throw existingError;
 const seen=new Set((existing??[]).map(row=>row.run_id+':'+row.horizon_hours));let changed=false;
 for(const run of runs){
  const finished=new Date(run.finished_at).getTime(),age=(Date.now()-finished)/3600000;
  const due:number[]=[];if(age>=24&&age<60&&!seen.has(run.id+':24'))due.push(24);if(age>=72&&!seen.has(run.id+':72'))due.push(72);
  if(!due.length)continue;
  const performance=await mediaPerformance(String(run.external_id));
  const published=kstNow(new Date(run.finished_at)),minute=published.hour*60+published.minute;
  for(const horizon of due){
   const {error:insertError}=await service.from('instagram_post_insights').upsert({
    run_id:run.id,horizon_hours:horizon,source:performance.source,published_dow:published.dow,published_minute:minute,
    views:performance.views,reach:performance.reach,likes:performance.likes,comments:performance.comments,saves:performance.saves,
    shares:performance.shares,total_interactions:performance.total_interactions,performance_score:performance.performance_score
   },{onConflict:'run_id,horizon_hours'});
   if(insertError)throw insertError;changed=true;
  }
 }
 return changed;
}
const candidateMinutes=[750,1080,1140,1200,1260];
const preferredByDow=[1260,1140,1140,1080,750,1260,1260];
const nearestCandidate=(minute:number)=>candidateMinutes.reduce((best,item)=>Math.abs(item-minute)<Math.abs(best-minute)?item:best,candidateMinutes[0]);
const average=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
async function refreshTimeRecommendations(){
 const {data:insights,error}=await service.from('instagram_post_insights').select('run_id,horizon_hours,published_dow,published_minute,performance_score').order('horizon_hours',{ascending:false});
 if(error)throw error;
 const best=new Map<string,any>();for(const row of insights??[])if(!best.has(row.run_id))best.set(row.run_id,row);
 const runIds=[...best.keys()];let eligible=new Set<string>();
 if(runIds.length){
  const {data:runs,error:runError}=await service.from('marketing_runs').select('id,snapshot').in('id',runIds);
  if(runError)throw runError;
  eligible=new Set((runs??[]).filter(run=>(run.snapshot as any)?.eligible_for_optimization!==false).map(run=>run.id));
 }
 const rows=[...best.values()].filter(row=>eligible.has(row.run_id));const total=rows.length;
 const global=new Map<number,number[]>(),day=new Map<string,number[]>();
 for(const row of rows){
  const slot=nearestCandidate(Number(row.published_minute)),score=Number(row.performance_score||0);
  global.set(slot,[...(global.get(slot)??[]),score]);const key=row.published_dow+':'+slot;day.set(key,[...(day.get(key)??[]),score]);
 }
 const globalMeans=candidateMinutes.map(slot=>average(global.get(slot)??[])),globalMax=Math.max(1,...globalMeans);
 const dataWeight=Math.min(.65,total/30*.65),priorWeight=1-dataWeight;
 const updates=[];
 for(let dow=0;dow<7;dow++){
  const dayMeans=candidateMinutes.map(slot=>average(day.get(dow+':'+slot)??[])),dayMax=Math.max(1,...dayMeans);let bestSlot=candidateMinutes[0],bestScore=-1;
  for(const slot of candidateMinutes){
   const distance=Math.abs(slot-preferredByDow[dow]),prior=slot===preferredByDow[dow]?1:distance<=60?.75:distance<=180?.5:.3;
   const globalNorm=globalMeans[candidateMinutes.indexOf(slot)]/globalMax;
   const dayNorm=dayMeans[candidateMinutes.indexOf(slot)]/dayMax;
   const n=(global.get(slot)??[]).length,explore=n<2?.04:0;
   const score=priorWeight*prior+dataWeight*(.7*globalNorm+.3*(dayNorm||globalNorm))+explore;
   if(score>bestScore){bestScore=score;bestSlot=slot;}
  }
  const source=total>=20?'learned':total>=5?'benchmark+learning':'benchmark';
  updates.push({
   dow,recommended_time_kst:minutesTime(bestSlot),window_start_kst:minutesTime(bestSlot-30),window_end_kst:minutesTime(bestSlot+30),
   sample_size:total,score:Number(bestScore.toFixed(4)),source,
   rationale:source==='benchmark'?'Using the initial benchmark while Roundy gathers enough post performance data.':'Blends the initial benchmark with Roundy reach and weighted engagement from '+total+' measured posts. Saves and shares receive the most weight.',
   updated_at:new Date().toISOString()
  });
 }
 const {error:updateError}=await service.from('instagram_posting_time_recommendations').upsert(updates,{onConflict:'dow'});
 if(updateError)throw updateError;
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
   if(body.action==='regenerate_draft'){
    if(!/^[0-9a-f-]{36}$/i.test(body.draft_id))return json({error:'Invalid draft'},400);
    return json({draft:await regenerateDraft(body.draft_id)});
   }
   if(body.action==='generate_draft_now'){
    return json({draft:await ensureDailyDraft(true)});
   }
   const {data:template,error}=await adminClient.from('marketing_templates').select('*').eq('id',body.template_id).single();if(error||!template)return json({error:'Template not found'},404);validate(template);const result=await adminClient.rpc('enqueue_marketing',{p_template:body.template_id,p_request_key:body.request_key});if(result.error)throw result.error;
  }
  if(schedulerKey){
   await ensureDailyDraft();
   const insightsChanged=await captureDueInsights();
   if(insightsChanged)await refreshTimeRecommendations();
  }
  const {data:runs,error}=await service.rpc('claim_marketing');if(error)throw error;
  const results=[];
  for(const run of runs??[]){
   let externalAttempt=false;let outcome:Record<string,unknown>;const t=run.snapshot as Template;
   try{
    validate(t);
    if(t.channel==='koreapas'&&await hasAdvertOnGopasFirstPage(t.title))outcome={status:'skipped',message:'A post with this title is already on the first Koreapas page.'};
    else if(t.channel==='instagram'){const result=await publishInstagram(t,()=>{externalAttempt=true;});outcome={status:'sent',message:'Published to @roundy.meet',...result};}
    else {const html='<p>'+escapeHtml(t.caption).replace(/\n/g,'<br>')+'</p>'+t.images.map(image=>'<p><img src="'+escapeHtml(image)+'" alt="Roundy event"></p>').join('')+(t.destination_url?'<p><a href="'+escapeHtml(t.destination_url)+'">'+escapeHtml(t.cta||t.destination_url)+'</a></p>':'');externalAttempt=true;const external_url=await publishToKoreapas(t.title,html);outcome={status:'sent',message:'Published to Koreapas',external_url};}
   }catch(error){outcome={status:externalAttempt?'needs_review':'failed',message:(error instanceof Error?error.message:'Publishing failed').slice(0,500)};}
   const finishedAt=new Date().toISOString();
   const {error:updateError}=await service.from('marketing_runs').update({...outcome,finished_at:finishedAt}).eq('id',run.id).eq('status','publishing');if(updateError)throw updateError;
   if(t.draft_id){
    const draftUpdate:Record<string,unknown>={marketing_run_id:run.id};
    if(outcome.status==='sent')Object.assign(draftUpdate,{status:'published',published_at:finishedAt});
    else if(outcome.status==='failed')draftUpdate.status='failed';
    const {error:draftError}=await service.from('instagram_post_drafts').update(draftUpdate).eq('id',t.draft_id);if(draftError)throw draftError;
   }
   results.push({id:run.id,...outcome});
  }
  return json({ok:true,runs:results});
 }catch(error){return json({error:error instanceof Error?error.message:'Marketing request failed'},400);}
});
