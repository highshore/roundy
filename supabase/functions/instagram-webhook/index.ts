import { createClient } from 'npm:@supabase/supabase-js@2.117.0';

const url=Deno.env.get('SUPABASE_URL')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const token=()=>Deno.env.get('INSTAGRAM_ACCESS_TOKEN');
const userId=()=>Deno.env.get('INSTAGRAM_USER_ID');
const apiVersion=()=>Deno.env.get('INSTAGRAM_API_VERSION')||'v25.0';
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

type Incoming={
 external_id:string;kind:'comment'|'dm';sender_id:string;sender_username:string;media_id:string;text:string;received_at:string;
};
type EventRow={
 slug:string;starts_at:string;venue:string;neighborhood:string;age_min:number;age_max:number;
 price_gents:number;price_ladies:number;
};

async function graphForm(path:string,fields:Record<string,string>){
 const response=await fetch('https://graph.instagram.com/'+apiVersion()+'/'+path,{
  method:'POST',
  headers:{Authorization:'Bearer '+token(),'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams(fields),
  signal:AbortSignal.timeout(25000)
 });
 const data=await response.json();if(!response.ok||data.error)throw new Error('Instagram API error '+(data.error?.code??response.status));return data;
}
async function graphJson(path:string,body:Record<string,unknown>){
 const response=await fetch('https://graph.instagram.com/'+apiVersion()+'/'+path,{
  method:'POST',
  headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},
  body:JSON.stringify(body),
  signal:AbortSignal.timeout(25000)
 });
 const data=await response.json();if(!response.ok||data.error)throw new Error('Instagram API error '+(data.error?.code??response.status));return data;
}
async function sendReply(item:Incoming,message:string){
 if(item.kind==='comment'){const result=await graphForm(item.external_id+'/replies',{message});return String(result.id??'');}
 const result=await graphJson(userId()+'/messages',{recipient:{id:item.sender_id},message:{text:message}});
 return String(result.message_id??result.id??'');
}
function hexBytes(value:string){
 if(value.length%2||!/^[0-9a-f]+$/i.test(value))return null;
 const bytes=new Uint8Array(value.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(value.slice(i*2,i*2+2),16);return bytes;
}
async function validSignature(raw:string,header:string|null){
 const secret=Deno.env.get('INSTAGRAM_APP_SECRET');
 if(!secret)return true;
 if(!header?.startsWith('sha256='))return false;
 const signature=hexBytes(header.slice(7));if(!signature)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,signature,new TextEncoder().encode(raw));
}
function collect(payload:Record<string,unknown>):Incoming[]{
 const result:Incoming[]=[];
 const entries=Array.isArray(payload.entry)?payload.entry as Array<Record<string,unknown>>:[];
 for(const entry of entries){
  const changes=Array.isArray(entry.changes)?entry.changes as Array<Record<string,unknown>>:[];
  for(const change of changes){
   if(change.field!=='comments')continue;
   const value=(change.value&&typeof change.value==='object'?change.value:{}) as Record<string,unknown>;
   const from=(value.from&&typeof value.from==='object'?value.from:{}) as Record<string,unknown>;
   const media=(value.media&&typeof value.media==='object'?value.media:{}) as Record<string,unknown>;
   const id=String(value.id??'').trim(),sender=String(from.id??'').trim(),text=String(value.text??'').trim();
   if(id&&sender&&text&&sender!==userId())result.push({external_id:id,kind:'comment',sender_id:sender,sender_username:String(from.username??'').slice(0,120),media_id:String(media.id??'').slice(0,240),text:text.slice(0,4000),received_at:new Date().toISOString()});
  }
  const messaging=Array.isArray(entry.messaging)?entry.messaging as Array<Record<string,unknown>>:[];
  for(const event of messaging){
   const message=(event.message&&typeof event.message==='object'?event.message:{}) as Record<string,unknown>;
   const sender=(event.sender&&typeof event.sender==='object'?event.sender:{}) as Record<string,unknown>;
   const id=String(message.mid??'').trim(),senderId=String(sender.id??'').trim(),text=String(message.text??'').trim();
   if(message.is_echo===true||!id||!senderId||!text||senderId===userId())continue;
   const timestamp=Number(event.timestamp);
   result.push({external_id:id,kind:'dm',sender_id:senderId,sender_username:'',media_id:'',text:text.slice(0,4000),received_at:Number.isFinite(timestamp)?new Date(timestamp).toISOString():new Date().toISOString()});
  }
 }
 return result;
}
async function nextEvent():Promise<EventRow|null>{
 const {data,error}=await service.from('events').select('slug,starts_at,venue,neighborhood,age_min,age_max,price_gents,price_ladies').eq('status','live').is('deleted_at',null).gt('starts_at',new Date().toISOString()).order('starts_at').limit(1).maybeSingle();
 if(error)throw error;return data as EventRow|null;
}
function eventLine(event:EventRow,ko:boolean){
 const when=new Intl.DateTimeFormat(ko?'ko-KR':'en-US',{timeZone:'Asia/Seoul',month:'short',day:'numeric',weekday:'short',hour:'numeric',minute:'2-digit'}).format(new Date(event.starts_at));
 return (ko?'다음 일정: ':'Next event: ')+when+' · '+event.venue;
}
function classify(text:string,event:EventRow|null){
 const ko=/[가-힣]/.test(text),lower=text.toLowerCase();
 const manual=[
  /환불|취소|결제|중복.?결제|카드|영수증|refund|cancel|payment|charged|chargeback|receipt/i,
  /신고|안전|위험|불쾌|괴롭|성희롱|폭력|사기|협박|report|unsafe|harass|assault|scam|threat/i,
  /계정|로그인|비밀번호|인증|삭제|개인정보|account|login|password|verification|delete account|privacy/i,
  /국적|종교|차별|nationality|religion|discrimin/i
 ];
 const ack=ko?'문의 감사합니다. 내용을 확인한 뒤 Roundy 운영진이 이곳에서 답변드릴게요.':'Thanks for reaching out. A Roundy host will review this and reply here.';
 if(manual.some(pattern=>pattern.test(text)))return {review:true,reason:'Sensitive or account/payment-related request',reply:ack};
 const link=event?'https://roundy.team/events/'+event.slug:'https://roundy.team/events';
 if(/할인|discount|early bird|얼리버드|promo|프로모|추천.?코드/i.test(text))return {review:false,reason:'Discount FAQ',reply:ko?'적용 가능한 할인은 이벤트 신청 과정에서 자동으로 계산돼요. 현재 금액과 할인 내역은 결제 전 화면에서 확인할 수 있습니다. '+link:'Available discounts are calculated automatically during event checkout. You can review the current price and discounts before payment. '+link};
 if(/언제|일정|날짜|몇시|시간|when|date|schedule|what time/i.test(text)){
  if(event)return {review:false,reason:'Schedule FAQ',reply:eventLine(event,ko)+'\n'+link};
  return {review:false,reason:'No upcoming event',reply:ko?'현재 공개된 다음 일정은 준비 중이에요. 새 일정은 여기에서 가장 먼저 확인할 수 있습니다: '+link:'The next public event is being prepared. New dates will appear here first: '+link};
 }
 if(/어디|장소|위치|where|location|venue/i.test(text)){
  if(event)return {review:false,reason:'Venue FAQ',reply:(ko?'다음 Roundy는 ':'The next Roundy is at ')+event.venue+(event.neighborhood?' · '+event.neighborhood:'')+'.\n'+link};
  return {review:false,reason:'Venue unavailable',reply:ko?'다음 행사 장소는 새 일정과 함께 공개됩니다: '+link:'The next venue will be published with the new event: '+link};
 }
 if(/얼마|가격|비용|price|cost|how much|fee/i.test(text)){
  if(event){
   const gents=Number(event.price_gents||49000).toLocaleString('ko-KR'),ladies=Number(event.price_ladies||29000).toLocaleString('ko-KR');
   return {review:false,reason:'Price FAQ',reply:ko?'기본 참가비는 남성 '+gents+'원, 여성 '+ladies+'원이에요. 적용 가능한 할인은 결제 단계에서 자동 계산됩니다. '+link:'Base admission is ₩'+gents+' for gents and ₩'+ladies+' for ladies. Any eligible discounts are calculated at checkout. '+link};
  }
  return {review:false,reason:'Price unavailable',reply:ko?'참가비는 이벤트별 신청 페이지에서 확인할 수 있어요: '+link:'Pricing is shown on each event page: '+link};
 }
 if(/나이|연령|몇.?살|age|age range/i.test(text)){
  if(event)return {review:false,reason:'Age FAQ',reply:ko?'다음 이벤트 참가 연령은 '+event.age_min+'–'+event.age_max+'세예요. '+link:'The next event is for ages '+event.age_min+'–'+event.age_max+'. '+link};
  return {review:false,reason:'Age unavailable',reply:ko?'참가 연령은 각 이벤트 페이지에 안내됩니다: '+link:'The age range is listed on each event page: '+link};
 }
 if(/어떻게|진행|방식|뭐.?하는|무슨|how.*work|what is|format|rotation|speed mingle/i.test(text))return {review:false,reason:'Format FAQ',reply:ko?'Roundy는 참가자들과 한 명씩 직접 대화하고 일정 시간마다 상대를 바꾸는 오프라인 1:1 로테이션 밍글이에요. 서로 다시 만나고 싶다고 선택한 경우에만 매칭됩니다. '+link:'Roundy is an offline 1:1 rotation mingle. You meet participants one at a time, rotate after each conversation, and only reconnect when the interest is mutual. '+link};
 if(/신청|예약|참가|링크|register|book|apply|join|sign up/i.test(text))return {review:false,reason:'Registration FAQ',reply:ko?'참가 신청은 여기에서 할 수 있어요: '+link:'You can see the next event and register here: '+link};
 if(/^(hi|hello|hey|안녕|안녕하세요|하이)\b/i.test(lower))return {review:false,reason:'Greeting',reply:ko?'안녕하세요. Roundy는 서울에서 진행하는 오프라인 1:1 로테이션 밍글이에요. 다음 일정은 여기에서 확인할 수 있습니다: '+link:'Hi. Roundy is an offline 1:1 rotation mingle in Seoul. You can see the next event here: '+link};
 if(/감사|고마|thank|love it|좋아요|멋져|❤️|❤|🔥|👏|😍/i.test(text))return {review:false,reason:'Positive acknowledgement',reply:ko?'감사합니다. 다음 Roundy에서 만나요.':'Thank you. Hope to see you at a Roundy soon.'};
 return {review:true,reason:'No confident FAQ match',reply:ack};
}
async function processItem(item:Incoming,event:EventRow|null,autoReply:boolean){
 const {data:existing,error:existingError}=await service.from('instagram_inbox').select('id').eq('external_id',item.external_id).maybeSingle();
 if(existingError)throw existingError;if(existing)return;
 const decision=classify(item.text,event);
 const {data:row,error:insertError}=await service.from('instagram_inbox').insert({...item,status:'new',decision_reason:decision.reason,suggested_reply:decision.reply}).select('id').single();
 if(insertError){if(insertError.code==='23505')return;throw insertError;}
 if(!autoReply){
  await service.from('instagram_inbox').update({status:'needs_review',decision_reason:'Auto replies paused · '+decision.reason}).eq('id',row.id);return;
 }
 if(decision.review){
  if(item.kind==='dm'){
   try{const externalReplyId=await sendReply(item,decision.reply);await service.from('instagram_inbox').update({status:'needs_review',reply_text:decision.reply,external_reply_id:externalReplyId,replied_at:new Date().toISOString()}).eq('id',row.id);}
   catch(error){await service.from('instagram_inbox').update({status:'needs_review',decision_reason:'Acknowledgement failed · '+(error instanceof Error?error.message:'Unknown Instagram error')}).eq('id',row.id);}
  }else await service.from('instagram_inbox').update({status:'needs_review'}).eq('id',row.id);
  return;
 }
 try{
  const externalReplyId=await sendReply(item,decision.reply);
  await service.from('instagram_inbox').update({status:'auto_replied',reply_text:decision.reply,external_reply_id:externalReplyId,replied_at:new Date().toISOString()}).eq('id',row.id);
 }catch(error){
  await service.from('instagram_inbox').update({status:'needs_review',decision_reason:'Automatic reply failed · '+(error instanceof Error?error.message:'Unknown Instagram error')}).eq('id',row.id);
 }
}
async function processPayload(payload:Record<string,unknown>){
 const items=collect(payload);if(!items.length)return;
 const [{data:settings,error:settingsError},event]=await Promise.all([
  service.from('marketing_automation_settings').select('auto_reply_enabled').eq('singleton',true).maybeSingle(),
  nextEvent()
 ]);
 if(settingsError)throw settingsError;
 for(const item of items)await processItem(item,event,settings?.auto_reply_enabled!==false);
}

