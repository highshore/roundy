import 'server-only';

import { createHash } from 'node:crypto';
import { StreamChat } from 'stream-chat';
import {
 MATCH_CHAT_CHANNEL_TYPE,
 MATCH_CHAT_MAX_MESSAGE_LENGTH,
 ROUNDY_WELCOME_MESSAGE,
 ROUNDY_NOTIFICATION_CHANNEL_TYPE,
 ROUNDY_STREAM_USER_ID,
 roundyWelcomeStreamMessageId,
 type MatchChatSession,
} from '@/lib/match-chat';

export class StreamChatConfigurationError extends Error {}

function streamConfig(){
 const apiKey=process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY?.trim();
 const apiSecret=process.env.STREAM_CHAT_API_SECRET?.trim();
 if(!apiKey||!apiSecret)throw new StreamChatConfigurationError('Roundy chat is not configured yet.');
 return {apiKey,apiSecret};
}

export function streamUserId(userId:string){return 'r_'+createHash('md5').update(userId).digest('hex');}

export function roundyNotificationChannelId(userId:string){return 'roundy_'+createHash('md5').update(userId).digest('hex');}

export function streamChatServer(){
 const {apiKey,apiSecret}=streamConfig();
 return StreamChat.getInstance(apiKey,apiSecret);
}

export function streamChatApiKey(){return streamConfig().apiKey;}

export function streamUserToken(userId:string){
 // Short-lived tokens limit access after an expiry is discovered. The token is
 // refreshed through Roundy, which rechecks the authenticated account.
 return streamChatServer().createToken(streamUserId(userId),Math.floor(Date.now()/1000)+15*60);
}

function streamUser(id:string,name:string,image:string|null){
 return image?{id,name,image}:{id,name};
}

function responseStatus(error:unknown){
 if(!error||typeof error!=='object')return null;
 const value=error as {status?:unknown;response?:{status?:unknown}};
 const status=value.response?.status??value.status;
 return typeof status==='number'?status:null;
}

const configuredRichChannels=new Set<string>();
const richMatchOverrides={
 typing_events:true,
 reactions:true,
 replies:false,
 quotes:true,
 uploads:true,
 url_enrichment:true,
 max_message_length:MATCH_CHAT_MAX_MESSAGE_LENGTH,
 grants:{
  channel_member:['read-channel-members','read-events','create-reaction','delete-reaction-owner','upload-attachment','flag-message'],
  channel_moderator:['read-channel-members','read-events','create-reaction','delete-reaction-owner','upload-attachment','flag-message'],
 },
};

async function enableRichMatchFeatures(channelId:string,channel:ReturnType<ReturnType<typeof streamChatServer>['channel']>){
 if(configuredRichChannels.has(channelId))return;
 // Message creation intentionally remains absent from the client grants. Roundy
 // keeps every message behind its server-side 72-hour state gate, while safe
 // real-time affordances such as typing, reactions and uploads can use Stream.
 const partialChannel=channel as unknown as {updatePartial:(payload:{set:Record<string,unknown>})=>Promise<unknown>};
 await partialChannel.updatePartial({set:{config_overrides:richMatchOverrides,roundy_chat_features_version:2}});
 configuredRichChannels.add(channelId);
}

export async function ensureRoundyNotificationChannel(session:MatchChatSession){
 return ensureRoundyNotificationChannelForUser(session.viewer_stream_user_id,session.viewer_name,session.viewer_photo,session.notification_channel_id);
}

export async function ensureRoundyNotificationChannelForUser(userId:string,name?:string,image?:string|null,channelId=roundyNotificationChannelId(userId)){
 const client=streamChatServer();
 await client.upsertUsers([
  streamUser(userId,name?.trim()||'Roundy member',image??null),
  {id:ROUNDY_STREAM_USER_ID,name:'Roundy Team'},
 ]);
 const channel=client.channel(ROUNDY_NOTIFICATION_CHANNEL_TYPE,channelId,{created_by_id:ROUNDY_STREAM_USER_ID,members:[ROUNDY_STREAM_USER_ID,userId]});
 await channel.create();
 return channel;
}

export async function ensureMatchChatChannel(session:MatchChatSession){
 const client=streamChatServer();
 await client.upsertUsers([
  streamUser(session.viewer_stream_user_id,session.viewer_name,session.viewer_photo),
  streamUser(session.other_stream_user_id,session.other_name,session.other_photo),
 ]);
 const channel=client.channel(MATCH_CHAT_CHANNEL_TYPE,session.channel_id,{created_by_id:session.viewer_stream_user_id,members:[session.viewer_stream_user_id,session.other_stream_user_id]});
 await channel.create();
 await enableRichMatchFeatures(session.channel_id,channel);
 return channel;
}

/**
 * Server-only entry point for transactional or consent-eligible Roundy
 * marketing messages. It creates the user and their deterministic 1:1
 * notification channel lazily, so campaigns do not depend on a prior match.
 */
export async function sendRoundyNotification(userId:string,text:string){
 const message=text.trim();
 if(!message||Array.from(message).length>3_000)throw new Error('Roundy notifications must be between 1 and 3,000 characters.');
 const client=streamChatServer();
 const recipient=streamUserId(userId);
 await client.upsertUsers([{id:recipient},{id:ROUNDY_STREAM_USER_ID,name:'Roundy Team'}]);
 const channel=client.channel(ROUNDY_NOTIFICATION_CHANNEL_TYPE,roundyNotificationChannelId(userId),{created_by_id:ROUNDY_STREAM_USER_ID,members:[ROUNDY_STREAM_USER_ID,recipient]});
 await channel.create();
 return channel.sendMessage({text:message,user_id:ROUNDY_STREAM_USER_ID});
}

/** Send the onboarding message at most once, even if the auth callback retries. */
export async function sendRoundyWelcomeNotification(userId:string){
 const client=streamChatServer();
 const recipient=streamUserId(userId);
 const channelId=roundyNotificationChannelId(userId);
 const messageId=roundyWelcomeStreamMessageId(userId);
 await client.upsertUsers([{id:recipient},{id:ROUNDY_STREAM_USER_ID,name:'Roundy Team'}]);
 const channel=client.channel(ROUNDY_NOTIFICATION_CHANNEL_TYPE,channelId,{created_by_id:ROUNDY_STREAM_USER_ID,members:[ROUNDY_STREAM_USER_ID,recipient]});
 await channel.create();

 try{
  const {message}=await client.getMessage(messageId);
  const sender=message.user?.id??message.user_id;
  if(message.cid===ROUNDY_NOTIFICATION_CHANNEL_TYPE+':'+channelId&&sender===ROUNDY_STREAM_USER_ID)return {messageId};
 }catch(error){
  if(responseStatus(error)!==404)throw error;
 }

 await channel.sendMessage({id:messageId,text:ROUNDY_WELCOME_MESSAGE,user_id:ROUNDY_STREAM_USER_ID});
 return {messageId};
}

export async function hardDeleteMatchChatChannel(channelId:string){
 configuredRichChannels.delete(channelId);
 return streamChatServer().deleteChannels([MATCH_CHAT_CHANNEL_TYPE+':'+channelId],{hard_delete:true});
}
