'use client';
import { createClient } from './supabase/client';

const PROFILE_PHOTO_TARGET_BYTES=1.8*1024*1024;
const PROFILE_PHOTO_MAX_EDGE=2048;
const PROFILE_PHOTO_INPUT_LIMIT=25*1024*1024;

function canvasToBlob(canvas:HTMLCanvasElement,type:string,quality:number){
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not optimize this image. Please try another photo.')),type,quality));
}

async function decodeImage(file:File){
  const url=URL.createObjectURL(file);
  try{
    const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('This image format is not supported by your browser. Please choose another photo.'));
      img.src=url;
    });
    return image;
  }catch(error){
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function compressProfilePhoto(file:File){
  if(!file.size||file.size>PROFILE_PHOTO_INPUT_LIMIT||!file.type.startsWith('image/'))throw new Error('Please choose an image up to 25 MB.');
  if(file.size<=PROFILE_PHOTO_TARGET_BYTES&&['image/jpeg','image/png','image/webp'].includes(file.type))return file;

  const image=await decodeImage(file);
  try{
    const sourceWidth=image.naturalWidth;
    const sourceHeight=image.naturalHeight;
    if(!sourceWidth||!sourceHeight)throw new Error('Could not read this image. Please try another photo.');

    let scale=Math.min(1,PROFILE_PHOTO_MAX_EDGE/Math.max(sourceWidth,sourceHeight));
    for(let resizePass=0;resizePass<4;resizePass++){
      const width=Math.max(1,Math.round(sourceWidth*scale));
      const height=Math.max(1,Math.round(sourceHeight*scale));
      const canvas=document.createElement('canvas');
      canvas.width=width;
      canvas.height=height;
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('Image optimization is not available in this browser.');
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,width,height);
      ctx.drawImage(image,0,0,width,height);

      for(const quality of [0.86,0.78,0.7,0.62,0.54]){
        const blob=await canvasToBlob(canvas,'image/jpeg',quality);
        if(blob.size<=PROFILE_PHOTO_TARGET_BYTES){
          const name=(file.name.replace(/\.[^.]+$/,'')||'profile-photo')+'.jpg';
          return new File([blob],name,{type:'image/jpeg',lastModified:Date.now()});
        }
      }
      scale*=0.8;
    }
    throw new Error('This photo is too large to optimize. Please choose a smaller image.');
  }finally{
    URL.revokeObjectURL(image.src);
  }
}

export function fileToDataUrl(file:File){
  return new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(new Error('Could not read this image.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadFile(file:File,bucket:'wis-event-images'|'wis-verification-documents') {
  const types:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
  if(!file.size||file.size>5*1024*1024||!types[file.type]||(bucket==='wis-event-images'&&file.type==='application/pdf'))throw new Error('Use JPEG, PNG or WebP (documents also accept PDF), max 5 MB.');
  const client=createClient();const {data:{user}}=await client.auth.getUser();if(!user)throw new Error('Sign in required');
  const key=`${user.id}/${crypto.randomUUID()}.${types[file.type]}`;
  const {error}=await client.storage.from(bucket).upload(key,file,{contentType:file.type,upsert:false});if(error)throw error;
  return bucket==='wis-event-images'?client.storage.from(bucket).getPublicUrl(key).data.publicUrl:key;
}
