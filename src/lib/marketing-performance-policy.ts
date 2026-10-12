/**
 * Conservative, post-level learning from recorded Meta Insights.
 * No guessed missing values, no post-level nonfollower reach inferred from
 * account metrics, no AI recommendations from small or unstable samples.
 */
export const PERFORMANCE_POLICY_VERSION=1;
export const PERFORMANCE_THRESHOLDS={
 min_post_reach:50,
 topic_total_posts:18,topic_total_reach:8000,topic_cohort_posts:6,topic_cohort_reach:1500,
 reel_total_posts:16,reel_total_reach:6000,reel_cohort_posts:5,reel_cohort_reach:1200
} as const;
export type Format='feed'|'reel';
export type PerformanceRow={
 run_id:string;title:string;format:Format;topic:string;language:'ko'|'en';hook_style:string;
 published_at:string;horizon_hours:number;source:string;
 reach:number|null;views:number|null;shares:number|null;saves:number|null;likes:number|null;comments:number|null;
 media_follows:number|null;media_profile_visits:number|null;
 reel_avg_watch_time_ms:number|null;reel_total_watch_time_ms:number|null;
 duration_seconds:number|null;observed:Record<string,boolean>;
};
export type LearningDecision={
 active:boolean;winner:string|null;reason:string;sample_posts:number;sample_reach:number;
 cohorts:{name:string;posts:number;reach:number;share_rate:number;save_rate:number;mean_score:number;ci_low:number;ci_high:number}[];
};
const integer=(x:unknown,max=1e9):number|null=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=max?x:null;
const nonNegative=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<1e12?v:null;
const validName=(v:unknown)=>typeof v==='string'&&v.length<=100?v:'';
const topicKeys=['conversation_prompt','korea_life','meme_remix','mini_quiz','seoul_dating','seoul_trend',
 'dating_myth','dating_archetype','mbti','trend_research','book_insight'];
const hooks=['curiosity','practical','humor'];

