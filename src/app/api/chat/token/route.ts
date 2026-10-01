import { NextResponse } from 'next/server';
import { isMemberUser } from '@/lib/auth-user';
import { createClient } from '@/lib/supabase/server';
import { StreamChatConfigurationError, streamChatApiKey, streamUserId, streamUserToken } from '@/lib/stream-chat.server';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});

export async function GET(){
 try{
  const supabase=await createClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user)return json({error:'Sign in required'},401);
  if(!isMemberUser(user))return json({error:'Member sign-in required'},403);
  return json({apiKey:streamChatApiKey(),token:streamUserToken(user.id),streamUserId:streamUserId(user.id)});
 }catch(error){
  if(error instanceof StreamChatConfigurationError)return json({error:error.message},503);
  return json({error:'Could not refresh your chat connection.'},503);
 }
}
