import {readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type {EditorialAssets} from './marketing-visuals';

let photoPromise:Promise<string|null>|undefined;
let fontPromise:Promise<NonNullable<EditorialAssets['fonts']>>|undefined;
function toArrayBuffer(bytes:Uint8Array):ArrayBuffer {const copy=new Uint8Array(bytes.length);copy.set(bytes);return copy.buffer;}
async function fetchFont(url:string):Promise<ArrayBuffer>{
 const response=await fetch(url,{signal:AbortSignal.timeout(8000),redirect:'error',cache:'force-cache'});
 if(!response.ok)throw new Error('FONT_ASSET_UNAVAILABLE');
 const data=await response.arrayBuffer();if(data.byteLength>6*1024*1024)throw new Error('FONT_ASSET_TOO_LARGE');return data;
}
async function fonts():Promise<NonNullable<EditorialAssets['fonts']>>{
 // Fixed Google Fonts upstreams, never a URL from an admin prompt or generated content.
 // Failures use Next/OG's sans-serif fallback, not another paid generation.
 if(!fontPromise)fontPromise=(async()=>{
  const loaded:NonNullable<EditorialAssets['fonts']>=[];
  const gothic=await Promise.allSettled([
   fetchFont('https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf'),
   fetchFont('https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-ExtraBold.ttf'),
  ]);
  if(gothic[0].status==='fulfilled')loaded.push({name:'Roundy Gothic',data:gothic[0].value,weight:400,style:'normal'});
  if(gothic[1].status==='fulfilled'){
   loaded.push({name:'Roundy Gothic',data:gothic[1].value,weight:900,style:'normal'});
   loaded.push({name:'Roundy Gothic',data:gothic[1].value,weight:700,style:'normal'});
  }
  try{const dm=await readFile(path.join(process.cwd(),'node_modules/@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff'));loaded.push({name:'DM Sans',data:toArrayBuffer(dm),weight:700,style:'normal'});}catch{}
  return loaded;
 })();
 return fontPromise;
}
async function photo():Promise<string|null>{
 if(!photoPromise)photoPromise=(async()=>{
  try{
   const data=await readFile(path.join(process.cwd(),'public/images/discovery-hero-v2-poster.webp'));
   const jpg=await sharp(data).resize({width:1080,withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
   return 'data:image/jpeg;base64,'+jpg.toString('base64');
  }catch{return null;}
 })();
 return photoPromise;
}
export async function loadEditorialAssets():Promise<EditorialAssets>{
 const [brandPhoto,brandFonts]=await Promise.all([photo(),fonts()]);return {photo:brandPhoto,fonts:brandFonts};
}