Deno.serve(async req=>{
 const incomingUrl=new URL(req.url),key=incomingUrl.searchParams.get('key')??'';
 const {data:authorized,error:authError}=await service.rpc('instagram_webhook_callback_authorized',{p_key:key});
 if(authError||authorized!==true)return new Response('Unauthorized',{status:401});
 if(req.method==='GET'){
  const mode=incomingUrl.searchParams.get('hub.mode'),verifyToken=incomingUrl.searchParams.get('hub.verify_token')??'',challenge=incomingUrl.searchParams.get('hub.challenge')??'';
  if(mode!=='subscribe'||!challenge)return new Response('Invalid verification request',{status:400});
  const {data:verified,error}=await service.rpc('instagram_webhook_verify',{p_key:key,p_token:verifyToken});
  if(error||verified!==true)return new Response('Verification failed',{status:403});
  return new Response(challenge,{status:200,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
 }
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const raw=await req.text();
 if(!await validSignature(raw,req.headers.get('x-hub-signature-256')))return json({error:'Invalid webhook signature'},401);
 let payload:Record<string,unknown>;try{payload=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
 await service.rpc('mark_instagram_webhook_received',{p_key:key});
 const task=processPayload(payload).catch(error=>console.error('Instagram webhook processing failed',error));
 const runtime=(globalThis as typeof globalThis & {EdgeRuntime?:{waitUntil:(promise:Promise<unknown>)=>void}}).EdgeRuntime;
 if(runtime?.waitUntil)runtime.waitUntil(task);else await task;
 return json({ok:true});
});
