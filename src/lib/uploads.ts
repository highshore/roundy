'use client';
import { createClient } from './supabase/client';
export async function uploadFile(file:File,bucket:'wis-event-images'|'wis-verification-documents') {
  const types:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
  if(!file.size||file.size>5*1024*1024||!types[file.type]||(bucket==='wis-event-images'&&file.type==='application/pdf'))throw new Error('Use JPEG, PNG or WebP (documents also accept PDF), max 5 MB.');
  const client=createClient();const {data:{user}}=await client.auth.getUser();if(!user)throw new Error('Sign in required');
  const key=`${user.id}/${crypto.randomUUID()}.${types[file.type]}`;
  const {error}=await client.storage.from(bucket).upload(key,file,{contentType:file.type,upsert:false});if(error)throw error;
  return bucket==='wis-event-images'?client.storage.from(bucket).getPublicUrl(key).data.publicUrl:key;
}
