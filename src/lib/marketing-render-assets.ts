import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {EditorialAssets} from './marketing-visuals';

let fontPromise:Promise<NonNullable<EditorialAssets['fonts']>>|undefined;
function toArrayBuffer(bytes:Uint8Array):ArrayBuffer {const copy=new Uint8Array(bytes.length);copy.set(bytes);return copy.buffer;}
async function localFont(relative:string,signature:string):Promise<ArrayBuffer>{
 let bytes:Buffer;
 try{bytes=await readFile(path.join(process.cwd(),relative));}
 catch{throw new Error('FONT_ASSET_UNAVAILABLE');}
 if(bytes.length<100||bytes.length>20*1024*1024||bytes.subarray(0,4).toString()!==signature)
  throw new Error('FONT_ASSET_INVALID');
 return toArrayBuffer(bytes);
}
async function fonts():Promise<NonNullable<EditorialAssets['fonts']>>{
 if(!fontPromise)fontPromise=(async()=>{
  // These files are verified and bundled at build time, never fetched in a paid job.
  const [regular,black,latin,latinBold]=await Promise.all([
   localFont('.cache/marketing-fonts/NotoSansCJKkr-Regular.otf','OTTO'),
   localFont('.cache/marketing-fonts/NotoSansCJKkr-Black.otf','OTTO'),
   localFont('node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff','wOFF'),
   localFont('node_modules/@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff','wOFF')
  ]);
  return [
   {name:'Noto Sans KR',data:regular,weight:400 as const,style:'normal' as const},
   {name:'Noto Sans KR',data:black,weight:700 as const,style:'normal' as const},
   {name:'Noto Sans KR',data:black,weight:900 as const,style:'normal' as const},
   {name:'DM Sans',data:latin,weight:400 as const,style:'normal' as const},
   {name:'DM Sans',data:latinBold,weight:700 as const,style:'normal' as const},
   {name:'DM Sans',data:latinBold,weight:900 as const,style:'normal' as const}
  ];
 })().catch(error=>{fontPromise=undefined;throw error;});
 return fontPromise;
}
export async function loadEditorialAssets():Promise<EditorialAssets>{
 return {photo:null,photos:[],fonts:await fonts()};
}
