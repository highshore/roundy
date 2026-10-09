/**
 * Minimal ISO BMFF/MP4 structural preflight for admin-uploaded short Reels.
 * This checks actual bytes instead of trusting client-reported dimensions.
 * Meta still performs the authoritative transcoding/codec validation.
 */
type Box={type:string;start:number;data:number;end:number};
const name=(v:Uint8Array,start:number)=>String.fromCharCode(...v.slice(start,start+4));
const int32=(view:DataView,start:number)=>view.getUint32(start,false);
function boxes(bytes:Uint8Array,start:number,end:number):Box[]{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),result:Box[]=[];
 let at=start;
 while(at+8<=end&&result.length<10000){
  let size=int32(view,at),header=8;
  if(size===1){
   if(at+16>end)throw new Error('INVALID_MP4_ATOM_SIZE');
   const n=view.getBigUint64(at+8,false);
   if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('INVALID_MP4_ATOM_SIZE');
   size=Number(n);header=16;
  }else if(size===0)size=end-at;
  if(size<header||at+size>end)throw new Error('INVALID_MP4_ATOM_SIZE');
  result.push({type:name(bytes,at+4),start:at,data:at+header,end:at+size});
  at+=size;
 }
 return result;
}
const find=(xs:Box[],kind:string)=>xs.find(x=>x.type===kind);
export function inspectReelMp4(bytes:Uint8Array){
 if(bytes.length<300||bytes.length>40*1024*1024)throw new Error('INVALID_MP4_SIZE');
 const root=boxes(bytes,0,bytes.length);
 const ftyp=find(root,'ftyp'),moov=find(root,'moov');
 if(!ftyp||ftyp.start>32||!moov)throw new Error('MP4_FTYP_MOOV_REQUIRED');
 const top=boxes(bytes,moov.data,moov.end),mvhd=find(top,'mvhd');
 if(!mvhd)throw new Error('INVALID_MP4_MOVIE_HEADER');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),v=bytes[mvhd.data];
 let duration:number|null=null;
 if(v===0&&mvhd.data+20<=mvhd.end){
  const scale=int32(view,mvhd.data+12),ticks=int32(view,mvhd.data+16);
  if(scale>0&&ticks>0&&ticks!==0xffffffff)duration=ticks/scale;
 }else if(v===1&&mvhd.data+32<=mvhd.end){
  const scale=int32(view,mvhd.data+20),ticks=view.getBigUint64(mvhd.data+24,false);
  if(scale>0&&ticks>0n&&ticks<BigInt(Number.MAX_SAFE_INTEGER))duration=Number(ticks)/scale;
 }
 let width=0,height=0,codec='';
 for(const track of top.filter(x=>x.type==='trak')){
  const trackBoxes=boxes(bytes,track.data,track.end),media=find(trackBoxes,'mdia'),header=find(trackBoxes,'tkhd');
  if(!media||!header)continue;
  const mediaBoxes=boxes(bytes,media.data,media.end),handler=find(mediaBoxes,'hdlr');
  if(!handler||handler.data+12>handler.end||name(bytes,handler.data+8)!=='vide')continue;
  if(header.end-header.data<12)throw new Error('INVALID_MP4_VIDEO_TRACK');
  width=view.getUint32(header.end-8,false)/65536;
  height=view.getUint32(header.end-4,false)/65536;
  const minf=find(mediaBoxes,'minf'),stbl=minf?find(boxes(bytes,minf.data,minf.end),'stbl'):undefined;
  const stsd=stbl?find(boxes(bytes,stbl.data,stbl.end),'stsd'):undefined;
  if(stsd&&stsd.data+16<=stsd.end)codec=name(bytes,stsd.data+12);
  break;
 }
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<360||height<640||
   width>1920||height>1920||Math.abs(width/height-9/16)>.045)throw new Error('REEL_MP4_VIDEO_TRACK_NOT_9_16');
 if(!['avc1','avc3','hvc1','hev1'].includes(codec))throw new Error('REEL_CODEC_H264_OR_HEVC_REQUIRED');
 if(duration!==null&&(!Number.isFinite(duration)||duration<3||duration>90))throw new Error('REEL_DURATION_MUST_BE_3_TO_90_SECONDS');
 return {width,height,duration_seconds:duration===null?null:Number(duration.toFixed(2)),codec,bytes:bytes.length,
  duration_verified:duration!==null};
}
