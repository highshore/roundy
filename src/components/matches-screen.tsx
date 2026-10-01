'use client';

import { Heading } from '@/components/heading';
import { Fragment, type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, Clock3, FileText, Flag, Heart, Mic, Paperclip, Reply, Send, Smile, UserRound, X } from 'lucide-react';
import { StreamChat } from 'stream-chat';

type StreamChannel=any;
import { LoadingScreen } from './loading-screen';
import { MATCH_CHAT_MAX_MESSAGE_LENGTH } from '@/lib/match-chat';
import { tr, type Locale } from '@/lib/locale';

type ChatState='awaiting_opening'|'awaiting_reply'|'active'|'expired';
type InboxChannel={key:string;kind:'roundy'|'match'|'expired';channelType:string|null;channelId:string|null;title:string;photo:string|null;matchId:string|null;chatState:ChatState;deadline:string|null;openingExpiresAt?:string;canSend:boolean;firstMessageByViewer:boolean};
type InboxResponse={apiKey:string;token:string;streamUserId:string;channels:InboxChannel[];likesCount:number|null};
type ChatAttachment={type:string;assetUrl:string|null;imageUrl:string|null;thumbUrl:string|null;title:string|null;mimeType:string|null;fileSize:number|null;titleLink:string|null;text:string|null};
type ChatReaction={type:string;count:number;own:boolean};
type ChatMessage={id:string;text:string;createdAt:string|null;senderId:string;quotedMessage:{id:string;text:string;senderId:string}|null;attachments:ChatAttachment[];reactions:ChatReaction[]};
type PendingAttachment={id:string;type:'image'|'video'|'audio'|'file';url:string;title:string;mimeType:string;fileSize:number};
type SessionUpdate={chat_state?:ChatState;can_send?:boolean;deadline?:string|null;first_message_by_viewer?:boolean};

const REACTIONS=[['love','♥'],['like','👍'],['haha','😂'],['wow','😮']] as const;
const EMOJIS=['😊','😂','❤️','👍','🔥','🎉','🥰','🙌','👋','☕','✨','🤍'];
const MAX_ATTACHMENTS=4;
const MAX_UPLOAD_BYTES=20*1024*1024;

