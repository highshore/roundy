'use client';
import type {ReelPlan} from './marketing-reel-creative';
import {mp4RecorderMime} from './marketing-reel-renderer';
import {REEL_MAX_BYTES} from './marketing-reel-policy';

export type TimelineMedia={kind:'licensed_video'|'approved_photo'|'ai_image';preview_url:string;review_status:'approved'};
type Loaded={image?:ImageBitmap;video?:HTMLVideoElement;objectUrl?:string;kind:string};
function drawCover(ctx:CanvasRenderingContext2D,source:CanvasImageSource,w:number,h:number,iw:number,ih:number){
 const scale=Math.max(w/iw,h/ih),width=iw*scale,height=ih*scale;
 ctx.drawImage(source,(w-width)/2,(h-height)/2,width,height);
}
function fitLines(ctx:CanvasRenderingContext2D,title:string,width:number):string[]{
 const tokens=title.includes(' ')?title.trim().split(/\s+/):Array.from(title);
 const lines:string[]=[];let line='';
 for(const token of tokens){
  const next=line?(title.includes(' ')?line+' '+token:line+token):token;
  if(ctx.measureText(next).width>width&&line){lines.push(line);line=token;}else line=next;
  if(ctx.measureText(line).width>width)throw new Error('REEL_OVERLAY_TEXT_TOO_WIDE');
 }
 if(line)lines.push(line);
 if(lines.length>3)throw new Error('REEL_OVERLAY_NEEDS_SHORTER_COPY');
 return lines;
}
/** 
 * Local, privacy-preserving composer. Approved source footage actually plays
 * behind captions, unlike a static thumbnail simulation. No auto-publication.
 * Browsers without native MP4 recording require a finished external MP4 upload.
 */
