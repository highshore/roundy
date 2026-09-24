'use client';
import { createClient } from './supabase/client';

export async function fileToDataUrl(file:File){return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read this image.'));reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(file);});}
export async function compressProfilePhoto(file:File){
  if(!file.type.startsWith('image/'))throw new Error('Choose an image file.');
  const bitmap=await createImageBitmap(file);const longest=Math.max(bitmap.width,bitmap.height);const scale=Math.min(1,1600/longest);const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw new Error('Could not prepare this image.');context.drawImage(bitmap,0,0,width,height);bitmap.close();
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not compress this image.')),'image/jpeg',.88));
  return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
}
export async function uploadFile(file:File,bucket:'wis-event-images'|'wis-verification-documents') {
  const types:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
  if(!file.size||file.size>5*1024*1024||!types[file.type]||(bucket==='wis-event-images'&&file.type==='application/pdf'))throw new Error('Use JPEG, PNG or WebP (documents also accept PDF), max 5 MB.');
  const client=createClient();const {data:{user}}=await client.auth.getUser();if(!user)throw new Error('Sign in required');
  const key=`${user.id}/${crypto.randomUUID()}.${types[file.type]}`;
  const {error}=await client.storage.from(bucket).upload(key,file,{contentType:file.type,upsert:false});if(error)throw error;
  return bucket==='wis-event-images'?client.storage.from(bucket).getPublicUrl(key).data.publicUrl:key;
}