function maybeString(value:unknown){return typeof value==='string'?value:null;}
function dateString(value:unknown){if(typeof value==='string')return value;if(value instanceof Date)return value.toISOString();return null;}
function maybeNumber(value:unknown){return typeof value==='number'&&Number.isFinite(value)?value:null;}
function toAttachment(value:unknown):ChatAttachment|null{
 if(!value||typeof value!=='object')return null;
 const item=value as Record<string,unknown>;
 const imageUrl=maybeString(item.image_url);
 const assetUrl=maybeString(item.asset_url);
 const thumbUrl=maybeString(item.thumb_url);
 const titleLink=maybeString(item.title_link)??maybeString(item.og_scrape_url);
 const title=maybeString(item.title);
 const text=maybeString(item.text);
 const rawType=maybeString(item.type);
 const type=rawType??(imageUrl?'image':assetUrl?'file':titleLink?'link':'file');
 if(!imageUrl&&!assetUrl&&!titleLink&&!title&&!text)return null;
 return {type,assetUrl,imageUrl,thumbUrl,title,mimeType:maybeString(item.mime_type),fileSize:maybeNumber(item.file_size),titleLink,text};
}
function toMessages(values:unknown[]):ChatMessage[]{
 return values.flatMap(value=>{
  if(!value||typeof value!=='object')return [];
  const item=value as {id?:unknown;text?:unknown;created_at?:unknown;user?:{id?:unknown};user_id?:unknown;quoted_message?:unknown;attachments?:unknown;reaction_groups?:unknown;own_reactions?:unknown};
  if(typeof item.id!=='string')return [];
  const quoted=item.quoted_message&&typeof item.quoted_message==='object'?item.quoted_message as {id?:unknown;text?:unknown;user?:{id?:unknown};user_id?:unknown}:null;
  const reactionGroups=item.reaction_groups&&typeof item.reaction_groups==='object'?item.reaction_groups as Record<string,unknown>:{};
  const own=new Set(Array.isArray(item.own_reactions)?item.own_reactions.flatMap(reaction=>reaction&&typeof reaction==='object'&&typeof (reaction as {type?:unknown}).type==='string'?[(reaction as {type:string}).type]:[]):[]);
  const reactions=Object.entries(reactionGroups).flatMap(([type,group])=>{
   const count=group&&typeof group==='object'?maybeNumber((group as {count?:unknown}).count):null;
   return count&&count>0?[{type,count,own:own.has(type)}]:[];
  });
  return [{
   id:item.id,
   text:typeof item.text==='string'?item.text:'',
   createdAt:dateString(item.created_at),
   senderId:typeof item.user?.id==='string'?item.user.id:typeof item.user_id==='string'?item.user_id:'',
   quotedMessage:quoted&&typeof quoted.id==='string'?{id:quoted.id,text:typeof quoted.text==='string'?quoted.text:'',senderId:typeof quoted.user?.id==='string'?quoted.user.id:typeof quoted.user_id==='string'?quoted.user_id:''}:null,
   attachments:Array.isArray(item.attachments)?item.attachments.flatMap(attachment=>{const parsed=toAttachment(attachment);return parsed?[parsed]:[];}):[],
   reactions,
  }];
 });
}
function mergeMessage(previous:ChatMessage[],next:ChatMessage){const index=previous.findIndex(message=>message.id===next.id);if(index<0)return [...previous,next];const copy=[...previous];copy[index]=next;return copy;}
function deadlineLabel(channel:InboxChannel,locale:Locale,now:number){if(channel.kind==='roundy')return tr(locale,'Official updates','공식 안내');if(channel.chatState==='expired')return tr(locale,'Expired','만료됨');if(!channel.deadline)return '';const hours=Math.ceil((Date.parse(channel.deadline)-now)/3_600_000);if(hours<=0)return tr(locale,'Expired','만료됨');return hours>24?tr(locale,Math.ceil(hours/24)+' days left',Math.ceil(hours/24)+'일 남음'):tr(locale,hours+' hours left',hours+'시간 남음');}
function phaseCopy(channel:InboxChannel,locale:Locale){if(channel.chatState==='awaiting_opening')return tr(locale,'Either of you can send the first message within 72 hours.','두 사람 중 누구나 72시간 안에 첫 메시지를 보낼 수 있어요.');if(channel.chatState==='awaiting_reply')return channel.firstMessageByViewer?tr(locale,'Waiting for a reply within the 72-hour window.','상대방의 72시간 이내 답장을 기다리고 있어요.'):tr(locale,'Send one reply within 72 hours to unlock the chat.','72시간 안에 답장 하나를 보내면 대화가 열려요.');if(channel.chatState==='active')return tr(locale,'Conversation unlocked.','대화가 열렸어요.');return tr(locale,'This match expired and its chat was deleted.','이 매칭은 만료되어 채팅방이 삭제되었어요.');}
function reactionGlyph(type:string){return REACTIONS.find(([name])=>name===type)?.[1]??'•';}
function attachmentLabel(attachment:ChatAttachment,locale:Locale){if(attachment.type==='image')return tr(locale,'Photo','사진');if(attachment.type==='video')return tr(locale,'Video','동영상');if(attachment.type==='audio')return tr(locale,'Voice message','음성 메시지');return attachment.title??tr(locale,'Attachment','첨부 파일');}
function dayKey(value:string|null){if(!value)return '';const date=new Date(value);return Number.isNaN(date.getTime())?'':date.getFullYear()+'-'+date.getMonth()+'-'+date.getDate();}
function dayLabel(value:string|null,locale:Locale){if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return '';return new Intl.DateTimeFormat(locale==='ko'?'ko-KR':'en-US',{month:'short',day:'numeric',year:date.getFullYear()!==new Date().getFullYear()?'numeric':undefined}).format(date);}
function Avatar({channel}:{channel:InboxChannel}){const [failed,setFailed]=useState(false);if(channel.kind==='roundy')return <span className="inbox-avatar roundy-avatar" aria-label="Roundy Team">R</span>;return <span className={'inbox-avatar'+(channel.kind==='expired'?' expired':'')}>{channel.photo&&!failed?<Image src={channel.photo} alt="" fill sizes="56px" unoptimized onError={()=>setFailed(true)}/>:<UserRound size={22}/>}</span>;}

