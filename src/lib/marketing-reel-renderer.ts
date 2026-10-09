'use client';
import {REEL_MAX_BYTES} from './marketing-reel-policy';

/** A native MP4 if the browser exposes a video/mp4 MediaRecorder.
 * MediaRecorder cannot guarantee the same codec across browsers.
 * In browsers without H.264 MP4 support the UI offers manual MP4 upload.
 */
export function mp4RecorderMime(){
 if(typeof MediaRecorder==='undefined')return null;
 return ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs="avc1.42E01E"','video/mp4']
  .find(m=>MediaRecorder.isTypeSupported(m))||null;
}
const PALETTE=['#253b33','#617d6b','#b15f5c'];
const SCENE_SECONDS=3,SCENE_COUNT=3;
function lines(context:CanvasRenderingContext2D,text:string,maxWidth:number){
 const words=text.includes(' ')?text.trim().split(/\s+/):Array.from(text.trim());
 const result:string[]=[];let current='';
 for(const word of words){
  const next=(current?(text.includes(' ')?current+' '+word:current+word):word);
  if(context.measureText(next).width>maxWidth&&current){result.push(current);current=word;}
  else current=next;
 }
 if(current)result.push(current);
 return result.slice(0,5);
}
function cropDraw(context:CanvasRenderingContext2D,image:ImageBitmap,width:number,height:number){
 const scale=Math.max(width/image.width,height/image.height),
  drawWidth=image.width*scale,drawHeight=image.height*scale;
 context.drawImage(image,(width-drawWidth)/2,(height-drawHeight)/2,drawWidth,drawHeight);
}
export async function createStoryReel(
 storyTexts:[string,string,string],photographs:File[],onProgress:(percent:number)=>void
):Promise<File>{
 const mime=mp4RecorderMime();
 if(!mime)throw new Error('MP4_BROWSER_ENCODER_UNAVAILABLE');
 if(storyTexts.some(text=>text.trim().length<3||text.trim().length>110))throw new Error('REEL_STORY_TEXT_REQUIRED');
 const images=await Promise.all(photographs.slice(0,3).map(file=>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)
   throw new Error('REEL_PHOTO_MUST_BE_JPEG_PNG_WEBP');
  return createImageBitmap(file);
 }));
 const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280;
 const context=canvas.getContext('2d',{alpha:false});
 if(!context){images.forEach(b=>b.close());throw new Error('REEL_CANVAS_UNAVAILABLE');}
 const video=canvas.captureStream(30);
 let audio:AudioContext|null=null;
 let source:ConstantSourceNode|null=null;
 let stream:MediaStream=video;
 try{
  // A silent AAC track makes the MP4 acceptable to more publishing endpoints.
  audio=new AudioContext();
  const destination=audio.createMediaStreamDestination(),gain=audio.createGain();
  gain.gain.value=0;
  source=audio.createConstantSource();
  source.connect(gain);gain.connect(destination);source.start();
  await audio.resume();
  stream=new MediaStream([...video.getVideoTracks(),...destination.stream.getAudioTracks()]);
 }catch{
  await audio?.close().catch(()=>{});audio=null;source=null;
 }
 const chunks:BlobPart[]=[];
 let recorder:MediaRecorder;
 try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3200000});}
 catch(error){stream.getTracks().forEach(t=>t.stop());images.forEach(b=>b.close());await audio?.close();throw error;}
 let raf=0;
 const ended=new Promise<void>((resolve,reject)=>{
  recorder.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data);};
  recorder.onerror=()=>reject(new Error('REEL_MP4_ENCODING_FAILED'));
  recorder.onstop=()=>resolve();
 });
 try{
  let start=performance.now();
  const draw=(stamp:number)=>{
   const elapsed=Math.max(0,stamp-start),total=SCENE_SECONDS*SCENE_COUNT*1000;
   const scene=Math.min(SCENE_COUNT-1,Math.floor(elapsed/(SCENE_SECONDS*1000)));
   const sceneElapsed=elapsed%(SCENE_SECONDS*1000);
   const w=canvas.width,h=canvas.height;
   context.fillStyle=PALETTE[scene];context.fillRect(0,0,w,h);
   const photo=images[scene]||images[0];
   if(photo){
    context.save();cropDraw(context,photo,w,h);context.restore();
    const overlay=context.createLinearGradient(0,0,0,h);
    overlay.addColorStop(0,'rgba(0,0,0,.40)');overlay.addColorStop(.5,'rgba(0,0,0,.15)');
    overlay.addColorStop(1,'rgba(0,0,0,.75)');
    context.fillStyle=overlay;context.fillRect(0,0,w,h);
   }else{
    const overlay=context.createLinearGradient(0,0,w,h);
    overlay.addColorStop(0,'rgba(255,255,255,.12)');overlay.addColorStop(1,'rgba(0,0,0,.28)');
    context.fillStyle=overlay;context.fillRect(0,0,w,h);
    context.fillStyle='rgba(255,255,255,.15)';
    context.beginPath();context.arc(570,350+scene*210,260,0,Math.PI*2);context.fill();
   }
   context.fillStyle='#fffdfa';context.font='700 54px Arial,sans-serif';context.fillText('Roundy',56,108);
   context.font='500 27px Arial,sans-serif';context.fillText('SEOUL NOTES',56,150);
   context.font='700 66px Arial,"Noto Sans KR",sans-serif';
   const textLines=lines(context,storyTexts[scene],600);
   const appear=Math.min(1,sceneElapsed/400);
   context.globalAlpha=.65+.35*appear;
   textLines.forEach((line,i)=>context.fillText(line,56,725+i*82,606));
   context.globalAlpha=1;
   context.fillStyle='rgba(255,255,255,.34)';context.fillRect(56,1180,608,5);
   context.fillStyle='#ffe8cf';context.fillRect(56,1180,608*(scene+sceneElapsed/3000)/SCENE_COUNT,5);
   context.font='500 27px Arial,sans-serif';context.fillStyle='#fffdfa';
   context.fillText('@roundy.meet',56,1232);
   onProgress(Math.min(100,Math.round(elapsed/total*100)));
   if(elapsed<total&&recorder.state==='recording')raf=requestAnimationFrame(draw);
   else if(recorder.state==='recording')recorder.stop();
  };
  // Draw a frame BEFORE the recorder starts to avoid a blank opening.
  recorder.start(1000);raf=requestAnimationFrame(draw);
  await ended;
  const file=new File(chunks,'roundy-reel-'+Date.now()+'.mp4',{type:'video/mp4'});
  if(file.size<=300||file.size>REEL_MAX_BYTES)throw new Error('REEL_MP4_OUTPUT_INVALID_SIZE');
  const header=new Uint8Array(await file.slice(0,12).arrayBuffer());
  if(String.fromCharCode(...header.slice(4,8))!=='ftyp')throw new Error('REEL_OUTPUT_IS_NOT_MP4');
  onProgress(100);
  return file;
 }finally{
  cancelAnimationFrame(raf);
  if(recorder.state==='recording')recorder.stop();
  stream.getTracks().forEach(track=>track.stop());
  images.forEach(bitmap=>bitmap.close());
  try{source?.stop();}catch{}
  await audio?.close().catch(()=>{});
 }
}
