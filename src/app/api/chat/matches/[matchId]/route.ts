import { NextRequest, NextResponse } from 'next/server';
import { isMemberUser } from '@/lib/auth-user';
import { isUuid, matchChatStreamMessageId, MATCH_CHAT_CHANNEL_TYPE, MATCH_CHAT_MAX_MESSAGE_LENGTH, type MatchChatSession } from '@/lib/match-chat';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient, SupabaseServiceConfigurationError } from '@/lib/supabase/service';
import {
 StreamChatConfigurationError,
 ensureMatchChatChannel,
 ensureRoundyNotificationChannel,
 hardDeleteMatchChatChannel,
 streamChatServer,
 streamChatApiKey,
 streamUserToken,
} from '@/lib/stream-chat.server';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});

class MatchChatExpiredError extends Error {}

function errorResponse(error:unknown){
 const message=error instanceof Error?error.message:'';
 if(error instanceof StreamChatConfigurationError||error instanceof SupabaseServiceConfigurationError)return json({error:error.message},503);
 if(error instanceof MatchChatExpiredError||message.includes('Match chat has expired'))return json({error:'This match has expired. Its chat is no longer available.'},410);
 if(message.includes('Waiting for your match to reply'))return json({error:'Your match has 72 hours to reply before this chat expires.'},409);
 if(message.includes('Another message is being sent'))return json({error:'Your previous message is still being sent. Please try again in a moment.'},409);
 if(message.includes('Match unavailable'))return json({error:'Match unavailable'},404);
 return json({error:'Chat is temporarily unavailable. Please try again.'},503);
}

async function currentMember(){
 const supabase=await createClient();
 const {data:{user},error}=await supabase.auth.getUser();
 if(error||!user)return {error:json({error:'Sign in required'},401)} as const;
 if(!isMemberUser(user))return {error:json({error:'Member sign-in required'},403)} as const;
 return {user,supabase} as const;
}

async function matchSession(actorId:string,matchId:string){
 const service=createServiceRoleClient();
 const {data,error}=await service.rpc('service_match_chat_session',{p_actor:actorId,p_match:matchId});
 if(error)throw new Error(error.message);
 return data as MatchChatSession;
}

async function createMatchChannels(actorId:string,session:MatchChatSession){
 if(session.chat_state==='expired')throw new MatchChatExpiredError();
 await ensureRoundyNotificationChannel(session);
 const channel=await ensureMatchChatChannel(session);
 const service=createServiceRoleClient();
 const {data,error}=await service.rpc('service_set_match_chat_channel',{p_actor:actorId,p_match:session.id,p_channel_id:session.channel_id});
 if(error)throw new Error(error.message);
 if((data as {expired?:boolean}|null)?.expired){
  await hardDeleteMatchChatChannel(session.channel_id).catch(()=>undefined);
  throw new MatchChatExpiredError();
 }
 return channel;
}

function responseStatus(error:unknown){
 if(!error||typeof error!=='object')return null;
 const value=error as {status?:unknown;response?:{status?:unknown}};
 const status=value.response?.status??value.status;
 return typeof status==='number'?status:null;
}

async function messageWasDelivered(session:MatchChatSession,messageId:string){
 const id=matchChatStreamMessageId(session.id,messageId);
 try{
  const {message}=await streamChatServer().getMessage(id);
  const sender=message.user?.id??message.user_id;
  return message.cid===MATCH_CHAT_CHANNEL_TYPE+':'+session.channel_id&&sender===session.viewer_stream_user_id;
 }catch(error){
  if(responseStatus(error)===404)return false;
  throw error;
 }
}

export async function GET(_request:NextRequest,{params}:{params:Promise<{matchId:string}>}){
 const {matchId}=await params;
 if(!isUuid(matchId))return json({error:'Invalid match ID'},400);
 const member=await currentMember();
 if('error' in member)return member.error;
 try{
  const session=await matchSession(member.user.id,matchId);
  if(session.chat_state!=='expired')await createMatchChannels(member.user.id,session);
  return json({session,apiKey:streamChatApiKey(),token:session.chat_state==='expired'?null:streamUserToken(member.user.id)});
 }catch(error){
  return errorResponse(error);
 }
}

export async function POST(request:NextRequest,{params}:{params:Promise<{matchId:string}>}){
 const {matchId}=await params;
 if(!isUuid(matchId))return json({error:'Invalid match ID'},400);
 if(request.headers.get('origin')!==request.nextUrl.origin)return json({error:'Invalid request origin'},403);
 const member=await currentMember();
 if('error' in member)return member.error;
 const body=await request.json().catch(()=>null);
 const text=typeof body?.text==='string'?body.text.trim():'';
 const messageId=typeof body?.messageId==='string'?body.messageId:'';
 if(!text||Array.from(text).length>MATCH_CHAT_MAX_MESSAGE_LENGTH)return json({error:'Use a message up to 1,000 characters.'},400);
 if(!isUuid(messageId))return json({error:'Invalid message ID'},400);

 let reserved=false,delivered=false,deliveryUncertain=false;
 try{
  const service=createServiceRoleClient();
  const {data:reservation,error:reservationError}=await service.rpc('service_reserve_match_chat_message',{p_actor:member.user.id,p_match:matchId,p_message_id:messageId});
  if(reservationError)throw new Error(reservationError.message);
  reserved=true;
  const session=reservation as MatchChatSession;
  const channel=await createMatchChannels(member.user.id,session);
  // A retry after a database/network interruption reuses the reservation. Check
  // Stream first, then only create the deterministic message if it is absent.
  deliveryUncertain=Boolean(session.already_reserved);
  delivered=await messageWasDelivered(session,messageId);
  if(!delivered){
   try{
    await channel.sendMessage({id:matchChatStreamMessageId(session.id,messageId),text,user_id:session.viewer_stream_user_id});
    delivered=true;
   }catch(error){
    try{delivered=await messageWasDelivered(session,messageId);}catch{deliveryUncertain=true;}
    if(!delivered){
     const status=responseStatus(error);
     deliveryUncertain=deliveryUncertain||status===null||status>=500;
     throw error;
    }
   }
  }
  const {data:confirmed,error:confirmError}=await service.rpc('service_confirm_match_chat_message',{p_actor:member.user.id,p_match:matchId,p_message_id:messageId});
  if(confirmError)throw new Error(confirmError.message);
  return json({messageId,session:confirmed as MatchChatSession});
 }catch(error){
  // Once Stream may have accepted the message, retain the reservation. The
  // browser keeps its UUID and a retry will confirm rather than duplicate it.
  if(reserved&&!delivered&&!deliveryUncertain){
   try{
    const service=createServiceRoleClient();
    await service.rpc('service_abort_match_chat_message',{p_actor:member.user.id,p_match:matchId,p_message_id:messageId});
   }catch{/* The reservation can be retried with the same message ID. */}
  }
  return errorResponse(error);
 }
}
