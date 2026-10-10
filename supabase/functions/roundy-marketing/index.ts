import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
import { hasAdvertOnGopasFirstPage, publishToKoreapas } from './koreapas.ts';

const url=Deno.env.get('SUPABASE_URL')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const token=()=>Deno.env.get('INSTAGRAM_ACCESS_TOKEN');
const userId=()=>Deno.env.get('INSTAGRAM_USER_ID');
const apiVersion=()=>Deno.env.get('INSTAGRAM_API_VERSION')||'v25.0';
const connection=()=>({instagram:Boolean(token()&&userId()),koreapas:Boolean(Deno.env.get('KOREAPAS_USER_ID')&&Deno.env.get('KOREAPAS_PASSWORD'))});
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

type Template={channel:'instagram'|'koreapas';title:string;caption:string;cta:string;destination_url:string;images:string[];name?:string;draft_id?:string;eligible_for_optimization?:boolean;content_pillar?:string;media_kind?:string;reel_id?:string;reel_revision?:number;video_storage_path?:string;video_duration_seconds?:number;manual_reviewed?:boolean};
type EventRow={
 id:string;slug:string;title:string;starts_at:string;venue:string;neighborhood:string;
 age_min:number;age_max:number;capacity:number;seats_remaining:number;images:string[];
 price_gents:number;price_ladies:number;
};
type InboxRow={id:string;external_id:string;kind:'comment'|'dm';sender_id:string;status:string};
type GrowthTopic='mbti'|'dating_archetype'|'book_insight'|'trend_research'|'meme_remix'|'dating_myth'|'conversation_prompt'|'seoul_dating'|'mini_quiz';
type AutomationSettings={daily_instagram_enabled:boolean;daily_time_kst:string;draft_generation_time_kst:string;optimization_enabled:boolean;content_mode:'prelaunch'|'live_event';growth_carousel_enabled:boolean;growth_posts_per_week:number;growth_days:number[]};
type DraftRow={id:string;draft_date:string;event_id:string|null;content_mode:'prelaunch'|'live_event';draft_kind:'brand'|'growth_carousel';growth_topic_type:GrowthTopic|null;content_pillar:'event'|'urgency'|'problem'|'concept'|'seoul'|'trust';caption:string;cta:string;destination_url:string;images:string[];status:string;recommended_time_kst:string;window_start_kst:string;window_end_kst:string;scheduled_for:string|null;revision:number;eligible_for_optimization:boolean};
type Recommendation={dow:number;recommended_time_kst:string;window_start_kst:string;window_end_kst:string;sample_size:number;score:number;source:string;rationale:string};
type ParticipantTeaser={birth_year:number;job_category:string};
type FeedbackSummary={responses:number;overall:number;connection:number;return_score:number;recommend:number;event_title:string};
type LiveMarketingType='event_intro'|'recruitment_gap'|'countdown'|'almost_full'|'participant_teaser'|'feedback';
type LiveEventSnapshot={days_left:number;total:number;gents:number;ladies:number;capacity:number;fill_rate:number;imbalance:number;target_gender:'male'|'female'|null;recruit_count:number;participant_teasers:ParticipantTeaser[];feedback:FeedbackSummary|null};

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
async function publishInstagram(t:Template,beforePublish:()=>void,beforeFirstExternalPost:()=>Promise<void>){
 const account=await graph('me?fields=user_id,username');
 if(account.username?.toLowerCase()!=='roundy.meet'||String(account.user_id)!==userId())throw new Error('Instagram credentials must belong to @roundy.meet');
 const caption=[t.caption,[t.cta,t.destination_url].filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
 if(caption.length>2200)throw new Error('Instagram caption including the link exceeds 2,200 characters');
 // Reserve external-side-effect evidence in Postgres BEFORE the first Meta POST.
 // No request can be auto-retried if Meta's response is missing or uncertain.
 await beforeFirstExternalPost();
 let container:string;
 if(t.images.length===1)container=(await graph(userId()+'/media',{image_url:t.images[0],caption})).id;
 else {const children:string[]=[];for(const image of t.images){const child=await graph(userId()+'/media',{image_url:image,is_carousel_item:'true'});await ready(child.id);children.push(child.id);}container=(await graph(userId()+'/media',{media_type:'CAROUSEL',children:children.join(','),caption})).id;}
 await ready(container);beforePublish();const post=await graph(userId()+'/media_publish',{creation_id:container});
 const details=await graph(post.id+'?fields=permalink').catch(()=>({}));return {external_id:post.id,external_url:details.permalink??'https://www.instagram.com/roundy.meet/'};
}
class ReelProcessingPending extends Error{
 constructor(){super('REEL_VIDEO_PROCESSING');}
}
async function waitForReelContainer(id:string){
 // Meta video transcodes asynchronously. A pending container is persisted and
 // retried by the regular queue, not recreated or prematurely published.
 for(let n=0;n<6;n++){
  const status=await graph(id+'?fields=status_code');
  if(status.status_code==='FINISHED')return true;
  if(['ERROR','EXPIRED','FAILED'].includes(String(status.status_code)))throw new Error('REEL_META_PROCESSING_FAILED');
  await new Promise(resolve=>setTimeout(resolve,1800));
 }
 return false;
}
async function publishReel(t:Template,runId:string,beforePublish:()=>void){
 const account=await graph('me?fields=user_id,username');
 if(account.username?.toLowerCase()!=='roundy.meet'||String(account.user_id)!==userId())throw new Error('REEL_INSTAGRAM_ACCOUNT_MISMATCH');
 if(!t.reel_id||!t.video_storage_path||!t.reel_revision)throw new Error('REEL_SNAPSHOT_INVALID');
 const {data:draft,error:readError}=await service.from('instagram_reel_drafts')
  .select('id,status,approved_revision,marketing_run_id,video_storage_path,caption,rights_attested')
  .eq('id',t.reel_id).single();
 if(readError||!draft||draft.status!=='queued'||draft.rights_attested!==true||
   Number(draft.approved_revision)!==Number(t.reel_revision)||draft.marketing_run_id!==runId||
   draft.video_storage_path!==t.video_storage_path||draft.caption!==t.caption)
  throw new Error('REEL_APPROVED_SNAPSHOT_CHANGED');
 const validPath=new RegExp('^'+t.reel_id+'/[0-9a-f-]{36}[.]mp4$','i').test(t.video_storage_path);
 if(!validPath)throw new Error('REEL_VIDEO_PATH_INVALID');
 const {data:saved,error:savedError}=await service.from('instagram_reel_publish_attempts')
  .select('creation_id,stage').eq('run_id',runId).maybeSingle();
 if(savedError)throw savedError;
 if(saved&&['publishing','sent'].includes(saved.stage)){
  beforePublish();
  throw new Error('REEL_MEDIA_PUBLISH_ALREADY_ATTEMPTED_REVIEW_REQUIRED');
 }
 let creationId=String(saved?.creation_id||'');
 if(!creationId){
  const signed=await service.storage.from('marketing-reels').createSignedUrl(t.video_storage_path,3600);
  if(signed.error||!signed.data?.signedUrl)throw new Error('REEL_SIGNED_VIDEO_NOT_AVAILABLE');
  // Only a temporary read URL is sent to Meta. The original video remains in private storage.
  const container=await graph(userId()+'/media',{media_type:'REELS',video_url:signed.data.signedUrl,
   caption:t.caption,share_to_feed:'true'});
  creationId=String(container?.id||'');
  if(!creationId)throw new Error('REEL_META_CONTAINER_MISSING');
  const {error:attemptError}=await service.from('instagram_reel_publish_attempts')
   .insert({run_id:runId,reel_id:t.reel_id,creation_id:creationId,stage:'container_created'});
  if(attemptError)throw attemptError;
 }
 const readyForPublishing=await waitForReelContainer(creationId);
 if(!readyForPublishing){
  const {error:progressError}=await service.from('instagram_reel_publish_attempts')
   .update({stage:'awaiting_ready',updated_at:new Date().toISOString()}).eq('run_id',runId);
  if(progressError)throw progressError;
  throw new ReelProcessingPending();
 }
 const {error:publishingError}=await service.from('instagram_reel_publish_attempts')
  .update({stage:'publishing',updated_at:new Date().toISOString()})
  .eq('run_id',runId).in('stage',['container_created','awaiting_ready']);
 if(publishingError)throw publishingError;
 // From this point, an unknown Meta response might represent a successful
 // publish. Any exception must be marked needs_review; NEVER auto-retry.
 beforePublish();
 const post=await graph(userId()+'/media_publish',{creation_id:creationId});
 const id=String(post?.id||'');
 if(!id)throw new Error('REEL_META_PUBLISH_ID_MISSING');
 const {error:sentError}=await service.from('instagram_reel_publish_attempts')
  .update({stage:'sent',updated_at:new Date().toISOString()}).eq('run_id',runId);
 if(sentError)throw sentError;
 const details=await graph(id+'?fields=permalink').catch(()=>({}));
 return {external_id:id,external_url:details.permalink||'https://www.instagram.com/roundy.meet/'};
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
 if(t.media_kind==='reel'){
  if(t.channel!=='instagram'||t.manual_reviewed!==true||!t.reel_id||!t.video_storage_path||
     !Number.isInteger(t.reel_revision)||t.caption.length>2000)
   throw new Error('INVALID_APPROVED_REEL_SNAPSHOT');
 }else if(!Array.isArray(t.images)||t.images.length>10||
  t.images.some(image=>!image.startsWith(url+'/storage/v1/object/public/wis-event-images/')||
   !/^[-a-f0-9]+\/[-a-f0-9]+\.jpg$/.test(image.split('/wis-event-images/')[1]??'')))
  throw new Error('Use uploaded JPEG marketing images');
 if(t.channel==='instagram'&&t.media_kind!=='reel'&&!t.images.length)throw new Error('Instagram needs at least one image');
 if(t.channel==='koreapas'&&!t.title?.trim())throw new Error('Add a Koreapas title');
 if(!connection()[t.channel])throw new Error('Channel is not connected');
}

// Final fail-closed check before creating Instagram media containers.
// A scheduled draft may have had its approved asset revoked after scheduling.
async function validateReviewedStockDraft(t:Template){
 if(t.channel!=='instagram'||t.media_kind==='reel'||!t.draft_id)return;
 const {data:draft,error:draftError}=await service.from('instagram_post_drafts')
  .select('id,visual_source,images,approved_at,approved_by,caption').eq('id',t.draft_id).single();
 if(draftError||!draft)throw new Error('MARKETING_DRAFT_NOT_FOUND');
 if(!['pexels','stock'].includes(draft.visual_source))return;
 if(!draft.approved_at||!draft.approved_by)throw new Error('STOCK_DRAFT_APPROVAL_REQUIRED');
 const {data:rows,error}=await service.from('marketing_draft_photos')
  .select('asset_id,marketing_photo_assets(provider,review_status,storage_path,reviewed_at,reviewed_by,license_checked_at,license_name,license_url,license_evidence_url,source_url,commercial_use_allowed,modifications_allowed,attribution_required,photographer)')
  .eq('draft_id',t.draft_id);
 if(error||!rows||rows.length<2||rows.length>3)throw new Error('STOCK_PHOTO_REVIEW_REQUIRED');
 for(const row of rows as Record<string,any>[]){
  const p=Array.isArray(row.marketing_photo_assets)?row.marketing_photo_assets[0]:row.marketing_photo_assets;
  if(!p||p.review_status!=='approved'||!p.storage_path||!p.reviewed_by||!p.reviewed_at||
   !p.license_checked_at||!p.source_url||!p.license_evidence_url||
   p.commercial_use_allowed!==true||p.modifications_allowed!==true)
   throw new Error('STOCK_PHOTO_RIGHTS_OR_APPROVAL_REQUIRED');
  const licensing:Record<string,Array<string>>={
   pexels:['Pexels License','https://www.pexels.com/license/'],
   unsplash:['Unsplash License','https://unsplash.com/license'],
   pixabay:['Pixabay Content License','https://pixabay.com/service/license-summary/']
  };
  const free=['wikimedia','openverse'].includes(p.provider)&&(
   (p.license_name==='CC0 1.0'&&p.license_url==='https://creativecommons.org/publicdomain/zero/1.0/')||
   (p.license_name==='Public Domain Mark 1.0'&&p.license_url==='https://creativecommons.org/publicdomain/mark/1.0/')||
   (p.license_name==='CC BY 4.0'&&p.license_url==='https://creativecommons.org/licenses/by/4.0/'));
  if(!free&&(!licensing[p.provider]||p.license_name!==licensing[p.provider][0]||
   p.license_url!==licensing[p.provider][1]))throw new Error('STOCK_LICENSE_UNSUPPORTED');
  if(p.attribution_required===true&&(
   !String(t.caption||'').includes(String(p.photographer))||
   !String(t.caption||'').includes(String(p.source_url))||
   !String(t.caption||'').includes(String(p.license_url))||
   !String(t.caption||'').includes('(cropped and text overlaid)')))
    throw new Error('STOCK_REQUIRED_ATTRIBUTION_MISSING');
 }
 if(JSON.stringify(draft.images)!==JSON.stringify(t.images))throw new Error('STOCK_RENDER_CHANGED_AFTER_APPROVAL');
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
 const {data,error}=await service.from('marketing_automation_settings').select('daily_instagram_enabled,daily_time_kst,draft_generation_time_kst,optimization_enabled,content_mode,growth_carousel_enabled,growth_posts_per_week,growth_days').eq('singleton',true).single();
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
function prelaunchCaption(pillar:'problem'|'concept'|'seoul'|'trust',dateKey:string,revision:number){
 const hooks:Record<typeof pillar,Array<[string,string]>>={
  problem:[
   ['Dating apps show profiles. Chemistry still happens face to face.','데이트 앱은 프로필을 보여주지만, 케미는 결국 직접 만나야 알 수 있으니까요.'],
   ['Less swiping. More real conversation.','스와이프는 줄이고, 실제 대화는 늘리고.']
  ],
  concept:[
   ['One person at a time. One real conversation at a time.','한 번에 한 사람씩, 실제 대화를 나누는 방식.'],
   ['Meet first. Reconnect only when it is mutual.','먼저 직접 만나고, 서로 원할 때만 다시 연결됩니다.']
  ],
  seoul:[
   ['A new way to meet people in Seoul is coming.','서울에서 사람을 만나는 새로운 방식이 곧 시작됩니다.'],
   ['Seoul is full of people you would never meet through your usual circle.','평소 생활 반경에서는 만나지 못했을 사람들을 서울에서 직접 만나보세요.']
  ],
  trust:[
   ['Roundy is being built for better first conversations, not longer swiping sessions.','Roundy는 더 오래 스와이프하게 만드는 대신, 더 좋은 첫 대화를 만들기 위해 준비하고 있습니다.'],
   ['We are building the room before we ask you to enter it.','사람을 모으기 전에, 먼저 좋은 만남이 가능한 공간과 방식을 준비하고 있습니다.']
  ]
 };
 const bodies:Record<typeof pillar,[string,string]>={
  problem:['Roundy is preparing an offline 1:1 rotation dating experience in Seoul for Korean and international people who would rather meet than endlessly message.','Roundy는 끝없는 채팅보다 직접 만남을 원하는 한국인과 외국인을 위해 서울에서 오프라인 1:1 로테이션 소개팅을 준비하고 있습니다.'],
  concept:['Short face-to-face conversations, private choices, and reconnection only when the feeling is mutual. That is the experience Roundy is building.','짧은 대면 1:1 대화, 비공개 선택, 그리고 서로 마음이 맞을 때만 다시 연결되는 방식. Roundy가 준비하는 만남입니다.'],
  seoul:['Roundy is preparing a Seoul-based offline mingle where Korean and international participants can meet one person at a time in real life.','Roundy는 서울에서 한국인과 외국인이 한 명씩 직접 대화하며 만날 수 있는 오프라인 밍글을 준비하고 있습니다.'],
  trust:['Roundy is still pre-launch. We are focusing on the format, hosting flow, safety and the quality of real conversations before opening officially.','Roundy는 아직 정식 오픈 전입니다. 공식 오픈에 앞서 진행 방식, 운영 동선, 안전, 실제 대화의 질을 먼저 다듬고 있습니다.']
 };
 const options=hooks[pillar],hook=options[hashText(dateKey+String(revision)+pillar)%options.length];
 return [
  hook[0],'',bodies[pillar][0],'',
  'Follow @roundy.meet and visit roundy.team for launch updates.','','---','',
  hook[1],'',bodies[pillar][1],'',
  '정식 오픈 소식은 @roundy.meet 과 roundy.team 에서 가장 먼저 확인하세요.','',
  '#Roundy #SeoulDating #MeetInSeoul #서울소개팅 #로테이션소개팅'
 ].join('\n');
}
async function choosePrelaunchPillar(revision:number){
 const {data,error}=await service.from('instagram_post_drafts').select('content_pillar').eq('content_mode','prelaunch').in('status',['needs_approval','scheduled','published']).order('draft_date',{ascending:false}).limit(7);
 if(error)throw error;
 const recent=(data??[]).map(row=>String(row.content_pillar));
 const candidates=['problem','concept','seoul','trust'] as const;
 const ranked=[...candidates].sort((a,b)=>{
  const ac=recent.filter(item=>item===a).length+(recent[0]===a?2:0);
  const bc=recent.filter(item=>item===b).length+(recent[0]===b?2:0);
  if(ac!==bc)return ac-bc;
  return (hashText(a+String(revision))%17)-(hashText(b+String(revision))%17);
 });
 return ranked[0];
}
function growthDays(settings:AutomationSettings){
 return (Array.isArray(settings.growth_days)?settings.growth_days:[]).slice(0,Math.max(0,Math.min(7,Number(settings.growth_posts_per_week||0))));
}
function isGrowthDay(settings:AutomationSettings,dow:number){
 return settings.growth_carousel_enabled===true&&growthDays(settings).includes(dow);
}
function growthTopicFor(dateKey:string,dow:number,settings:AutomationSettings):GrowthTopic{
 const week=Math.floor(new Date(dateKey+'T12:00:00Z').getTime()/604800000);
 const slot=Math.max(0,growthDays(settings).indexOf(dow));
 const families:GrowthTopic[][]=[
  ['mbti','dating_archetype','mini_quiz'],
  ['book_insight','conversation_prompt','dating_myth'],
  ['trend_research','meme_remix','seoul_dating']
 ];
 const family=families[slot%families.length];
 return family[week%family.length];
}
function growthTopicLabel(topic:GrowthTopic){
 const labels:Record<GrowthTopic,string>={
  mbti:'MBTI dating archetypes',dating_archetype:'dating archetypes',book_insight:'book insight',
  trend_research:'current relationship research',meme_remix:'current meme remix',dating_myth:'dating myth',
  conversation_prompt:'first-conversation prompts',seoul_dating:'Seoul dating culture',mini_quiz:'dating mini quiz'
 };
 return labels[topic];
}
function broadJobCategory(profile:Record<string,unknown>){
 const workplace=String(profile.public_workplace??'').toLowerCase(),job=String(profile.public_job??'').toLowerCase();
 const combined=workplace+' '+job;
 if(/freelance/.test(combined))return '프리랜서';
 if(/self.?employ|business owner|entrepreneur/.test(combined))return '자영업';
 if(/government|public organization|public corporation|public institution/.test(combined))return '공공기관/공기업';
 if(/student|university/.test(combined))return '학생';
 if(/education|research|academic/.test(combined))return '교육/연구';
 if(/medical|health|hospital|doctor|nurse/.test(combined))return '의료/보건';
 if(/startup/.test(combined))return '스타트업';
 if(workplace)return '회사원';
 if(job)return '전문직';
 return '직장인';
}
async function reviewedFeedbackSummary(){
 const {data:reports,error}=await service.from('reports').select('id,feedback_event_id,survey,created_at').eq('kind','feedback').not('survey','is',null).order('created_at',{ascending:false}).limit(100);
 if(error)throw error;if(!reports?.length)return null;
 const ids=reports.map(row=>row.id);
 const {data:reviews,error:reviewsError}=await service.from('report_reviews').select('report_id').in('report_id',ids);
 if(reviewsError)throw reviewsError;const reviewed=new Set((reviews??[]).map(row=>String(row.report_id)));
 const usable=reports.filter(row=>reviewed.has(String(row.id))&&row.feedback_event_id&&row.survey&&typeof row.survey==='object');
 const grouped=new Map<string,typeof usable>();
 for(const row of usable){const key=String(row.feedback_event_id);grouped.set(key,[...(grouped.get(key)??[]),row]);}
 const eventIds=[...grouped.keys()];if(!eventIds.length)return null;
 const {data:events,error:eventError}=await service.from('events').select('id,title,ends_at').in('id',eventIds).lte('ends_at',new Date().toISOString()).order('ends_at',{ascending:false});
 if(eventError)throw eventError;
 for(const event of events??[]){
  const rows=grouped.get(String(event.id))??[];if(rows.length<3)continue;
  const score=(key:string)=>rows.reduce((sum,row)=>sum+Number((row.survey as Record<string,unknown>)[key]??0),0)/rows.length;
  return {responses:rows.length,overall:score('overall'),connection:score('connection'),return_score:score('return'),recommend:score('recommend'),event_title:String(event.title)} as FeedbackSummary;
 }
 return null;
}
async function liveEventSnapshot(event:EventRow,dateKey:string){
 const {data:orders,error:ordersError}=await service.from('event_payment_orders').select('user_id,gender').eq('event_id',event.id).eq('status','completed');
 if(ordersError)throw ordersError;
 const byUser=new Map<string,{user_id:string;gender:string}>();for(const row of orders??[])byUser.set(String(row.user_id),{user_id:String(row.user_id),gender:String(row.gender)});
 const paid=[...byUser.values()],gents=paid.filter(row=>row.gender==='male').length,ladies=paid.filter(row=>row.gender==='female').length,total=paid.length;
 let participant_teasers:ParticipantTeaser[]=[];
 if(total>=4){
  const userIds=paid.map(row=>row.user_id);
  const {data:profiles,error:profileError}=await service.from('profiles').select('user_id,profile').in('user_id',userIds);
  if(profileError)throw profileError;
  participant_teasers=(profiles??[]).map(row=>{const profile=(row.profile&&typeof row.profile==='object'?row.profile:{}) as Record<string,unknown>;const year=Number(String(profile.birth_date??'').slice(0,4));return {key:hashText(dateKey+String(row.user_id)),birth_year:year,job_category:broadJobCategory(profile)};}).filter(row=>Number.isInteger(row.birth_year)&&row.birth_year>=1950&&row.birth_year<=2010).sort((a,b)=>a.key-b.key).slice(0,6).map(({birth_year,job_category})=>({birth_year,job_category}));
 }
 const days_left=Math.max(0,Math.ceil((new Date(event.starts_at).getTime()-Date.now())/86400000));
 const imbalance=Math.abs(gents-ladies),target_gender=gents<ladies?'male':ladies<gents?'female':null;
 return {days_left,total,gents,ladies,capacity:event.capacity,fill_rate:event.capacity?total/event.capacity:0,imbalance,target_gender,recruit_count:imbalance,participant_teasers,feedback:await reviewedFeedbackSummary()} as LiveEventSnapshot;
}
async function recentLiveMarketingTypes(){
 const {data,error}=await service.from('instagram_post_drafts').select('generation_reason').eq('content_mode','live_event').order('draft_date',{ascending:false}).limit(7);
 if(error)throw error;const result:string[]=[];
 for(const row of data??[]){const match=String(row.generation_reason??'').match(/^Live monitor: ([a-z_]+)/);if(match)result.push(match[1]);}
 return result;
}
function chooseLiveMarketingType(snapshot:LiveEventSnapshot,recent:string[]):LiveMarketingType{
 const seatsLeft=Math.max(0,snapshot.capacity-snapshot.total);
 if(snapshot.fill_rate>=.7&&seatsLeft>0)return 'almost_full';
 if(snapshot.days_left<=1)return 'countdown';
 if(snapshot.imbalance>=2&&snapshot.total>=4)return 'recruitment_gap';
 if(snapshot.days_left<=7)return 'countdown';
 if(snapshot.participant_teasers.length>=4&&!recent.includes('participant_teaser'))return 'participant_teaser';
 if(snapshot.feedback&&!recent.includes('feedback'))return 'feedback';
 if(snapshot.imbalance>=2)return 'recruitment_gap';
 if(snapshot.feedback&&!recent.includes('feedback'))return 'feedback';
 return 'event_intro';
}
function liveParticipantLines(snapshot:LiveEventSnapshot){return snapshot.participant_teasers.map(item=>String(item.birth_year)+'년생 / '+item.job_category);}
function liveEventSlides(event:EventRow,snapshot:LiveEventSnapshot,type:LiveMarketingType){
 const d=eventDetails(event),lines=liveParticipantLines(snapshot),genderKo=snapshot.target_gender==='male'?'남성':'여성',slides:Array<Record<string,string>>=[];
 const count='현재 '+snapshot.total+'/'+snapshot.capacity+'명 · 남성 '+snapshot.gents+' / 여성 '+snapshot.ladies;
 if(type==='recruitment_gap')slides.push({eyebrow:'ROUNDY RECRUITING',title:genderKo+' '+snapshot.recruit_count+'명 더 모집해요',body:'D-'+snapshot.days_left+' · '+count,source_label:'실시간 결제 완료 기준',variant:'hook'});
 else if(type==='countdown')slides.push({eyebrow:'ROUNDY D-'+snapshot.days_left,title:'이제 '+snapshot.days_left+'일 남았습니다',body:count,source_label:'실시간 결제 완료 기준',variant:'hook'});
 else if(type==='almost_full')slides.push({eyebrow:'ROUNDY UPDATE',title:'현재 '+snapshot.total+'/'+snapshot.capacity+'명 참여 확정',body:'자리가 얼마 남지 않았어요 · D-'+snapshot.days_left,source_label:'실시간 결제 완료 기준',variant:'hook'});
 else if(type==='participant_teaser')slides.push({eyebrow:'WHO IS JOINING?',title:'현재 이런 분들이 함께해요',body:count+' · D-'+snapshot.days_left,source_label:'이름·회사명·직무명 비공개',variant:'hook'});
 else if(type==='feedback')slides.push({eyebrow:'ROUNDY FEEDBACK',title:'지난 모임 참가자들의 평가',body:snapshot.feedback?String(snapshot.feedback.responses)+'명 응답 기준':'검토 완료 후기 기준',source_label:'개별 후기는 공개하지 않고 평균만 사용',variant:'hook'});
 else slides.push({eyebrow:'ROUNDY '+d.koDate,title:event.title,body:'D-'+snapshot.days_left+' · '+count,source_label:event.neighborhood,variant:'hook'});
 if(lines.length)slides.push({eyebrow:'CURRENT LINEUP',title:'익명 참가자 미리보기',body:lines.join('  ·  '),source_label:'결제 완료 4명 이상일 때만 표시',variant:'content'});
 if(snapshot.feedback)slides.push({eyebrow:'PAST FEEDBACK',title:'만족도 '+snapshot.feedback.overall.toFixed(1)+'/5',body:'대화 연결감 '+snapshot.feedback.connection.toFixed(1)+' · 재참여 '+snapshot.feedback.return_score.toFixed(1)+' · 추천 '+snapshot.feedback.recommend.toFixed(1),source_label:snapshot.feedback.responses+'명 검토 완료 응답 평균',variant:'source'});
 slides.push({eyebrow:d.koDate+' · '+d.koTime,title:event.venue,body:'1:1로 한 명씩 직접 만나고, 서로 다시 만나고 싶은 경우에만 매칭됩니다.',source_label:'roundy.team/events/'+event.slug,variant:'content'});
 slides.push({eyebrow:'ROUNDY',title:'직접 만나야 알 수 있는 사이',body:'서울에서 진행하는 1:1 로테이션 소개팅. 현재 모집 현황은 roundy.team에서 확인하세요.',source_label:'@roundy.meet',variant:'roundy'});
 return slides.slice(0,6);
}
function liveEventCaption(event:EventRow,snapshot:LiveEventSnapshot,type:LiveMarketingType){
 const d=eventDetails(event),link='https://roundy.team/events/'+event.slug,lines=liveParticipantLines(snapshot),genderKo=snapshot.target_gender==='male'?'남성':'여성';
 let hook='Roundy '+d.koDate+' 모집 중';
 if(type==='recruitment_gap')hook=genderKo+' '+snapshot.recruit_count+'명 더 모집합니다';
 else if(type==='countdown')hook='D-'+snapshot.days_left+' · Roundy가 얼마 남지 않았어요';
 else if(type==='almost_full')hook='현재 '+snapshot.total+'/'+snapshot.capacity+'명 참여 확정';
 else if(type==='participant_teaser')hook='현재 Roundy에는 이런 분들이 함께합니다';
 else if(type==='feedback')hook='지난 Roundy 참가자 피드백';
 const ko=[hook,'','📍 '+event.venue,'🗓 '+d.koDate+' · '+d.koTime,'현재 '+snapshot.total+'/'+snapshot.capacity+'명 · 남성 '+snapshot.gents+' / 여성 '+snapshot.ladies];
 if(lines.length&&(type==='participant_teaser'||type==='recruitment_gap'))ko.push('','현재 참여자 일부','- '+lines.join('\n- '));
 if(snapshot.feedback&&type==='feedback')ko.push('','지난 모임 평균','만족도 '+snapshot.feedback.overall.toFixed(1)+'/5 · 재참여 '+snapshot.feedback.return_score.toFixed(1)+'/5 · 추천 '+snapshot.feedback.recommend.toFixed(1)+'/5','※ 검토 완료된 익명 응답 '+snapshot.feedback.responses+'건의 평균입니다.');
 ko.push('','한 명씩 직접 만나 대화하고, 서로 다시 만나고 싶은 경우에만 연결됩니다.','',link,'','#Roundy #서울소개팅 #로테이션소개팅 #SeoulDating');
 const en=['','---','','Roundy · '+d.enDate+' · '+d.enTime,'Confirmed: '+snapshot.total+'/'+snapshot.capacity+' · Gents '+snapshot.gents+' / Ladies '+snapshot.ladies,'. Meet one person at a time and reconnect only when the interest is mutual.'];
 return ko.concat(en).join('\n');
}
function liveTypeIsUrgent(type:LiveMarketingType){return ['recruitment_gap','countdown','almost_full'].includes(type);}
async function latestPrelaunchImages(){
 const {data,error}=await service.from('instagram_post_drafts').select('images').eq('content_mode','prelaunch').order('updated_at',{ascending:false}).limit(10);
 if(error)return [] as string[];
 const row=(data??[]).find(item=>Array.isArray(item.images)&&item.images.length>0);
 return Array.isArray(row?.images)?row.images.slice(0,1):[];
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
 const settings=await automationSettings(),timing=await recommendationFor(dow,dateKey,settings),scheduledFor=kstIso(dateKey,timing.recommended);
 if(settings.content_mode==='live_event'){
  const event=await nextLiveEvent();
  if(event){
   const snapshot=await liveEventSnapshot(event,dateKey),recent=await recentLiveMarketingTypes(),type=chooseLiveMarketingType(snapshot,recent);
   if(isGrowthDay(settings,dow)&&!liveTypeIsUrgent(type)){
    const topic=growthTopicFor(dateKey,dow,settings);
    return {
     contentMode:'prelaunch' as const,event:null,pillar:'concept' as const,caption:'',images:[],timing,scheduledFor,
     cta:'Follow for launch updates',destinationUrl:'https://roundy.team',draftKind:'growth_carousel' as const,growthTopicType:topic,
     carouselSlides:[],researchSources:[],researchStatus:'pending' as const,
     reason:'Weekly Growth Carousel slot: '+growthTopicLabel(topic)+'. No urgent live-event recruitment condition overrides today\'s growth slot.'
    };
   }
   const images=publishableImages(event);
   return {
    contentMode:'live_event' as const,event,pillar:type==='countdown'||type==='almost_full'||type==='recruitment_gap'?'urgency' as const:'trust' as const,
    caption:liveEventCaption(event,snapshot,type),images,timing,scheduledFor,cta:'See event details',destinationUrl:'https://roundy.team/events/'+event.slug,
    draftKind:'brand' as const,growthTopicType:null,carouselSlides:liveEventSlides(event,snapshot,type),researchSources:[],researchStatus:'not_required' as const,
    reason:'Live monitor: '+type+' · D-'+snapshot.days_left+' · Gents '+snapshot.gents+' / Ladies '+snapshot.ladies+' · '+snapshot.total+'/'+snapshot.capacity+' confirmed. '+(snapshot.target_gender&&snapshot.recruit_count?'Recruit '+(snapshot.target_gender==='male'?'gents':'ladies')+' +'+snapshot.recruit_count+'. ':'')+(snapshot.participant_teasers.length?'Anonymous participant teaser available. ':'')+(snapshot.feedback?'Reviewed feedback aggregate available. ':'')+'Timing: '+timing.rationale
   };
  }
  if(isGrowthDay(settings,dow)){
   const topic=growthTopicFor(dateKey,dow,settings);
   return {contentMode:'prelaunch' as const,event:null,pillar:'concept' as const,caption:'',images:[],timing,scheduledFor,cta:'Follow for launch updates',destinationUrl:'https://roundy.team',draftKind:'growth_carousel' as const,growthTopicType:topic,carouselSlides:[],researchSources:[],researchStatus:'pending' as const,reason:'No upcoming live event exists, so today falls back to the scheduled Growth Carousel slot.'};
  }
  return {contentMode:'live_event' as const,event:null,pillar:'event' as const,caption:'',images:[],timing,scheduledFor,cta:'See event details',destinationUrl:'https://roundy.team/events',draftKind:'brand' as const,growthTopicType:null,carouselSlides:[],researchSources:[],researchStatus:'not_required' as const,reason:'No upcoming live event is available, so the live-event draft is skipped.'};
 }
 if(isGrowthDay(settings,dow)){
  const topic=growthTopicFor(dateKey,dow,settings);
  return {
   contentMode:'prelaunch' as const,event:null,pillar:'concept' as const,caption:'',images:[],timing,scheduledFor,
   cta:'Follow for launch updates',destinationUrl:'https://roundy.team',draftKind:'growth_carousel' as const,growthTopicType:topic,
   carouselSlides:[],researchSources:[],researchStatus:'pending' as const,
   reason:'Weekly Growth Carousel slot: '+growthTopicLabel(topic)+'. Research and original carousel slides are generated in Admin before approval. Test event data is not used.'
  };
 }
 const pillar=await choosePrelaunchPillar(revision),images=await latestPrelaunchImages();
 return {
  contentMode:'prelaunch' as const,event:null,pillar,caption:prelaunchCaption(pillar,dateKey,revision),images,timing,scheduledFor,
  cta:'Follow for launch updates',destinationUrl:'https://roundy.team',draftKind:'brand' as const,growthTopicType:null,
  carouselSlides:[],researchSources:[],researchStatus:'not_required' as const,
  reason:'Pre-launch promotion mode. Test event data is intentionally ignored. Selected '+pillar+' to rotate brand-building topics. Timing: '+timing.rationale
 };
}
async function ensureDailyDraft(force=false){
 const settings=await automationSettings();if(!settings.daily_instagram_enabled||!connection().instagram)return null;
 const now=kstNow(),due=timeMinutes(String(settings.draft_generation_time_kst||'10:00'));
 if(!force&&now.hour*60+now.minute<due)return null;
 const {data:existing,error:existingError}=await service.from('instagram_post_drafts').select('*').eq('draft_date',now.date).maybeSingle();
 if(existingError)throw existingError;if(existing)return existing;
 const built=await buildDraft(now.date,now.dow,1);
 const base={
  draft_date:now.date,event_id:built.event?.id??null,content_mode:built.contentMode,draft_kind:built.draftKind,growth_topic_type:built.growthTopicType,
  content_pillar:built.pillar,caption:built.caption,cta:built.cta,destination_url:built.destinationUrl,images:built.images,
  carousel_slides:built.carouselSlides,research_sources:built.researchSources,research_status:built.researchStatus,generation_reason:built.reason,
  recommended_time_kst:built.timing.recommended,window_start_kst:built.timing.windowStart,window_end_kst:built.timing.windowEnd,
  scheduled_for:built.scheduledFor,revision:1
 };
 const readyForApproval=built.draftKind==='growth_carousel'||built.contentMode==='prelaunch'||Boolean(built.event&&built.images.length);
 const {data,error}=await service.from('instagram_post_drafts').insert({...base,status:readyForApproval?'needs_approval':'skipped'}).select('*').single();
 if(error)throw error;return data;
}
async function regenerateDraft(draftId:string){
 const {data:current,error:currentError}=await service.from('instagram_post_drafts').select('*').eq('id',draftId).single();
 if(currentError||!current)throw currentError??new Error('Draft not found');
 if(current.status!=='needs_approval')throw new Error('Only a draft waiting for approval can be regenerated.');
 const local=kstNow(new Date(String(current.draft_date)+'T12:00:00+09:00')),revision=Number(current.revision||1)+1;
 const built=await buildDraft(String(current.draft_date),local.dow,revision);
 const {data,error}=await service.from('instagram_post_drafts').update({
  event_id:built.event?.id??null,content_mode:built.contentMode,content_pillar:built.pillar,caption:built.caption,images:built.images,
  cta:built.cta,destination_url:built.destinationUrl,generation_reason:built.reason,
  recommended_time_kst:built.timing.recommended,window_start_kst:built.timing.windowStart,
  window_end_kst:built.timing.windowEnd,scheduled_for:built.scheduledFor,revision,
  status:built.contentMode==='prelaunch'||(built.event&&built.images.length)?'needs_approval':'skipped'
 }).eq('id',draftId).select('*').single();
 if(error)throw error;return data;
}
const insightMetric=(data:any,name:string)=>{
 const item=Array.isArray(data?.data)?data.data.find((entry:any)=>entry?.name===name):null;
 const value=item?.value??item?.values?.[0]?.value??item?.total_value?.value;
 return value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
};
async function mediaPerformance(mediaId:string,isReel=false){
 const basic=await graph(mediaId+'?fields=like_count,comments_count').catch(()=>({}));
 const attempts=['views,reach,likes,comments,saved,shares,total_interactions','reach,likes,comments,saved,shares,total_interactions'];
 let rich:any=null;
 for(const metric of attempts){rich=await graph(mediaId+'/insights?metric='+metric).catch(()=>null);if(rich)break;}
 const likes=insightMetric(rich,'likes')??Number(basic.like_count??0);
 const comments=insightMetric(rich,'comments')??Number(basic.comments_count??0);
 const saves=insightMetric(rich,'saved')??0,shares=insightMetric(rich,'shares')??0;
 const reach=insightMetric(rich,'reach'),views=insightMetric(rich,'views'),total=insightMetric(rich,'total_interactions')??(likes+comments+saves+shares);
 let reelAvgWatch:number|null=null,reelTotalWatch:number|null=null;
 if(isReel){
  // Optional Reel-specific metrics. Meta may restrict or rename these fields.
  const watch=await graph(mediaId+'/insights?metric=ig_reels_avg_watch_time,ig_reels_video_view_total_time')
   .catch(()=>null);
  if(watch){
   reelAvgWatch=insightMetric(watch,'ig_reels_avg_watch_time');
   reelTotalWatch=insightMetric(watch,'ig_reels_video_view_total_time');
  }
 }
 const denominator=Math.max(1,reach??views??(likes+comments+1));
 const score=((likes+comments*2+saves*3+shares*4)/denominator)*1000+Math.log10(denominator+1)*10;
 return {source:rich?'insights':'basic',views,reach,likes,comments,saves,shares,total_interactions:total,performance_score:Number(score.toFixed(4)),reel_avg_watch_time_ms:reelAvgWatch,reel_total_watch_time_ms:reelTotalWatch};
}
async function captureFollowerSnapshot(){
 // One daily account-level observation; never attribute it to an individual post.
 if(!connection().instagram||!userId())return false;
 const date=kstNow().date;
 const {data:existing,error:lookupError}=await service.from('instagram_follower_snapshots')
  .select('snapshot_date').eq('snapshot_date',date).maybeSingle();
 if(lookupError)throw lookupError;
 if(existing)return false;
 // Claim the daily attempt before using Meta. A denied API permission must not
 // cause repeated paid/rate-limited calls on every publisher cron invocation.
 const claim=await service.from('instagram_follower_snapshot_attempts').upsert({
  snapshot_date:date,status:'started',attempted_at:new Date().toISOString(),error_code:null
 },{onConflict:'snapshot_date',ignoreDuplicates:true}).select('snapshot_date');
 if(claim.error)throw claim.error;
 if(!claim.data?.length)return false;
 try{
  // Unsupported profile fields are not silently stored as zero.
  const profile=await graph(userId()+'?fields=followers_count');
  const count=profile?.followers_count;
  if(!Number.isSafeInteger(count)||count<0)throw new Error('INSTAGRAM_FOLLOWERS_METRIC_UNAVAILABLE');
  const {error:saveError}=await service.from('instagram_follower_snapshots').upsert({
   snapshot_date:date,followers_count:count,source:'instagram_profile',captured_at:new Date().toISOString()
  },{onConflict:'snapshot_date'});
  if(saveError)throw saveError;
  const {error:statusError}=await service.from('instagram_follower_snapshot_attempts')
   .update({status:'captured',error_code:null}).eq('snapshot_date',date);
  if(statusError)throw statusError;
  return true;
 }catch(error){
  const reason=(error instanceof Error?error.message:'UNKNOWN_FOLLOWER_METRIC_ERROR').slice(0,100);
  await service.from('instagram_follower_snapshot_attempts')
   .update({status:'unavailable',error_code:reason}).eq('snapshot_date',date);
  throw error;
 }
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
  const performance=await mediaPerformance(String(run.external_id),(run.snapshot as Record<string,unknown>)?.media_kind==='reel');
  const published=kstNow(new Date(run.finished_at)),minute=published.hour*60+published.minute;
  for(const horizon of due){
   const {error:insertError}=await service.from('instagram_post_insights').upsert({
    run_id:run.id,horizon_hours:horizon,source:performance.source,published_dow:published.dow,published_minute:minute,
    views:performance.views,reach:performance.reach,likes:performance.likes,comments:performance.comments,saves:performance.saves,
    shares:performance.shares,total_interactions:performance.total_interactions,performance_score:performance.performance_score,
     reel_avg_watch_time_ms:performance.reel_avg_watch_time_ms,reel_total_watch_time_ms:performance.reel_total_watch_time_ms
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
 const {data:insights,error}=await service.from('instagram_post_insights').select('run_id,horizon_hours,published_dow,published_minute,performance_score,reach,source').order('horizon_hours',{ascending:false});
 if(error)throw error;
 const best=new Map<string,any>();for(const row of insights??[])if(!best.has(row.run_id))best.set(row.run_id,row);
 const runIds=[...best.keys()];let eligible=new Set<string>();
 if(runIds.length){
  const {data:runs,error:runError}=await service.from('marketing_runs').select('id,snapshot').in('id',runIds);
  if(runError)throw runError;
  eligible=new Set((runs??[]).filter(run=>(run.snapshot as any)?.eligible_for_optimization!==false).map(run=>run.id));
 }
 // A handful of 2-5-person posts can show 500+ interaction points. Do not learn from those.
 const rows=[...best.values()].filter(row=>eligible.has(row.run_id)&&row.source==='insights'&&Number(row.reach)>=50);
 const total=rows.length,totalReach=rows.reduce((n,row)=>n+Number(row.reach||0),0);
 const global=new Map<number,number[]>(),day=new Map<string,number[]>();
 for(const row of rows){
  const slot=nearestCandidate(Number(row.published_minute)),score=Number(row.performance_score||0);
  global.set(slot,[...(global.get(slot)??[]),score]);const key=row.published_dow+':'+slot;day.set(key,[...(day.get(key)??[]),score]);
 }
 const globalMeans=candidateMinutes.map(slot=>average(global.get(slot)??[])),globalMax=Math.max(1,...globalMeans);
 const dataWeight=total>=15&&totalReach>=3000?Math.min(.65,(total-10)/30*.65):0,priorWeight=1-dataWeight;
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
  const source=dataWeight===0?'benchmark':total>=30?'learned':'benchmark+learning';
  updates.push({
   dow,recommended_time_kst:minutesTime(bestSlot),window_start_kst:minutesTime(bestSlot-30),window_end_kst:minutesTime(bestSlot+30),
   sample_size:total,score:Number(bestScore.toFixed(4)),source,
   rationale:source==='benchmark'?'Benchmark only: fewer than 15 posts with reach >=50 or fewer than 3,000 cumulative reach; tiny-sample engagement is excluded.':'Blends the initial benchmark with Roundy reach and weighted engagement from '+total+' measured posts. Saves and shares receive the most weight.',
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
  else {const authorization=req.headers.get('Authorization')??'';adminClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});const {data:{user},error}=await adminClient.auth.getUser();if(error||!user)return json({error:'Sign in required'},401);const {data:admin,error:adminError}=await adminClient.rpc('is_admin');if(adminError||admin!==true)return json({error:'Administrator access required'},403);}
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
   if(body.action!=='process_queue'){
    const {data:template,error}=await adminClient.from('marketing_templates').select('*').eq('id',body.template_id).single();if(error||!template)return json({error:'Template not found'},404);validate(template);const result=await adminClient.rpc('enqueue_marketing',{p_template:body.template_id,p_request_key:body.request_key});if(result.error)throw result.error;
   }
  }
  if(schedulerKey){
   // Optional metrics must never block the established publisher or insights worker.
   await captureFollowerSnapshot().catch(error=>console.warn('Instagram daily follower snapshot unavailable:',error instanceof Error?error.message:'Unknown error'));
   const insightsChanged=await captureDueInsights();
   if(insightsChanged)await refreshTimeRecommendations();
  }
  const {data:runs,error}=await service.rpc('claim_marketing');if(error)throw error;
  const results=[];
  for(const run of runs??[]){
   let externalAttempt=false;let outcome:Record<string,unknown>;const t=run.snapshot as Template;
   try{
    validate(t);
    await validateReviewedStockDraft(t);
    if(t.channel==='koreapas'&&await hasAdvertOnGopasFirstPage(t.title))outcome={status:'skipped',message:'A post with this title is already on the first Koreapas page.'};
    else if(t.channel==='instagram'){
     const result=t.media_kind==='reel'
      ?await publishReel(t,String(run.id),()=>{externalAttempt=true;})
      :await publishInstagram(t,()=>{externalAttempt=true;},async()=>{
        externalAttempt=true;
        const {data:marked,error:markError}=await service.rpc('mark_marketing_feed_external_attempt',{p_run:run.id});
        if(markError||marked!==true)throw new Error('FEED_EXTERNAL_ATTEMPT_NOT_DURABLE');
       });
     outcome={status:'sent',message:t.media_kind==='reel'?'Reel published to @roundy.meet':'Published to @roundy.meet',...result};
    }
    else {const html='<p>'+escapeHtml(t.caption).replace(/\n/g,'<br>')+'</p>'+t.images.map(image=>'<p><img src="'+escapeHtml(image)+'" alt="Roundy event"></p>').join('')+(t.destination_url?'<p><a href="'+escapeHtml(t.destination_url)+'">'+escapeHtml(t.cta||t.destination_url)+'</a></p>':'');externalAttempt=true;const external_url=await publishToKoreapas(t.title,html);outcome={status:'sent',message:'Published to Koreapas',external_url};}
   }catch(error){
    if(error instanceof ReelProcessingPending){
     const {error:pendingError}=await service.from('marketing_runs').update({
      status:'queued',scheduled_for:new Date(Date.now()+2*60000).toISOString(),
      message:'Meta Reel processing is pending; existing container ID is preserved.',
      started_at:null
     }).eq('id',run.id).eq('status','publishing');
     if(pendingError)throw pendingError;
     results.push({id:run.id,status:'queued',message:'Reel processing pending'});
     continue;
    }
    outcome={status:externalAttempt?'needs_review':'failed',
     message:(error instanceof Error?error.message:'Publishing failed').slice(0,500)};
   }
   const finishedAt=new Date().toISOString();
   const {error:updateError}=await service.from('marketing_runs').update({...outcome,finished_at:finishedAt}).eq('id',run.id).eq('status','publishing');if(updateError)throw updateError;
   if(t.media_kind==='reel'&&t.reel_id){
    const reelStatus=outcome.status==='sent'?'published':
      outcome.status==='needs_review'?'needs_review_publish':'failed';
    const {error:reelError}=await service.from('instagram_reel_drafts')
     .update({status:reelStatus,...(reelStatus==='published'?{published_at:finishedAt}:{}),updated_at:finishedAt})
     .eq('id',t.reel_id).eq('marketing_run_id',run.id).eq('status','queued');
    if(reelError)throw reelError;
   }
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
