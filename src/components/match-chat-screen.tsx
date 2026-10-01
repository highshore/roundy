'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Clock3, MessageCircle, Send, UserRound } from 'lucide-react';
import { StreamChat } from 'stream-chat';
import { LoadingScreen } from './loading-screen';
import { MATCH_CHAT_CHANNEL_TYPE, MATCH_CHAT_MAX_MESSAGE_LENGTH, type MatchChatSession } from '@/lib/match-chat';
import { tr, type Locale } from '@/lib/locale';

type ChatMessage={id:string;text:string;createdAt:string|null;senderId:string};
type SessionResponse={session:MatchChatSession;apiKey:string;token:string|null};

function toMessages(values:unknown[]):ChatMessage[]{
 return values.flatMap(value=>{
  if(!value||typeof value!=='object')return [];
  const item=value as {id?:unknown;text?:unknown;created_at?:unknown;user?:{id?:unknown};user_id?:unknown};
  if(typeof item.id!=='string'||typeof item.text!=='string')return [];
  const senderId=typeof item.user?.id==='string'?item.user.id:typeof item.user_id==='string'?item.user_id:'';
  return [{id:item.id,text:item.text,createdAt:typeof item.created_at==='string'?item.created_at:null,senderId}];
 });
}

function mergeMessage(previous:ChatMessage[],next:ChatMessage){
 const index=previous.findIndex(message=>message.id===next.id);
 if(index<0)return [...previous,next];
 const copy=[...previous];copy[index]=next;return copy;
}

function relativeDeadline(deadline:string|null,locale:Locale,now:number){
 if(!deadline)return '';
 const milliseconds=Date.parse(deadline)-now;
 if(milliseconds<=0)return tr(locale,'Expired','만료됨');
 const hours=Math.ceil(milliseconds/3_600_000);
 if(hours>24)return tr(locale,`${Math.ceil(hours/24)} days left`,`${Math.ceil(hours/24)}일 남음`);
 return tr(locale,`${hours} hours left`,`${hours}시간 남음`);
}

function phaseCopy(session:MatchChatSession,locale:Locale){
 if(session.chat_state==='awaiting_opening')return {
  title:tr(locale,'Say hello while the match is fresh','매칭이 새로울 때 먼저 인사해 보세요'),
  body:tr(locale,'Either of you can send one opening message before this window closes.','두 사람 중 누구나 이 시간이 끝나기 전 첫 메시지 하나를 보낼 수 있어요.'),
 };
 if(session.chat_state==='awaiting_reply')return session.first_message_by_viewer?{
  title:tr(locale,'Waiting for a reply','답장을 기다리고 있어요'),
  body:tr(locale,`${session.other_name} has 72 hours to reply before this chat expires.`,`${session.other_name}님이 72시간 안에 답장하지 않으면 채팅이 만료돼요.`),
 }:{
  title:tr(locale,'Your turn to reply','이제 답장할 차례예요'),
  body:tr(locale,'Send one reply within 72 hours to unlock the conversation.','72시간 안에 답장 하나를 보내면 대화가 완전히 열려요.'),
 };
 if(session.chat_state==='active')return {
  title:tr(locale,'Conversation unlocked','대화가 열렸어요'),
  body:tr(locale,'Keep the conversation kind and personal.','서로를 존중하며 편하게 대화를 이어가 보세요.'),
 };
 return {
  title:tr(locale,'This match expired','이 매칭은 만료됐어요'),
  body:tr(locale,'No eligible message arrived in time, so this chat has been removed.','정해진 시간 안에 필요한 메시지가 오지 않아 채팅방이 삭제되었어요.'),
 };
}

