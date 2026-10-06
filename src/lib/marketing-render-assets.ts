import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {EditorialAssets} from './marketing-visuals';

let fontPromise:Promise<NonNullable<EditorialAssets['fonts']>>|undefined;
function toArrayBuffer(bytes:Uint8Array):ArrayBuffer {const copy=new Uint8Array(bytes.length);copy.set(bytes);return copy.buffer;}
async function fetchFont(url:string):Promise<ArrayBuffer>{
 const response=await fetch(url,{signal:AbortSignal.timeout(8000),redirect:'error',cache:'force-cache'});
 if(!response.ok)throw new Error('FONT_ASSET_UNAVAILABLE');
 const data=await response.arrayBuffer();if(data.byteLength>20*1024*1024)throw new Error('FONT_ASSET_TOO_LARGE');return data;
}
async function fonts():Promise<NonNullable<EditorialAssets['fonts']>>{
 if(!fontPromise)fontPromise=(async()=>{
  const loaded:NonNullable<EditorialAssets['fonts']>=[];
  const noto=await Promise.allSettled([
   fetchFont('https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf'),
   fetchFont('https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Korean/NotoSansCJKkr-Black.otf'),
  ]);
  if(noto[0].status==='fulfilled')loaded.push({name:'Noto Sans KR',data:noto[0].value,weight:400,style:'normal'});
  if(noto[1].status==='fulfilled'){
   loaded.push({name:'Noto Sans KR',data:noto[1].value,weight:700,style:'normal'});
   loaded.push({name:'Noto Sans KR',data:noto[1].value,weight:900,style:'normal'});
  }
  try{
   const regular=await readFile(path.join(process.cwd(),'node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff'));
   loaded.push({name:'DM Sans',data:toArrayBuffer(regular),weight:400,style:'normal'});
  }catch{}
  try{
   const bold=await readFile(path.join(process.cwd(),'node_modules/@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff'));
   loaded.push({name:'DM Sans',data:toArrayBuffer(bold),weight:700,style:'normal'});
   loaded.push({name:'DM Sans',data:toArrayBuffer(bold),weight:900,style:'normal'});
  }catch{}
  return loaded;
 })();
 return fontPromise;
}
export async function loadEditorialAssets():Promise<EditorialAssets>{
 // Photography is intentionally NOT loaded from static/local assets.
 // Every rendered marketing visual set receives fresh, content-specific generated images.
 return {photo:null,photos:[],fonts:await fonts()};
}
