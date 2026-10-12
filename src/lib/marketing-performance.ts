import 'server-only';
import {createServiceRoleClient} from './supabase/service';
import {
 evaluatePerformanceReport,learnedEditorialGuidance,normalizePostInsight,
 type PerformanceRow,type Format
} from './marketing-performance-policy';

type DB=ReturnType<typeof createServiceRoleClient>;
type Row=Record<string,any>;
const ok=<T>(x:{data:T;error:any}):T=>{if(x.error)throw x.error;return x.data;};

/** Read only published Meta runs + saved official observations. Never accesses a Meta token. */
export async function readInstagramPerformance(db:DB){
 const cutoff=new Date(Date.now()-90*86400000).toISOString();
 const runs=ok(await db.from('marketing_runs')
  .select('id,status,channel,external_id,finished_at,snapshot').eq('channel','instagram')
  .eq('status','sent').not('external_id','is',null).gte('finished_at',cutoff)
  .order('finished_at',{ascending:false}).limit(180)) as Row[];
 const ids=runs.map(x=>x.id),empty=evaluatePerformanceReport([]);
 if(!ids.length)return empty;
 const [insightData,reelData]=await Promise.all([
  db.from('instagram_post_insights')
   .select('run_id,horizon_hours,source,reach,views,shares,saves,likes,comments,media_follows,media_profile_visits,reel_avg_watch_time_ms,reel_total_watch_time_ms,metric_availability,captured_at')
   .in('run_id',ids).order('horizon_hours',{ascending:false}).limit(450),
  db.from('instagram_reel_drafts').select('id,marketing_run_id,creative_plan,duration_seconds').in('marketing_run_id',ids).limit(160)
 ]);
 const insights=ok(insightData) as Row[],reels=ok(reelData) as Row[];
 const runMap=new Map(runs.map(r=>[r.id,r])),reelMap=new Map(reels.map(r=>[r.marketing_run_id,r]));
 const normalized:PerformanceRow[]=[];
 for(const metric of insights){
  const run=runMap.get(metric.run_id);if(!run)continue;
  const snapshot=(run.snapshot||{}) as Row,reel=reelMap.get(run.id);
  const format=snapshot.media_kind==='reel'?'reel':'feed';
  const row=normalizePostInsight({
   run_id:run.id,published_at:run.finished_at,metric,format,
   title:String(snapshot.title||snapshot.name||''),
   language:snapshot.content_language||'ko',
   topic:String(snapshot.growth_topic_type||snapshot.content_pillar||''),
   hook_style:String(snapshot.hook_style||''),
   duration_seconds:reel?.duration_seconds||snapshot.video_duration_seconds||null
  });
  if(row)normalized.push(row);
 }
 // Include all confirmed published runs, even when Meta insights haven't arrived
 // yet. They appear as missing rather than disappearing from the dashboard.
 const withObservations=new Set(normalized.map(x=>x.run_id));
 for(const run of runs){
  if(withObservations.has(run.id))continue;
  const snapshot=(run.snapshot||{}) as Row,reel=reelMap.get(run.id);
  const pending=normalizePostInsight({
   run_id:run.id,published_at:run.finished_at,
   metric:{horizon_hours:0,source:'pending',metric_availability:{}},
   format:snapshot.media_kind==='reel'?'reel':'feed',
   title:String(snapshot.title||snapshot.name||''),
   language:snapshot.content_language||'ko',
   topic:String(snapshot.growth_topic_type||snapshot.content_pillar||''),
   hook_style:String(snapshot.hook_style||''),
   duration_seconds:reel?.duration_seconds||snapshot.video_duration_seconds||null
  });
  if(pending)normalized.push(pending);
 }
 return evaluatePerformanceReport(normalized);
}
export async function readPerformanceAccountOverview(db:DB){
 const [rows,attempts]=await Promise.all([
  db.from('instagram_audience_reach_snapshots')
   .select('snapshot_date,status,reached_followers,reached_nonfollowers,total_reach,captured_at')
   .eq('status','captured').order('snapshot_date',{ascending:false}).limit(45),
  db.from('instagram_audience_reach_snapshots')
   .select('snapshot_date,status,error_code').order('snapshot_date',{ascending:false}).limit(1)
 ]);
 const valid=ok(rows) as Row[],last=(ok(attempts) as Row[])[0]||null;
 // Display only actual account-level samples. Never fabricate per-post split.
 const data=valid[0]||null;
 return {
  source:'Meta Instagram account insights — reach broken down by follow_type',
  scope:'account_daily_not_post',
  snapshot_date:data?.snapshot_date||null,
  reached_followers:data?.reached_followers??null,
  reached_nonfollowers:data?.reached_nonfollowers??null,
  total_reach:data?.total_reach??null,
  capture_status:last?.status||'not_attempted',
  last_attempt:last?.snapshot_date||null,
  history:valid.slice().reverse().map(x=>({
   date:x.snapshot_date,followers:x.reached_followers,nonfollowers:x.reached_nonfollowers,
   reach:x.total_reach
  }))
 };
}
export async function performanceEditorialHint(db:DB,format:Format,language:'ko'|'en'){
 const data=await readInstagramPerformance(db);
 return learnedEditorialGuidance(data,format,language);
}