function AttachmentView({attachment,locale}:{attachment:ChatAttachment;locale:Locale}){
 const mediaUrl=attachment.assetUrl??attachment.imageUrl;
 if(attachment.titleLink){
  return <a className="inbox-link-card" href={attachment.titleLink} target="_blank" rel="noreferrer">{attachment.imageUrl&&<img src={attachment.imageUrl} alt="" loading="lazy"/>}<span><strong>{attachment.title??attachment.titleLink}</strong>{attachment.text&&<small>{attachment.text}</small>}</span></a>;
 }
 if(attachment.type==='image'&&attachment.imageUrl)return <a className="inbox-image-attachment" href={attachment.imageUrl} target="_blank" rel="noreferrer"><img src={attachment.imageUrl} alt={attachment.title??tr(locale,'Shared photo','공유된 사진')} loading="lazy"/></a>;
 if(attachment.type==='video'&&mediaUrl)return <video className="inbox-video-attachment" controls preload="metadata" src={mediaUrl}/>;
 if(attachment.type==='audio'&&mediaUrl)return <div className="inbox-audio-attachment"><audio controls preload="metadata" src={mediaUrl}/></div>;
 if(mediaUrl)return <a className="inbox-file-attachment" href={mediaUrl} target="_blank" rel="noreferrer"><FileText size={18}/><span><strong>{attachment.title??tr(locale,'Attachment','첨부 파일')}</strong>{attachment.fileSize!==null&&<small>{Math.max(1,Math.round(attachment.fileSize/1024))} KB</small>}</span></a>;
 return null;
}

