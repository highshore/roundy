import 'server-only';
import {createServiceRoleClient} from './supabase/service';
import {
 aggregateGrowthSignals,BASE_GROWTH_WEIGHTS,GROWTH_LEARNING_THRESHOLDS,
 growthPillarForTopic,growthWeekPlan,recommendGrowthWeights,
 type GrowthSignal,type GrowthWeights
} from './marketing-growth-planner';

type Row=Record<string,any>;
type DB=ReturnType<typeof createServiceRoleClient>;
const checked=<T extends {error:unknown}>(response:T):T=>{if(response.error)throw response.error;return response;};
const todayKst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export async function readGrowthEvidence(db:DB){
 const cutoff=new Date(Date.now()-90*86400000).toISOString();
 const [draftResult,insightResult]=await Promise.all([
  db.from('instagram_post_drafts').select('id,marketing_run_id,draft_kind,growth_topic_type,content_language,draft_date,published_at').eq('status','published').gte('published_at',cutoff).order('published_at',{ascending:false}).limit(300),
  db.from('instagram_post_insights').select('run_id,horizon_hours,source,reach,views,likes,comments,saves,shares,captured_at').gte('captured_at',cutoff).order('horizon_hours',{ascending:false}).limit(650)
 ]);
 const drafts=(checked(draftResult).data||[]) as Row[],insights=(checked(insightResult).data||[]) as Row[];
 // A 72-hour reading replaces a 24-hour reading; both must never be added together.
 const measured=new Map<string,Row>();
 for(const snapshot of insights){
  const key=String(snapshot.run_id||'');
  if(!key||measured.has(key)||snapshot.source!=='insights'||!(Number(snapshot.reach)>0))continue;
  measured.set(key,snapshot);
 }
 const signals:GrowthSignal[]=[];
 const byTopic=new Map<string,{topic:string;language:string;posts:number;reach:number;shares:number;saves:number}>();
 for(const draft of drafts){
  const metric=measured.get(String(draft.marketing_run_id||''));
  if(!metric)continue;
  const reach=Math.max(0,Number(metric.reach)||0);
  const shared=Math.max(0,Number(metric.shares)||0),saved=Math.max(0,Number(metric.saves)||0);
  signals.push({pillar:growthPillarForTopic(draft.growth_topic_type,draft.draft_kind),reach,
   shares:shared,saves:saved,comments:Number(metric.comments)||0,likes:Number(metric.likes)||0});
  const topic=String(draft.growth_topic_type||'brand'),language=draft.content_language==='en'?'en':'ko',key=topic+':'+language;
  const existing=byTopic.get(key)||{topic,language,posts:0,reach:0,shares:0,saves:0};
  existing.posts++;existing.reach+=reach;existing.shares+=shared;existing.saves+=saved;byTopic.set(key,existing);
 }
 const pillars=aggregateGrowthSignals(signals);
 const learning=recommendGrowthWeights(pillars);
 return {weights:learning.weights,pillars,learning:learning.learning,
  learning_reason:learning.reason,thresholds:GROWTH_LEARNING_THRESHOLDS,
  totals:{published:drafts.length,measured:signals.length,measured_reach:signals.reduce((sum,s)=>sum+s.reach,0),missing_reach:drafts.length-signals.length},
  topics:[...byTopic.values()].map(row=>({...row,share_rate:row.reach?Number((row.shares/row.reach*100).toFixed(2)):0,
   save_rate:row.reach?Number((row.saves/row.reach*100).toFixed(2)):0})).sort((a,b)=>b.reach-a.reach)};
}
export async function growthLearningWeights(db:DB):Promise<GrowthWeights>{
 const evidence=await readGrowthEvidence(db);
 return evidence.learning?evidence.weights:BASE_GROWTH_WEIGHTS;
}
export async function growthOverview(){
 const db=createServiceRoleClient();
 const [settings,evidence,followerRows]=await Promise.all([
  db.from('marketing_automation_settings').select('growth_mode_enabled,trend_radar_enabled,daily_instagram_enabled').eq('singleton',true).single(),
  readGrowthEvidence(db),
  db.from('instagram_follower_snapshots').select('snapshot_date,followers_count,captured_at').order('snapshot_date',{ascending:false}).limit(90)
 ]);
 const config=checked(settings).data as Row;
 const followerHistory=(checked(followerRows).data||[]) as Row[];
 const latest=followerHistory[0]||null;
 // Compare to the most recent snapshot on/before the 7- or 30-day reference date.
 const followerChange=(days:number)=>{
  if(!latest)return null;
  const reference=new Date(Date.parse(String(latest.snapshot_date)+'T00:00:00Z')-days*86400000).toISOString().slice(0,10);
  const historical=followerHistory.find(row=>String(row.snapshot_date)<=reference);
  return historical?Number(latest.followers_count)-Number(historical.followers_count):null;
 };
 const followers={
  current:latest?Number(latest.followers_count):null,
  snapshot_date:latest?.snapshot_date||null,
  change_7d:followerChange(7),change_30d:followerChange(30),
  snapshots:followerHistory.slice().reverse().map(row=>({date:row.snapshot_date,count:row.followers_count}))
 };
 return {...evidence,followers,enabled:config.growth_mode_enabled===true,automation_enabled:config.daily_instagram_enabled===true,
  trend_radar_enabled:config.trend_radar_enabled===true,
  week_plan:growthWeekPlan(todayKst(),evidence.weights),
  manual_reels_note:'Reel candidates are editorial recommendations only. Existing Instagram publisher currently uploads JPEG posts/carousels; video production and publishing require a separate reviewed workflow.',
  metrics_note:'Follower totals are captured once daily when the Instagram profile API permits. Profile-to-follow conversion and post-level acquisition attribution remain unavailable; do not interpret share/save rates as new followers.'};
}
