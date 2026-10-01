import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/service';
import { sendRoundyWelcomeNotification } from '@/lib/stream-chat.server';

function errorText(error:unknown){
 return error instanceof Error?error.message.slice(0,500):'Welcome delivery failed';
}

/**
 * Auth callbacks invoke this after a successful session exchange. The database
 * queue is populated only for accounts created after the welcome feature ships,
 * so existing members are never silently enrolled in a delayed bulk send.
 */
export async function deliverRoundyWelcome(userId:string){
 const service=createServiceRoleClient();
 const {data:claimed,error:claimError}=await service.rpc('service_claim_roundy_welcome_notification',{p_user:userId});
 if(claimError)throw new Error(claimError.message);
 if(!claimed)return false;

 try{
  const {messageId}=await sendRoundyWelcomeNotification(userId);
  const {error:completeError}=await service.rpc('service_complete_roundy_welcome_notification',{p_user:userId,p_stream_message_id:messageId});
  if(completeError)throw new Error(completeError.message);
  return true;
 }catch(error){
  // A retry can safely resume: Stream uses a deterministic message ID and the
  // queue's next claim will verify that message before sending again.
  try{await service.rpc('service_release_roundy_welcome_notification',{p_user:userId,p_error:errorText(error)});}catch{/* Preserve the original delivery failure. */}
  throw error;
 }
}
