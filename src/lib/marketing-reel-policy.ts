export const REEL_BUCKET='marketing-reels';
export const REEL_MAX_BYTES=40*1024*1024;
export const REEL_PREVIEW_SECONDS=1800;
export const REEL_MIN_SECONDS=3;
export const REEL_MAX_SECONDS=90;
export const REEL_PILLARS=['seoul','culture','humor','people','brand'] as const;
export const REEL_HOOKS=['curiosity','practical','humor'] as const;
export type ReelPillar=typeof REEL_PILLARS[number];
export type ReelHook=typeof REEL_HOOKS[number];
type Input=Record<string,unknown>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const checkText=(value:unknown,name:string,min:number,max:number)=>{
 if(typeof value!=='string')throw new Error('INVALID_REEL_'+name.toUpperCase());
 const text=value.trim();
 if(text.length<min||text.length>max)throw new Error('INVALID_REEL_'+name.toUpperCase());
 return text;
};
export function parseReelCopy(input:unknown){
 if(!input||typeof input!=='object')throw new Error('INVALID_REEL_INPUT');
 const v=input as Input;
 const pillar=String(v.pillar||''),hookStyle=String(v.hook_style||''),language=String(v.language||'');
 if(!(REEL_PILLARS as readonly string[]).includes(pillar))throw new Error('INVALID_REEL_PILLAR');
 if(!(REEL_HOOKS as readonly string[]).includes(hookStyle))throw new Error('INVALID_REEL_HOOK_STYLE');
 if(!['ko','en'].includes(language))throw new Error('INVALID_REEL_LANGUAGE');
 return {
  title:checkText(v.title,'title',3,100),
  hook_text:checkText(v.hook_text,'hook',3,110),
  caption:checkText(v.caption,'caption',5,2000),
  pillar:pillar as ReelPillar,
  hook_style:hookStyle as ReelHook,
  language:language as 'ko'|'en'
 };
}
export function assertReelPath(reelId:string,path:unknown){
 if(!uuid.test(reelId)||typeof path!=='string'||!new RegExp('^'+reelId+'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.mp4$','i').test(path))
  throw new Error('INVALID_REEL_STORAGE_PATH');
 return path;
}
export function parseReelVideoMetadata(input:unknown){
 if(!input||typeof input!=='object')throw new Error('INVALID_REEL_VIDEO');
 const v=input as Input;
 const duration=Number(v.duration_seconds),width=Number(v.width),height=Number(v.height),size=Number(v.file_size);
 if(!Number.isFinite(duration)||duration<REEL_MIN_SECONDS||duration>REEL_MAX_SECONDS)throw new Error('REEL_DURATION_MUST_BE_3_TO_90_SECONDS');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<360||height<640||width>1920||height>1920||Math.abs(width/height-9/16)>.045)throw new Error('REEL_MUST_BE_PORTRAIT_9_16');
 if(!Number.isInteger(size)||size<=0||size>REEL_MAX_BYTES)throw new Error('REEL_FILE_TOO_LARGE');
 const source=String(v.source_kind||'');
 if(!['upload','storyboard'].includes(source))throw new Error('INVALID_REEL_SOURCE');
 return {duration_seconds:duration,width,height,file_size:size,source_kind:source};
}
export async function assertMp4File(file:File){
 if(file.type!=='video/mp4'||file.size<32||file.size>REEL_MAX_BYTES)throw new Error('REEL_MP4_FILE_REQUIRED');
 const bytes=new Uint8Array(await file.slice(0,96).arrayBuffer());
 // ISO Base Media File Format: MP4 signature ("ftyp") at byte offset 4.
 if(String.fromCharCode(...bytes.slice(4,8))!=='ftyp')throw new Error('INVALID_MP4_SIGNATURE');
 return true;
}
export type ReelMetric={
 hook_style:ReelHook;pillar:ReelPillar;reach:number;views:number;shares:number;saves:number;
 avg_watch_ms?:number|null;duration_seconds?:number|null;
};
export function evaluateReelCohorts(rows:ReelMetric[]){
 const eligible=rows.filter(r=>Number.isFinite(r.reach)&&r.reach>=30);
 const byHook=REEL_HOOKS.map(hook=>{
  const posts=eligible.filter(r=>r.hook_style===hook);
  const reach=posts.reduce((n,r)=>n+r.reach,0);
  const shares=posts.reduce((n,r)=>n+Math.max(0,r.shares),0),saves=posts.reduce((n,r)=>n+Math.max(0,r.saves),0);
  const withWatch=posts.filter(r=>r.avg_watch_ms!=null&&Number(r.duration_seconds)>0);
  const watchRate=withWatch.length
   ?withWatch.reduce((n,r)=>n+Math.min(1,Math.max(0,Number(r.avg_watch_ms)/(Number(r.duration_seconds)*1000)))*r.reach,0)/
    withWatch.reduce((n,r)=>n+r.reach,0):null;
  return {hook_style:hook,posts:posts.length,reach,shares,saves,share_rate:reach?Math.round(shares/reach*10000)/100:0,
   save_rate:reach?Math.round(saves/reach*10000)/100:0,watch_rate:watchRate===null?null:Math.round(watchRate*1000)/10};
 });
 const totalReach=eligible.reduce((n,r)=>n+r.reach,0);
 const learned=eligible.length>=12&&totalReach>=6000&&byHook.every(h=>h.posts>=3&&h.reach>=500);
 const ranked=[...byHook].sort((a,b)=>(b.share_rate*3+b.save_rate*2)-(a.share_rate*3+a.save_rate*2));
 return {hooks:byHook,learning_ready:learned,sample:{posts:eligible.length,reach:totalReach},
  recommended_hook:learned?ranked[0].hook_style:null,
  note:learned?'Experimental signal only: avoid attributing follower gains to a single Reel.':'Insufficient reach/format diversity to recommend one hook style.'};
}