export function MatchesScreen({locale}:{locale:Locale}){
 const [inbox,setInbox]=useState<InboxResponse|null>(null),[messages,setMessages]=useState<Record<string,ChatMessage[]>>({}),[selectedKey,setSelectedKey]=useState('roundy');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0),[draft,setDraft]=useState(''),[sending,setSending]=useState(false),[sendError,setSendError]=useState(''),[mobileConversation,setMobileConversation]=useState(false),[now,setNow]=useState(()=>Date.now());
 const [typing,setTyping]=useState<Record<string,boolean>>({}),[unread,setUnread]=useState<Record<string,number>>({}),[readAt,setReadAt]=useState<Record<string,string|null>>({});
 const [replyTo,setReplyTo]=useState<ChatMessage|null>(null),[pendingAttachments,setPendingAttachments]=useState<PendingAttachment[]>([]),[uploading,setUploading]=useState(false),[emojiOpen,setEmojiOpen]=useState(false),[activeMessageId,setActiveMessageId]=useState<string|null>(null),[featureNotice,setFeatureNotice]=useState('');
 const [recording,setRecording]=useState(false);
 const channelsRef=useRef<Record<string,StreamChannel>>({}),selectedKeyRef=useRef(selectedKey),mobileConversationRef=useRef(mobileConversation),composerRef=useRef<HTMLTextAreaElement|null>(null),fileInputRef=useRef<HTMLInputElement|null>(null),messagesEndRef=useRef<HTMLDivElement|null>(null);
 const recorderRef=useRef<MediaRecorder|null>(null),recordingChunksRef=useRef<Blob[]>([]),recordingStreamRef=useRef<MediaStream|null>(null);

 useEffect(()=>{selectedKeyRef.current=selectedKey;},[selectedKey]);
 useEffect(()=>{mobileConversationRef.current=mobileConversation;},[mobileConversation]);

 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setInbox(null);setMessages({});setUnread({});setReadAt({});channelsRef.current={};void fetch('/api/chat/inbox',{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load your inbox.');return data as InboxResponse;}).then(data=>{if(!controller.signal.aborted){setInbox(data);setSelectedKey(previous=>data.channels.some(channel=>channel.key===previous)?previous:'roundy');}}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:tr(locale,'Could not load your inbox.','메시지를 불러오지 못했어요.'));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[locale,retry]);

 useEffect(()=>{
  if(!inbox)return;
  let active=true;
  const cleanups:(()=>void)[]=[];
  const client=StreamChat.getInstance(inbox.apiKey);
  function syncChannel(entry:InboxChannel,channel:StreamChannel){
   if(!active)return;
   setMessages(previous=>({...previous,[entry.key]:toMessages(channel.state.messages as unknown[])}));
   setUnread(previous=>({...previous,[entry.key]:channel.countUnread()}));
   if(entry.kind==='match'){
    const read=channel.state.read as unknown as Record<string,{last_read?:string|Date,user?:{id?:string}}>;
    const otherRead=Object.entries(read).find(([userId])=>userId!==inbox!.streamUserId)?.[1];
    setReadAt(previous=>({...previous,[entry.key]:dateString(otherRead?.last_read)}));
   }
  }
  function visible(entry:InboxChannel){
   if(selectedKeyRef.current!==entry.key)return false;
   if(typeof window==='undefined')return false;
   return mobileConversationRef.current||window.matchMedia('(min-width: 760px)').matches;
  }
  void (async()=>{
   try{
    if(client.userID&&client.userID!==inbox.streamUserId)await client.disconnectUser();
    await client.connectUser({id:inbox.streamUserId},inbox.token);
    for(const entry of inbox.channels){
     if(!entry.channelType||!entry.channelId)continue;
     const channel=client.channel(entry.channelType,entry.channelId);
     await channel.watch();
     if(!active)return;
     channelsRef.current[entry.key]=channel;
     syncChannel(entry,channel);
     const listener=channel.on(event=>{
      if(!active)return;
      if(event.type==='message.new'||event.type==='message.updated'||event.type==='message.deleted'||event.type==='reaction.new'||event.type==='reaction.updated'||event.type==='reaction.deleted'||event.type==='message.read'||event.type==='notification.mark_read'||event.type==='notification.mark_unread')syncChannel(entry,channel);
      if(event.type==='typing.start'&&event.user?.id&&event.user.id!==inbox.streamUserId)setTyping(previous=>({...previous,[entry.key]:true}));
      if(event.type==='typing.stop'&&event.user?.id&&event.user.id!==inbox.streamUserId)setTyping(previous=>({...previous,[entry.key]:false}));
      if(event.type==='message.new'&&event.message?.user?.id!==inbox.streamUserId){
       if(entry.kind==='match')void refreshSession(entry);
       if(visible(entry))void channel.markRead().then(()=>syncChannel(entry,channel)).catch(()=>undefined);
      }
     });
     cleanups.push(()=>listener.unsubscribe());
    }
   }catch(reason){if(active)setError(reason instanceof Error?reason.message:tr(locale,'Could not connect to chat.','채팅에 연결하지 못했어요.'));}
  })();
  return()=>{active=false;cleanups.forEach(cleanup=>cleanup());channelsRef.current={};void client.disconnectUser();};
 },[inbox,locale]);

 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60_000);return()=>window.clearInterval(timer);},[]);
 useEffect(()=>{messagesEndRef.current?.scrollIntoView({block:'end'});},[selectedKey,mobileConversation,messages[selectedKey]?.length,typing[selectedKey]]);
 useEffect(()=>()=>{try{recorderRef.current?.stop();}catch{}recordingStreamRef.current?.getTracks().forEach(track=>track.stop());},[]);

 const selected=inbox?.channels.find(channel=>channel.key===selectedKey)??inbox?.channels[0]??null;
 const conversationMessages=selected?messages[selected.key]??[]:[];
 const lastMessage=conversationMessages.at(-1)??null;

 function updateSession(matchId:string,session:SessionUpdate){
  setInbox(previous=>previous?{...previous,channels:previous.channels.map(channel=>channel.matchId===matchId?{...channel,kind:session.chat_state==='expired'?'expired':channel.kind==='expired'?'match':channel.kind,chatState:session.chat_state??channel.chatState,canSend:session.can_send??channel.canSend,deadline:session.deadline===undefined?channel.deadline:session.deadline,firstMessageByViewer:session.first_message_by_viewer??channel.firstMessageByViewer}:channel)}:previous);
 }
 async function refreshSession(channel:InboxChannel){
  if(!channel.matchId)return;
  try{
   const response=await fetch('/api/chat/matches/'+encodeURIComponent(channel.matchId),{cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();
   if(data.session&&typeof data.session==='object')updateSession(channel.matchId,data.session as SessionUpdate);
  }catch{/* Realtime messages still render if the state refresh is temporarily unavailable. */}
 }
 function stopTyping(channelKey=selectedKey){const channel=channelsRef.current[channelKey];if(channel)void channel.stopTyping().catch(()=>undefined);}
 function openConversation(channel:InboxChannel){
  if(recording)stopRecording();
  stopTyping();
  setSelectedKey(channel.key);setMobileConversation(true);setDraft('');setReplyTo(null);setPendingAttachments([]);setEmojiOpen(false);setActiveMessageId(null);setSendError('');setFeatureNotice('');
  window.setTimeout(()=>{const streamChannel=channelsRef.current[channel.key];if(streamChannel)void streamChannel.markRead().then(()=>setUnread(previous=>({...previous,[channel.key]:0}))).catch(()=>undefined);if(channel.kind==='match')void refreshSession(channel);},0);
 }
 function closeConversation(){if(recording)stopRecording();stopTyping();setMobileConversation(false);setReplyTo(null);setPendingAttachments([]);setEmojiOpen(false);setActiveMessageId(null);}
 function preview(channel:InboxChannel){if(channel.kind==='expired')return tr(locale,'Match expired','매칭 만료');const last=messages[channel.key]?.at(-1);if(last?.text)return last.text;if(last?.attachments?.length)return attachmentLabel(last.attachments[0],locale);return channel.kind==='roundy'?tr(locale,'Welcome and updates from Roundy','Roundy의 환영 메시지와 안내'):tr(locale,'Say hello to your match','매칭 상대에게 인사해 보세요');}

 async function send(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const text=draft.trim();
  if(!selected?.matchId||!selected.canSend||(!text&&!pendingAttachments.length)||sending||uploading)return;
  setSending(true);setSendError('');setFeatureNotice('');
  try{
   stopTyping(selected.key);
   const response=await fetch('/api/chat/matches/'+encodeURIComponent(selected.matchId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    text,
    messageId:crypto.randomUUID(),
    quotedMessageId:replyTo?.id??null,
    attachments:pendingAttachments.map(attachment=>({
     type:attachment.type,
     ...(attachment.type==='image'?{image_url:attachment.url}:{asset_url:attachment.url}),
     title:attachment.title,
     mime_type:attachment.mimeType,
     file_size:attachment.fileSize,
    })),
   })});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Could not send your message.');
   setDraft('');setReplyTo(null);setPendingAttachments([]);setEmojiOpen(false);
   if(data.session&&typeof data.session==='object')updateSession(selected.matchId,data.session as SessionUpdate);
   const channel=channelsRef.current[selected.key];if(channel)void channel.markRead().catch(()=>undefined);
  }catch(reason){setSendError(reason instanceof Error?reason.message:tr(locale,'Could not send your message.','메시지를 보내지 못했어요.'));}finally{setSending(false);}
 }

 async function uploadFiles(files:File[]){
  if(!selected?.canSend||!selected.matchId||uploading||!files.length)return;
  const channel=channelsRef.current[selected.key];
  if(!channel){setSendError(tr(locale,'Chat is still connecting. Try again in a moment.','채팅 연결 중이에요. 잠시 후 다시 시도해 주세요.'));return;}
  const room=MAX_ATTACHMENTS-pendingAttachments.length;
  const chosen=files.slice(0,room);
  if(chosen.some(file=>file.size>MAX_UPLOAD_BYTES)){setSendError(tr(locale,'Each attachment must be 20 MB or smaller.','첨부 파일은 각각 20MB 이하여야 해요.'));return;}
  setUploading(true);setSendError('');
  try{
   const uploaded:PendingAttachment[]=[];
   for(const file of chosen){
    const kind:PendingAttachment['type']=file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':'file';
    const result=kind==='image'?await channel.sendImage(file,file.name,file.type):await channel.sendFile(file,file.name,file.type);
    const url=typeof (result as {file?:unknown}).file==='string'?(result as {file:string}).file:'';
    if(!url)throw new Error('Upload failed');
    uploaded.push({id:crypto.randomUUID(),type:kind,url,title:file.name,mimeType:file.type||'application/octet-stream',fileSize:file.size});
   }
   setPendingAttachments(previous=>[...previous,...uploaded].slice(0,MAX_ATTACHMENTS));
  }catch{setSendError(tr(locale,'Could not upload that attachment.','첨부 파일을 업로드하지 못했어요.'));}finally{setUploading(false);}
 }

 async function uploadVoice(blob:Blob,mimeType:string){
  if(!selected?.canSend||!selected.matchId)return;
  const channel=channelsRef.current[selected.key];
  if(!channel)return;
  setUploading(true);setSendError('');
  try{
   const extension=mimeType.includes('mp4')?'m4a':mimeType.includes('ogg')?'ogg':'webm';
   const name='voice-'+Date.now()+'.'+extension;
   const file=new File([blob],name,{type:mimeType});
   const result=await channel.sendFile(file,name,mimeType);
   const url=typeof (result as {file?:unknown}).file==='string'?(result as {file:string}).file:'';
   if(!url)throw new Error('Upload failed');
   const attachment:PendingAttachment={id:crypto.randomUUID(),type:'audio',url,title:tr(locale,'Voice message','음성 메시지'),mimeType,fileSize:blob.size};
   setPendingAttachments(previous=>[...previous,attachment].slice(0,MAX_ATTACHMENTS));
  }catch{setSendError(tr(locale,'Could not attach the voice message.','음성 메시지를 첨부하지 못했어요.'));}finally{setUploading(false);}
 }

 async function startRecording(){
  if(!selected?.canSend||recording||pendingAttachments.length>=MAX_ATTACHMENTS||typeof MediaRecorder==='undefined'){if(typeof MediaRecorder==='undefined')setSendError(tr(locale,'Voice recording is not supported in this browser.','이 브라우저에서는 음성 녹음을 지원하지 않아요.'));return;}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   recordingStreamRef.current=stream;recordingChunksRef.current=[];
   const preferred=MediaRecorder.isTypeSupported('audio/mp4')?'audio/mp4':MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'';
   const recorder=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined);
   recorderRef.current=recorder;
   recorder.ondataavailable=event=>{if(event.data.size)recordingChunksRef.current.push(event.data);};
   recorder.onstop=()=>{const mime=recorder.mimeType||preferred||'audio/webm';const blob=new Blob(recordingChunksRef.current,{type:mime});recordingStreamRef.current?.getTracks().forEach(track=>track.stop());recordingStreamRef.current=null;recorderRef.current=null;recordingChunksRef.current=[];setRecording(false);if(blob.size)void uploadVoice(blob,mime);};
   recorder.start();setRecording(true);setEmojiOpen(false);
  }catch{setSendError(tr(locale,'Microphone access is required to record a voice message.','음성 메시지 녹음을 위해 마이크 권한이 필요해요.'));}
 }
 function stopRecording(){const recorder=recorderRef.current;if(recorder&&recorder.state!=='inactive')recorder.stop();else setRecording(false);}

 async function toggleReaction(message:ChatMessage,type:string){
  if(!selected||selected.kind!=='match')return;
  const channel=channelsRef.current[selected.key];if(!channel)return;
  try{
   const own=message.reactions.some(reaction=>reaction.type===type&&reaction.own);
   if(own)await channel.deleteReaction(message.id,type);else await channel.sendReaction(message.id,{type});
   setActiveMessageId(null);
  }catch{setSendError(tr(locale,'Could not update the reaction.','반응을 업데이트하지 못했어요.'));}
 }
 async function reportMessage(message:ChatMessage){
  if(!inbox||message.senderId===inbox.streamUserId)return;
  try{const client=StreamChat.getInstance(inbox.apiKey);await client.flagMessage(message.id);setFeatureNotice(tr(locale,'Message reported to Roundy.','메시지를 Roundy에 신고했어요.'));setActiveMessageId(null);}catch{setSendError(tr(locale,'Could not report this message.','메시지를 신고하지 못했어요.'));}
 }
 function reply(message:ChatMessage){setReplyTo(message);setActiveMessageId(null);setEmojiOpen(false);window.setTimeout(()=>composerRef.current?.focus(),0);}
 function insertEmoji(emoji:string){setDraft(previous=>previous+emoji);setEmojiOpen(false);window.setTimeout(()=>composerRef.current?.focus(),0);}
 function onDraft(value:string){setDraft(value);if(selected?.canSend){const channel=channelsRef.current[selected.key];if(channel)void channel.keystroke().catch(()=>undefined);}}

 if(loading)return <LoadingScreen/>;
 if(error&&!inbox)return <section className="matches-empty"><Heart size={36}/><Heading level={1}>{tr(locale,'Could not load your matches','매칭을 불러오지 못했어요')}</Heading><p role="alert">{error}</p><button className="button" onClick={()=>setRetry(value=>value+1)}>{tr(locale,'Try again','다시 시도')}</button></section>;
 if(!selected)return null;

 const newMatches=(inbox?.channels??[]).filter(channel=>channel.kind==='match'&&Date.parse(channel.openingExpiresAt??channel.deadline??'')>now);
 const visibleChannels=inbox?.channels??[];

 return <section className={'stream-inbox'+(mobileConversation?' mobile-conversation':'')}>
  <aside className="inbox-sidebar" aria-label={tr(locale,'Match conversations','매칭 대화 목록')}>
   {newMatches.length>0&&<section className="inbox-new-matches"><Heading level={2}>{tr(locale,'Your Matches','내 매칭')}</Heading><div className="inbox-match-strip">
    {newMatches.map(channel=>{const expires=channel.openingExpiresAt??channel.deadline!;const remaining=Math.max(0,Math.min(1,(Date.parse(expires)-now)/(72*3_600_000)));return <button key={channel.key} onClick={()=>openConversation(channel)} aria-label={channel.title+', '+deadlineLabel({...channel,deadline:expires},locale,now)}><span className="inbox-match-ring" style={{'--remaining':String(remaining*360)+'deg'} as CSSProperties}><Avatar channel={channel}/></span><strong>{channel.title.split(' ')[0]}</strong><small>{deadlineLabel({...channel,deadline:expires},locale,now)}</small></button>;})}
   </div></section>}
   <Heading level={2} className="inbox-section-heading">{tr(locale,'Conversations','대화')}</Heading>
   {error&&<p className="inbox-connection-error" role="alert">{tr(locale,'Could not connect.','연결하지 못했어요.')} <button onClick={()=>setRetry(value=>value+1)}>{tr(locale,'Retry','다시 시도')}</button></p>}
   <div className="inbox-list">{visibleChannels.map(channel=><button key={channel.key} className={'inbox-row '+(channel.key===selected.key?'selected':'')} onClick={()=>openConversation(channel)} aria-pressed={channel.key===selected.key&&mobileConversation}>
    <Avatar channel={channel}/><span><strong>{channel.title}</strong><small>{typing[channel.key]?tr(locale,'Typing…','입력 중…'):preview(channel)}</small></span>
    <span className="inbox-row-meta">{(unread[channel.key]??0)>0&&<b className="inbox-unread">{Math.min(99,unread[channel.key]??0)}</b>}{channel.chatState==='awaiting_reply'&&!channel.firstMessageByViewer?<small className="inbox-turn">{tr(locale,'Your turn','답장할 차례')}</small>:channel.kind==='expired'?<Clock3 size={16}/>:null}</span>
   </button>)}{visibleChannels.length===0&&<p className="inbox-no-results">{tr(locale,'No conversations yet.','아직 대화가 없어요.')}</p>}</div>
  </aside>

  <article className="inbox-conversation">
   <header className="inbox-conversation-header">
    <button className="icon-button inbox-back" aria-label={tr(locale,'Back to conversations','대화 목록으로 돌아가기')} onClick={closeConversation}><ArrowLeft size={21}/></button>
    <Avatar key={selected.key} channel={selected}/>
    <div><Heading level={2}>{selected.title}</Heading><p>{typing[selected.key]?tr(locale,'Typing…','입력 중…'):deadlineLabel(selected,locale,now)}</p></div>
   </header>

   {selected.kind==='expired'?<div className="inbox-expired"><Clock3 size={25}/><Heading level={3}>{tr(locale,'Match expired','매칭이 만료되었어요')}</Heading><p>{phaseCopy(selected,locale)}</p></div>:<>
    {selected.kind==='match'&&selected.chatState!=='active'&&<p className="inbox-phase"><Clock3 size={16}/>{phaseCopy(selected,locale)}</p>}
    <div className="inbox-messages" aria-live="polite">
     {conversationMessages.length===0&&<p className="inbox-start-note">{selected.kind==='roundy'?tr(locale,'Your Roundy updates will appear here.','Roundy의 안내가 여기에 표시돼요.'):tr(locale,'Start with something you remember from your conversation.','현장에서 나눴던 대화로 자연스럽게 시작해 보세요.')}</p>}
     {conversationMessages.map((message,index)=>{
      const mine=message.senderId===inbox?.streamUserId;
      const showDay=index===0||dayKey(message.createdAt)!==dayKey(conversationMessages[index-1]?.createdAt??null);
      const isLast=lastMessage?.id===message.id;
      const seen=mine&&isLast&&message.createdAt&&readAt[selected.key]&&Date.parse(readAt[selected.key]!)>=Date.parse(message.createdAt);
      return <Fragment key={message.id}>
       {showDay&&message.createdAt&&<div className="inbox-date-divider"><span>{dayLabel(message.createdAt,locale)}</span></div>}
       <div className={'inbox-message '+(mine?'mine':'')+(activeMessageId===message.id?' actions-open':'')}>
        <div className="inbox-message-shell" onClick={()=>selected.kind==='match'&&setActiveMessageId(current=>current===message.id?null:message.id)}>
         {message.quotedMessage&&<button type="button" className="inbox-quote" onClick={event=>{event.stopPropagation();}}><Reply size={13}/><span>{message.quotedMessage.text||tr(locale,'Attachment','첨부 파일')}</span></button>}
         {message.attachments.length>0&&<div className="inbox-attachments">{message.attachments.map((attachment,attachmentIndex)=><AttachmentView key={message.id+':'+attachmentIndex} attachment={attachment} locale={locale}/>)}</div>}
         {message.text&&<p>{message.text}</p>}
        </div>
        {message.reactions.length>0&&<div className="inbox-reactions">{message.reactions.map(reaction=><button type="button" key={reaction.type} className={reaction.own?'own':''} onClick={()=>void toggleReaction(message,reaction.type)}>{reactionGlyph(reaction.type)} <span>{reaction.count}</span></button>)}</div>}
        <div className="inbox-message-meta">{message.createdAt&&<small>{new Intl.DateTimeFormat(locale==='ko'?'ko-KR':'en-US',{hour:'numeric',minute:'2-digit'}).format(new Date(message.createdAt))}</small>}{mine&&isLast&&<small>{seen?tr(locale,'Read','읽음'):tr(locale,'Sent','전송됨')}</small>}</div>
        {activeMessageId===message.id&&selected.kind==='match'&&<div className="inbox-message-actions">
         {REACTIONS.map(([type,glyph])=><button type="button" key={type} aria-label={type} onClick={()=>void toggleReaction(message,type)}>{glyph}</button>)}
         <button type="button" aria-label={tr(locale,'Reply','답장')} onClick={()=>reply(message)}><Reply size={16}/></button>
         {!mine&&<button type="button" aria-label={tr(locale,'Report message','메시지 신고')} onClick={()=>void reportMessage(message)}><Flag size={15}/></button>}
        </div>}
       </div>
      </Fragment>;
     })}
     {typing[selected.key]&&<div className="inbox-typing-bubble" aria-label={tr(locale,'Typing','입력 중')}><i/><i/><i/></div>}
     <div ref={messagesEndRef}/>
    </div>

    {featureNotice&&<p className="inbox-feature-notice">{featureNotice}</p>}
    {selected.kind==='roundy'?<p className="inbox-read-only">{tr(locale,'Roundy Team sends updates here. Replies are not monitored.','Roundy Team의 안내를 받는 곳이에요. 답장은 확인되지 않아요.')}</p>:
    <form className="inbox-composer" onSubmit={send}>
     {replyTo&&<div className="inbox-reply-preview"><Reply size={15}/><span><small>{tr(locale,'Replying to','답장')}</small><strong>{replyTo.text||tr(locale,'Attachment','첨부 파일')}</strong></span><button type="button" aria-label={tr(locale,'Cancel reply','답장 취소')} onClick={()=>setReplyTo(null)}><X size={16}/></button></div>}
     {pendingAttachments.length>0&&<div className="inbox-pending-attachments">{pendingAttachments.map(attachment=><span key={attachment.id}>{attachment.type==='image'?<span className="inbox-pending-thumb"><img src={attachment.url} alt=""/></span>:attachment.type==='audio'?<Mic size={15}/>:<Paperclip size={15}/>}<b>{attachment.title}</b><button type="button" aria-label={tr(locale,'Remove attachment','첨부 제거')} onClick={()=>setPendingAttachments(previous=>previous.filter(item=>item.id!==attachment.id))}><X size={14}/></button></span>)}</div>}
     <div className="inbox-composer-main">
      <textarea ref={composerRef} id="inbox-message" rows={1} value={draft} onChange={event=>onDraft(event.target.value)} maxLength={MATCH_CHAT_MAX_MESSAGE_LENGTH} placeholder={selected.canSend?tr(locale,'Message…','메시지…'):tr(locale,'Waiting for their reply…','상대방의 답장을 기다리는 중…')} disabled={!selected.canSend||sending} onBlur={()=>stopTyping(selected.key)}/>
      <div className="inbox-composer-tools">
       <input ref={fileInputRef} className="sr-only" type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" onChange={event=>{const files=Array.from(event.target.files??[]);event.currentTarget.value='';void uploadFiles(files);}}/>
       <button type="button" className="inbox-tool-button" aria-label={tr(locale,'Attach file','파일 첨부')} disabled={!selected.canSend||uploading||pendingAttachments.length>=MAX_ATTACHMENTS} onClick={()=>fileInputRef.current?.click()}><Paperclip size={19}/></button>
       <div className="inbox-emoji-wrap"><button type="button" className="inbox-tool-button" aria-label={tr(locale,'Emoji','이모지')} disabled={!selected.canSend} onClick={()=>setEmojiOpen(value=>!value)}><Smile size={19}/></button>{emojiOpen&&<div className="inbox-emoji-picker">{EMOJIS.map(emoji=><button type="button" key={emoji} onClick={()=>insertEmoji(emoji)}>{emoji}</button>)}</div>}</div>
       <button type="button" className={'inbox-tool-button'+(recording?' recording':'')} aria-label={recording?tr(locale,'Stop recording','녹음 중지'):tr(locale,'Voice message','음성 메시지')} disabled={!selected.canSend||uploading||pendingAttachments.length>=MAX_ATTACHMENTS} onClick={()=>recording?stopRecording():void startRecording()}><Mic size={19}/>{recording&&<span/>}</button>
      </div>
      <button className="inbox-send" type="submit" disabled={!selected.canSend||sending||uploading||(!draft.trim()&&!pendingAttachments.length)} aria-label={tr(locale,'Send message','메시지 보내기')}><Send size={19}/></button>
     </div>
     {uploading&&<p className="inbox-uploading">{tr(locale,'Uploading…','업로드 중…')}</p>}
     {draft.length>900&&<small className="inbox-char-count">{draft.length}/{MATCH_CHAT_MAX_MESSAGE_LENGTH}</small>}
     {sendError&&<p className="inbox-send-error" role="alert">{sendError}</p>}
    </form>}
   </>}
  </article>
 </section>;
}
