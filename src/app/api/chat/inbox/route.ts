import { NextResponse } from 'next/server';
import { isMemberUser } from '@/lib/auth-user';
import { isUuid, MATCH_CHAT_CHANNEL_TYPE, ROUNDY_NOTIFICATION_CHANNEL_TYPE, type MatchChatSession } from '@/lib/match-chat';
import { deliverRoundyWelcome } from '@/lib/roundy-welcome.server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient, SupabaseServiceConfigurationError } from '@/lib/supabase/service';
import {
 StreamChatConfigurationError,
 ensureMatchChatChannel,
 ensureRoundyNotificationChannelForUser,
 hardDeleteMatchChatChannel,
 roundyNotificationChannelId,
 streamChatApiKey,
 streamUserId,
 streamUserToken,
} from '@/lib/stream-chat.server';

export const dynamic='force-dynamic';
export const runtime='nodejs';

type InboxMatchCard={id?:unknown};

const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});

export async function GET(){
 const supabase=await createClient();
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError||!user)return json({error:'Sign in required'},401);
 if(!isMemberUser(user))return json({error:'Member sign-in required'},403);

 try{
  const {data:cards,error:cardsError}=await supabase.rpc('match_cards',{p_match:null});
  if(cardsError)throw new Error(cardsError.message);
  const ids=Array.isArray(cards)?cards.flatMap(card=>{
   const id=(card as InboxMatchCard)?.id;
   return typeof id==='string'&&isUuid(id)?[id]:[];
  }):[];
  const service=createServiceRoleClient();
  const sessions:MatchChatSession[]=[];
  for(const id of ids){
   const {data,error}=await service.rpc('service_match_chat_session',{p_actor:user.id,p_match:id});
   if(error)throw new Error(error.message);
   const session=data as MatchChatSession;
   if(session.chat_state!=='expired'){
    await ensureMatchChatChannel(session);
    const stored=await service.rpc('service_set_match_chat_channel',{p_actor:user.id,p_match:session.id,p_channel_id:session.channel_id});
    if(stored.error)throw new Error(stored.error.message);
    if((stored.data as {expired?:boolean}|null)?.expired){
     await hardDeleteMatchChatChannel(session.channel_id).catch(()=>undefined);
     session.chat_state='expired';
     session.can_send=false;
    }
   }
   sessions.push(session);
  }

  // This also queues a welcome for members who existed before chat launched.
  // A temporary Stream outage must not prevent the inbox from opening.
  await deliverRoundyWelcome(user.id).catch(()=>undefined);
  const roundyId=streamUserId(user.id);
  const roundyChannelId=roundyNotificationChannelId(user.id);
  await ensureRoundyNotificationChannelForUser(roundyId,undefined,null,roundyChannelId);

  return json({
   apiKey:streamChatApiKey(),
   token:streamUserToken(user.id),
   streamUserId:roundyId,
   channels:[
    {key:'roundy',kind:'roundy',channelType:ROUNDY_NOTIFICATION_CHANNEL_TYPE,channelId:roundyChannelId,title:'Roundy Team',photo:null,matchId:null,chatState:'active',deadline:null,canSend:false,firstMessageByViewer:false},
    ...sessions.map(session=>({
     key:'match:'+session.id,
     kind:session.chat_state==='expired'?'expired':'match',
     channelType:session.chat_state==='expired'?null:MATCH_CHAT_CHANNEL_TYPE,
     channelId:session.chat_state==='expired'?null:session.channel_id,
     title:session.other_name,
     photo:session.other_photo,
     matchId:session.id,
     chatState:session.chat_state,
     deadline:session.deadline,
     canSend:session.can_send,
     firstMessageByViewer:session.first_message_by_viewer,
    })),
   ],
  });
 }catch(error){
  if(error instanceof StreamChatConfigurationError||error instanceof SupabaseServiceConfigurationError)return json({error:error.message},503);
  return json({error:'Inbox is temporarily unavailable. Please try again.'},503);
 }
}