export function MatchChatScreen({matchId,locale}:{matchId:string;locale:Locale}){
 const [session,setSession]=useState<MatchChatSession|null>(null);
 const [apiKey,setApiKey]=useState('');
 const [token,setToken]=useState<string|null>(null);
 const [messages,setMessages]=useState<ChatMessage[]>([]);
 const [loading,setLoading]=useState(true);
 const [connectionError,setConnectionError]=useState('');
 const [draft,setDraft]=useState('');
 const [sending,setSending]=useState(false);
 const [sendError,setSendError]=useState('');
 const [now,setNow]=useState(()=>Date.now());
 const pendingMessageId=useRef<string|null>(null);

 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setConnectionError('');setMessages([]);
  void fetch('/api/chat/matches/'+encodeURIComponent(matchId),{cache:'no-store',signal:controller.signal})
   .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load this chat.');return data as SessionResponse;})
   .then(data=>{if(!controller.signal.aborted){setSession(data.session);setApiKey(data.apiKey);setToken(data.token);}})
   .catch(error=>{if(!controller.signal.aborted)setConnectionError(error instanceof Error?error.message:tr(locale,'Could not load this chat.','채팅을 불러오지 못했어요.'));})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[locale,matchId]);

 // Keep the deadline display and composer in sync even while the user leaves
 // the chat screen open. The server remains the final authority on send.
 useEffect(()=>{
  if(!session?.deadline)return;
  const update=()=>setNow(Date.now());
  update();
  const displayTimer=window.setInterval(update,60_000);
  const expiryTimer=window.setTimeout(update,Math.max(0,Date.parse(session.deadline)-Date.now())+25);
  return()=>{window.clearInterval(displayTimer);window.clearTimeout(expiryTimer);};
 },[session?.deadline]);

 useEffect(()=>{
  if(!session||session.chat_state==='expired'||!apiKey||!token)return;
  let active=true;
  let unsubscribe:(()=>void)|undefined;
  const client=StreamChat.getInstance(apiKey);
  void (async()=>{
   try{
    if(client.userID&&client.userID!==session.viewer_stream_user_id)await client.disconnectUser();
    await client.connectUser({id:session.viewer_stream_user_id},async()=>{
     const response=await fetch('/api/chat/token',{cache:'no-store'});
     const data=await response.json();
     if(!response.ok||typeof data.token!=='string')throw new Error(data.error||'Could not refresh chat access.');
     return data.token;
    });
    const channel=client.channel(MATCH_CHAT_CHANNEL_TYPE,session.channel_id);
    await channel.watch();
    if(!active)return;
    setMessages(toMessages(channel.state.messages));
    const listener=channel.on('message.new',event=>{
     if(!active||!event.message)return;
     const [message]=toMessages([event.message]);
     if(message)setMessages(previous=>mergeMessage(previous,message));
    });
    unsubscribe=()=>listener.unsubscribe();
   }catch(error){
    if(active)setConnectionError(error instanceof Error?error.message:tr(locale,'Could not connect to chat.','채팅에 연결하지 못했어요.'));
   }
  })();
  return()=>{active=false;unsubscribe?.();void client.disconnectUser();};
 },[apiKey,locale,session?.channel_id,session?.chat_state,session?.viewer_stream_user_id,token]);

 async function send(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const text=draft.trim();
  if(!session||!session.can_send||!text||sending)return;
  const messageId=pendingMessageId.current??crypto.randomUUID();
  pendingMessageId.current=messageId;
  setSending(true);setSendError('');
  try{
   const response=await fetch('/api/chat/matches/'+encodeURIComponent(matchId),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,messageId}),
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Could not send your message.');
   setSession(data.session as MatchChatSession);
   setDraft('');pendingMessageId.current=null;
  }catch(error){
   setSendError(error instanceof Error?error.message:tr(locale,'Could not send your message.','메시지를 보내지 못했어요.'));
  }finally{setSending(false);}
 }

 if(loading)return <LoadingScreen/>;
 if(connectionError&&!session)return <section className="match-chat-empty"><MessageCircle size={38}/><h1>{tr(locale,'Could not load this chat','채팅을 불러오지 못했어요')}</h1><p role="alert">{connectionError}</p><Link className="button" href={'/matches/'+matchId}>{tr(locale,'Back to match','매칭으로 돌아가기')}</Link></section>;
 if(!session)return null;
 const copy=phaseCopy(session,locale);
 const deadlineExpired=Boolean(session.deadline&&Date.parse(session.deadline)<=now);
 const canSend=session.can_send&&!deadlineExpired&&!sending;
 const showComposer=session.chat_state!=='expired';

 return <section className="match-chat" aria-busy={sending}>
  <header className="match-chat-header">
   <Link href={'/matches/'+matchId} className="icon-button" aria-label={tr(locale,'Back to match','매칭으로 돌아가기')}><ArrowLeft size={21}/></Link>
   <div className="match-chat-person"><span className="match-chat-avatar">{session.other_photo?<Image src={session.other_photo} alt="" fill sizes="42px" unoptimized/>:<UserRound size={21}/>}</span><div><strong>{session.other_name}</strong><small>{tr(locale,'Mutual match','서로 선택한 매칭')}</small></div></div>
   <span className="match-chat-brand">ROUNDY</span>
  </header>

  <div className={'match-chat-phase '+session.chat_state}>
   {session.chat_state!=='active'&&<Clock3 size={19}/>}<div><strong>{copy.title}</strong><p>{copy.body}</p>{session.deadline&&<small>{relativeDeadline(session.deadline,locale,now)}</small>}</div>
  </div>

  {session.chat_state==='expired'?<div className="match-chat-expired"><MessageCircle size={40}/><h1>{copy.title}</h1><p>{copy.body}</p><Link className="button secondary" href={'/matches/'+matchId}>{tr(locale,'Back to match','매칭으로 돌아가기')}</Link></div>:<>
   <div className="match-chat-messages" aria-live="polite">
    {messages.length===0?<p className="match-chat-empty-state">{tr(locale,'Your conversation will appear here.','대화 내용은 여기에 표시돼요.')}</p>:messages.map(message=>{
     const mine=message.senderId===session.viewer_stream_user_id;
     return <article className={'match-chat-bubble '+(mine?'mine':'theirs')} key={message.id}><p>{message.text}</p>{message.createdAt&&<small>{new Intl.DateTimeFormat(locale==='ko'?'ko-KR':'en-US',{hour:'numeric',minute:'2-digit'}).format(new Date(message.createdAt))}</small>}</article>;
    })}
   </div>
   {connectionError&&<p className="match-chat-connection-error" role="status">{connectionError}</p>}
   {showComposer&&<form className="match-chat-composer" onSubmit={send}>
    <label className="sr-only" htmlFor="match-chat-message">{tr(locale,'Message','메시지')}</label>
    <textarea id="match-chat-message" value={draft} onChange={event=>setDraft(event.target.value)} maxLength={MATCH_CHAT_MAX_MESSAGE_LENGTH} rows={1} disabled={!canSend} placeholder={canSend?tr(locale,'Write a message…','메시지 입력…'):session.first_message_by_viewer?tr(locale,'Waiting for a reply…','답장을 기다리는 중…'):tr(locale,'This reply window has ended.','답장 시간이 끝났어요.')} />
    <button type="submit" className="match-chat-send" disabled={!canSend||!draft.trim()} aria-label={tr(locale,'Send message','메시지 보내기')}><Send size={19}/></button>
    {sendError&&<p className="match-chat-send-error" role="alert">{sendError}</p>}
   </form>}
  </>}
 </section>;
}