export function observedNumber(value:unknown,observed:unknown):number|null{
 return observed===true?integer(value):null;
}
export function normalizePostInsight(item:Record<string,any>):PerformanceRow|null{
 const m=item.metric||{},reported=m.metric_availability||{};
 const format:Format=item.format==='reel'?'reel':'feed';
 // Legacy rich observations stored reach/views as null when Meta omitted them.
 // Restore DISPLAY of those genuine recorded numbers, but keep observed flags
 // false so they can NEVER teach the AI without the new availability metadata.
 const legacy=m.source==='insights';
 const reach=observedNumber(m.reach,reported.reach)??(legacy?integer(m.reach):null);
 // A genuine zero for shares/saves is meaningful ONLY with explicit flags.
 const value=(name:string,flag=name)=>observedNumber(m[name],reported[flag])??
  (legacy&&['views','reach'].includes(name)?integer(m[name]):null);
 const published=String(item.published_at||'');
 if(!item.run_id||!Number.isFinite(Date.parse(published)))return null;
 return {
  run_id:String(item.run_id),title:String(item.title||'').slice(0,120),format,
  topic:topicKeys.includes(item.topic)?item.topic:'brand',
  language:item.language==='ko'?'ko':'en',
  hook_style:hooks.includes(item.hook_style)?item.hook_style:'',
  published_at:published,horizon_hours:Number(m.horizon_hours||0),source:String(m.source||''),
  reach,views:value('views'),shares:value('shares'),saves:value('saves'),
  likes:value('likes'),comments:value('comments'),
  media_follows:format==='feed'?value('media_follows','follows'):null,
  media_profile_visits:format==='feed'?value('media_profile_visits','profile_visits'):null,
  reel_avg_watch_time_ms:format==='reel'?value('reel_avg_watch_time_ms','ig_reels_avg_watch_time'):null,
  reel_total_watch_time_ms:format==='reel'?value('reel_total_watch_time_ms','ig_reels_video_view_total_time'):null,
  duration_seconds:nonNegative(item.duration_seconds),
  observed:Object.fromEntries(['reach','views','shares','saves','likes','comments','follows','profile_visits',
   'ig_reels_avg_watch_time','ig_reels_video_view_total_time'].map(k=>[k,reported[k]===true]))
 };
}
function usableForLearning(p:PerformanceRow){
 if(p.source!=='insights'||p.horizon_hours!==72||p.reach===null||p.reach<PERFORMANCE_THRESHOLDS.min_post_reach
   ||p.shares===null||p.saves===null||!p.observed.reach||!p.observed.shares||!p.observed.saves)
  return false;
 // Unusually high repeated actions / malformed metrics must not dominate the model.
 if(p.shares>p.reach*.35||p.saves>p.reach*.35)return false;
 if(!['ko','en'].includes(p.language))return false;
 return true;
}
function calcCohort(name:string,rows:PerformanceRow[]){
 const scores=rows.map(p=>(p.shares!*2+p.saves!)/p.reach!);
 const mean=scores.reduce((a,b)=>a+b,0)/Math.max(1,scores.length);
 const variance=scores.length>1
  ?scores.reduce((a,b)=>a+(b-mean)**2,0)/(scores.length-1):1;
 // 95%-style conservative normal interval over POSTS, not reach impressions.
 // This is directional screening; we never claim randomized causal significance.
 const half=1.96*Math.sqrt(Math.max(variance,0.000001)/Math.max(1,scores.length));
 const reach=rows.reduce((a,b)=>a+pReach(b),0);
 const shares=rows.reduce((a,b)=>a+(b.shares||0),0),saves=rows.reduce((a,b)=>a+(b.saves||0),0);
 return {name,posts:rows.length,reach,
  share_rate:reach?Number((shares/reach*100).toFixed(2)):0,
  save_rate:reach?Number((saves/reach*100).toFixed(2)):0,
  mean_score:Number(mean.toFixed(5)),ci_low:Number(Math.max(0,mean-half).toFixed(5)),
  ci_high:Number((mean+half).toFixed(5))};
}
const pReach=(p:PerformanceRow)=>p.reach||0;
export function learnEditorialCohorts(rows:PerformanceRow[],format:Format,language:'ko'|'en'):LearningDecision{
 const relevant=rows.filter(p=>p.format===format&&p.language===language&&usableForLearning(p));
 const thresholds=PERFORMANCE_THRESHOLDS,topic=format==='feed';
 const totalPosts=topic?thresholds.topic_total_posts:thresholds.reel_total_posts;
 const totalReach=topic?thresholds.topic_total_reach:thresholds.reel_total_reach;
 const groupPosts=topic?thresholds.topic_cohort_posts:thresholds.reel_cohort_posts;
 const groupReach=topic?thresholds.topic_cohort_reach:thresholds.reel_cohort_reach;
 const total= relevant.reduce((s,r)=>s+pReach(r),0),map=new Map<string,PerformanceRow[]>();
 for(const row of relevant){
  const key=topic?row.topic:row.hook_style;
  if(!key||topic&&key==='brand')continue;
  map.set(key,[...(map.get(key)||[]),row]);
 }
 const candidates=[...map].filter(([,v])=>v.length>=groupPosts&&v.reduce((s,r)=>s+pReach(r),0)>=groupReach)
  .map(([name,items])=>({summary:calcCohort(name,items),posts:items}))
  .sort((a,b)=>b.summary.mean_score-a.summary.mean_score||a.summary.name.localeCompare(b.summary.name));
 const cohorts=candidates.map(x=>x.summary);
 const basic={sample_posts:relevant.length,sample_reach:total,cohorts};
 const no=(reason:string):LearningDecision=>({...basic,active:false,winner:null,reason});
 if(relevant.length<totalPosts||total<totalReach)
  return no('Insufficient fully observed 72-hour posts/reach; keeping editorial baseline.');
 if(candidates.length<2)return no('At least two independently measured topic/hook cohorts are required.');
 const [winner,runner]=candidates;
 const winningMean=winner.summary.mean_score,runnerMean=runner.summary.mean_score;
 if(winningMean-runnerMean<.003||winningMean<runnerMean*1.2)
  return no('Cohort rates are too close to justify a recommendation.');
 if(winner.summary.ci_low<=runner.summary.ci_high)
  return no('Post-level confidence intervals overlap; no stable leading pattern.');
 // Ensure the candidate does not lead solely because of one lucky posting period.
 const halves=(items:PerformanceRow[])=>{
  const sorted=[...items].sort((a,b)=>a.published_at.localeCompare(b.published_at));
  const mid=Math.floor(sorted.length/2);
  return [sorted.slice(0,mid),sorted.slice(mid)];
 };
 const [wOld,wRecent]=halves(winner.posts),[rOld,rRecent]=halves(runner.posts);
 if([wOld,wRecent,rOld,rRecent].some(x=>x.length<2))return no('Insufficient temporal replication.');
 if(calcCohort('early',wOld).mean_score<=calcCohort('early',rOld).mean_score||
  calcCohort('recent',wRecent).mean_score<=calcCohort('recent',rRecent).mean_score)
  return no('Earlier/recent posting halves disagree about the leading format.');
 return {...basic,active:true,winner:winner.summary.name,
  reason:'A conservative post-level directional signal repeated across earlier/recent halves; not causal proof.'};
}
export function evaluatePerformanceReport(rows:PerformanceRow[]){
 // At most one snapshot per published run. Prefer a complete 72h reading over 24h.
 const latest=new Map<string,PerformanceRow>();
 for(const item of rows){
  const existing=latest.get(item.run_id);
  if(!existing||item.horizon_hours>existing.horizon_hours)latest.set(item.run_id,item);
 }
 const posts=[...latest.values()].sort((a,b)=>b.published_at.localeCompare(a.published_at));
 const eligible=posts.filter(usableForLearning),outliers=posts.filter(p=>
  p.source==='insights'&&p.reach!==null&&p.shares!==null&&p.saves!==null&&!usableForLearning(p)
  &&p.horizon_hours===72&&p.reach>=PERFORMANCE_THRESHOLDS.min_post_reach);
 const topic_ko=learnEditorialCohorts(posts,'feed','ko'),topic_en=learnEditorialCohorts(posts,'feed','en');
 const hooks_ko=learnEditorialCohorts(posts,'reel','ko'),hooks_en=learnEditorialCohorts(posts,'reel','en');
 const audienceNote='Non-follower reach is account-level only. Do not attribute it to any post.';
 return {
  version:PERFORMANCE_POLICY_VERSION,
  totals:{published:posts.length,fully_measured:eligible.length,learning_excluded_outliers:outliers.length,
   missing_or_partial:posts.filter(p=>p.reach===null||p.saves===null||p.shares===null).length},
  learning:{topic:{ko:topic_ko,en:topic_en},reel_hooks:{ko:hooks_ko,en:hooks_en}},
  posts:posts.slice(0,120),account_audience_note:audienceNote
 };
}
export function learnedEditorialGuidance(report:ReturnType<typeof evaluatePerformanceReport>,format:Format,language:'ko'|'en'):string{
 const found=format==='feed'?report.learning.topic[language]:report.learning.reel_hooks[language];
 if(!found.active||!found.winner)return '';
 const allowed=format==='feed'?topicKeys:hooks;
 if(!allowed.includes(found.winner))return '';
 return [
  'OPTIONAL HISTORICAL AUDIENCE SIGNAL; not a factual source or a guarantee:',
  format==='feed'?'Observed topic type':'Observed Reel hook family',found.winner,
  'had stronger SHARE/SAVE engagement across independently published posts of this language.',
  'Evidence:',found.sample_posts,'fully observed published 72h posts,',found.sample_reach,'cumulative post reach.',
  'Preserve diverse angles, avoid duplicate posts, never invent evidence, and do not turn this into an automatic publishing decision.'
 ].join(' ').slice(0,650);
}