export async function createTimelineReel(
 plan:ReelPlan,
 assets:Record<string,TimelineMedia>,
 onProgress:(n:number)=>void
):Promise<File>{
 const mime=mp4RecorderMime();
 if(!mime)throw new Error('MP4_BROWSER_ENCODER_UNAVAILABLE');
 if(plan.version!==1||plan.scenes.length<3||plan.scenes.length>6||plan.scenes[0].duration_sec!==3||
  plan.duration_seconds<15||plan.duration_seconds>30)throw new Error('REEL_TIMELINE_INVALID');
 const loaded=new Map<string,Loaded>();
 const freshUrls:string[]=[];
 let audio:AudioContext|null=null,silentSource:ConstantSourceNode|null=null,raf=0,stream:MediaStream|null=null,recorder:MediaRecorder|null=null;
 try{
  for(const scene of plan.scenes){
   if(!scene.asset_id||loaded.has(scene.asset_id))continue;
   const media=assets[scene.asset_id];
   if(!media||media.review_status!=='approved'||!media.preview_url)
    throw new Error('REEL_APPROVED_ASSET_REQUIRED');
   const response=await fetch(media.preview_url,{credentials:'omit',cache:'no-store'});
   if(!response.ok)throw new Error('REEL_ASSET_DOWNLOAD_FAILED');
   const blob=await response.blob();
   if(blob.size>40*1024*1024)throw new Error('REEL_MEDIA_TOO_LARGE');
   if(media.kind==='licensed_video'){
    if(blob.type!=='video/mp4')throw new Error('REEL_SOURCE_MP4_REQUIRED');
    const url=URL.createObjectURL(blob);freshUrls.push(url);
    const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
    video.src=url;
    await new Promise<void>((resolve,reject)=>{
     const guard=setTimeout(()=>reject(new Error('REEL_SOURCE_VIDEO_TIMEOUT')),15000);
     video.onloadeddata=()=>{clearTimeout(guard);resolve();};
     video.onerror=()=>{clearTimeout(guard);reject(new Error('REEL_SOURCE_VIDEO_DECODE_FAILED'));};
     video.load();
    });
    loaded.set(scene.asset_id,{video,objectUrl:url,kind:media.kind});
   }else{
    if(!['image/jpeg','image/png','image/webp'].includes(blob.type))
     throw new Error('REEL_SOURCE_IMAGE_REQUIRED');
    const img=await createImageBitmap(blob);
    loaded.set(scene.asset_id,{image:img,kind:media.kind});
   }
  }
  const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('REEL_CANVAS_UNAVAILABLE');
  // Precompute all overlays. Fail closed rather than hiding unreadable lines.
  const captions=plan.scenes.map(scene=>{
   ctx.font='700 60px Arial,"Noto Sans KR",sans-serif';
   return fitLines(ctx,scene.overlay_text,604);
  });
  const video=canvas.captureStream(30);
  stream=video;
  try{
   audio=new AudioContext();
   const dest=audio.createMediaStreamDestination(),gain=audio.createGain();
   gain.gain.value=0;
   silentSource=audio.createConstantSource();silentSource.connect(gain);gain.connect(dest);
   silentSource.start();await audio.resume();
   stream=new MediaStream([...video.getVideoTracks(),...dest.stream.getAudioTracks()]);
  }catch{await audio?.close().catch(()=>{});audio=null;silentSource=null;}
  const chunks:BlobPart[]=[];
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3200000});
  const stopped=new Promise<void>((resolve,reject)=>{
   recorder!.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   recorder!.onstop=()=>resolve();
   recorder!.onerror=()=>reject(new Error('REEL_RECORDING_FAILED'));
  });
  const stops:number[]=[];let accumulated=0;
  for(const item of plan.scenes){accumulated+=item.duration_sec*1000;stops.push(accumulated);}
  let active=-1;
  const drawFrame=(elapsed:number)=>{
   const idx=Math.max(0,stops.findIndex(end=>elapsed<end)),scene=plan.scenes[Math.min(idx,plan.scenes.length-1)];
   if(idx!==active){
    const previous=active>=0?loaded.get(plan.scenes[active].asset_id||''):null;
    previous?.video?.pause();
    active=idx;
    const next=scene.asset_id?loaded.get(scene.asset_id):null;
    if(next?.video){next.video.currentTime=0;void next.video.play().catch(()=>{});}
   }
   const w=720,h=1280;
   const palettes=['#2c4236','#415b4a','#2e4235','#506a55','#34463a','#243c31'];
   ctx.fillStyle=palettes[idx%palettes.length];ctx.fillRect(0,0,w,h);
   const entry=scene.asset_id?loaded.get(scene.asset_id):null;
   if(entry?.image)drawCover(ctx,entry.image,w,h,entry.image.width,entry.image.height);
   if(entry?.video&&entry.video.readyState>=2)
    drawCover(ctx,entry.video,w,h,entry.video.videoWidth,entry.video.videoHeight);
   if(entry){
    const gradient=ctx.createLinearGradient(0,0,0,h);
    gradient.addColorStop(0,'rgba(10,18,13,.45)');
    gradient.addColorStop(.48,'rgba(10,18,13,.10)');
    gradient.addColorStop(1,'rgba(10,18,13,.77)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
   }
   ctx.fillStyle='#fffdf8';ctx.font='700 48px Arial,sans-serif';ctx.fillText('Roundy',50,98);
   ctx.font='500 23px Arial,sans-serif';ctx.fillText('SEOUL / SOCIAL',51,136);
   const text=captions[idx];
   ctx.font='700 60px Arial,"Noto Sans KR",sans-serif';ctx.fillStyle='#ffffff';
   const top=890-(text.length-1)*39;
   text.forEach((line,n)=>ctx.fillText(line,54,top+n*80,607));
   ctx.fillStyle='#ff6666';ctx.fillRect(54,1152,612*elapsed/(plan.duration_seconds*1000),6);
   ctx.fillStyle='#ffffff';ctx.font='500 25px Arial,sans-serif';
   ctx.fillText('@roundy.meet',54,1215);
  };
  drawFrame(0);
  const start=performance.now();
  recorder.start(1000);
  const tick=(stamp:number)=>{
   const elapsed=Math.max(0,stamp-start);
   drawFrame(Math.min(elapsed,plan.duration_seconds*1000-1));
   onProgress(Math.min(99,Math.floor(elapsed/(plan.duration_seconds*1000)*100)));
   if(elapsed<plan.duration_seconds*1000&&recorder?.state==='recording')
    raf=requestAnimationFrame(tick);
   else if(recorder?.state==='recording')recorder.stop();
  };
  raf=requestAnimationFrame(tick);
  await stopped;
  const file=new File(chunks,'roundy-storyboard-'+Date.now()+'.mp4',{type:'video/mp4'});
  if(file.size<300||file.size>REEL_MAX_BYTES)throw new Error('REEL_MP4_OUTPUT_INVALID');
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  if(String.fromCharCode(...bytes.slice(4,8))!=='ftyp')throw new Error('REEL_MP4_SIGNATURE_INVALID');
  onProgress(100);
  return file;
 }finally{
  cancelAnimationFrame(raf);
  if(recorder?.state==='recording')recorder.stop();
  stream?.getTracks().forEach(track=>track.stop());
  for(const v of loaded.values()){v.video?.pause();v.image?.close();}
  for(const url of freshUrls)URL.revokeObjectURL(url);
  try{silentSource?.stop();}catch{}
  await audio?.close().catch(()=>{});
 }
}
