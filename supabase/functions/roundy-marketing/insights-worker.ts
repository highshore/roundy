import {parseMediaSignals,parseAccountAudienceReach} from './insight-parser.ts';

type GraphCall=(path:string)=>Promise<any>;
type ServiceClient={from:(table:string)=>any};
export async function mediaPerformanceObserved(graph:GraphCall,mediaId:string,isReel=false){
 // Published post ID comes only from a confirmed Meta publishing run.
 const basic=await graph(mediaId+'?fields=like_count,comments_count').catch(()=>({}));
 const attempts=['views,reach,likes,comments,saved,shares,total_interactions',
  'reach,likes,comments,saved,shares,total_interactions'];
 let rich:any=null;
 for(const metric of attempts){rich=await graph(mediaId+'/insights?metric='+metric).catch(()=>null);if(rich)break;}
 let optional:any=null;
 if(!isReel&&rich){
  optional=await graph(mediaId+'/insights?metric=follows,profile_visits').catch(()=>null);
  if(!optional){
   const [followOnly,visitsOnly]=await Promise.all([
    graph(mediaId+'/insights?metric=follows').catch(()=>null),
    graph(mediaId+'/insights?metric=profile_visits').catch(()=>null)
   ]);
   optional={data:[...(followOnly?.data||[]),...(visitsOnly?.data||[])]};
  }
 }
 const watch=isReel&&rich?await graph(mediaId+'/insights?metric=ig_reels_avg_watch_time,ig_reels_video_view_total_time')
  .catch(()=>null):null;
 const parsed=parseMediaSignals(rich,optional,watch,isReel),m=parsed.values,available=parsed.observed;
 const baseLike=Number(basic?.like_count),baseComment=Number(basic?.comments_count);
 const likes=m.likes??(Number.isSafeInteger(baseLike)&&baseLike>=0?baseLike:0);
 const comments=m.comments??(Number.isSafeInteger(baseComment)&&baseComment>=0?baseComment:0);
 // Legacy NOT NULL shares/saves require zero placeholders. Availability flags
 // unambiguously mark them as MISSING, excluding that row from any AI learning.
 const saves=m.saved??0,shares=m.shares??0,reach=m.reach,views=m.views;
 const complete=Boolean(rich&&available.reach&&available.shares&&available.saved);
 const score=complete?((likes+comments*2+saves*3+shares*4)/Math.max(1,reach!))*1000+
  Math.log10(Math.max(1,reach!)+1)*10:0;
 return {
  source:complete?'insights':'basic',views,reach,likes,comments,saves,shares,
  total_interactions:m.total_interactions??likes+comments+saves+shares,
  performance_score:Number(score.toFixed(4)),
  reel_avg_watch_time_ms:m.ig_reels_avg_watch_time===null?null:Math.round(m.ig_reels_avg_watch_time),
  reel_total_watch_time_ms:m.ig_reels_video_view_total_time===null?null:Math.round(m.ig_reels_video_view_total_time),
  media_follows:m.follows,media_profile_visits:m.profile_visits,
  metric_availability:{...available,nonfollower_reach:false,source:'official_meta_media_insights'}
 };
}
export async function captureAccountAudienceReach(
 service:ServiceClient,graph:GraphCall,userId:string,date:string
){
 // Optional account-level follow_type breakdown is NEVER per-post reach.
 if(!userId)return false;
 const {data:claim,error}=await service.from('instagram_audience_reach_snapshots').upsert({
  snapshot_date:date,status:'unavailable',error_code:'ATTEMPT_STARTED',
  attempted_at:new Date().toISOString()
 },{onConflict:'snapshot_date',ignoreDuplicates:true}).select('snapshot_date');
 if(error)throw error;if(!claim?.length)return false;
 try{
  const raw=await graph(userId+'/insights?metric=reach&period=day&metric_type=total_value&breakdown=follow_type');
  const measured=parseAccountAudienceReach(raw);
  if(!measured)throw new Error('AUDIENCE_FOLLOW_TYPE_BREAKDOWN_UNAVAILABLE');
  const {error:saveError}=await service.from('instagram_audience_reach_snapshots').update({
   status:'captured',...measured,error_code:null,captured_at:new Date().toISOString()
  }).eq('snapshot_date',date);
  if(saveError)throw saveError;
  return true;
 }catch(error){
  const code=(error instanceof Error?error.message:'AUDIENCE_METRICS_UNAVAILABLE').slice(0,100);
  await service.from('instagram_audience_reach_snapshots').update({
   status:'unavailable',error_code:code
  }).eq('snapshot_date',date);
  return false;
 }
}
