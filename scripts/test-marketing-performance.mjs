import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=file=>readFileSync(''+file,'utf8');
function load(file,modules={}){
 const mod={exports:{}},js=ts.transpileModule(read(file),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
 }).outputText;
 vm.runInNewContext(js,{exports:mod.exports,module:mod,require:name=>modules[name]??require(name),
  Set,Map,Math,Number,JSON,Date,URL,console},{filename:file});
 return mod.exports;
}
const parser=load('supabase/functions/roundy-marketing/insight-parser.ts');
const policy=load('src/lib/marketing-performance-policy.ts');
let n=0;const check=f=>{f();n++;};
const sample={data:[
 {name:'reach',values:[{value:220}]},{name:'views',total_value:{value:280}},
 {name:'shares',values:[{value:13}]},{name:'saved',values:[{value:8}]},
 {name:'likes',values:[{value:23}]},{name:'comments',values:[{value:4}]}
]};
check(()=>assert.equal(parser.readMediaMetric(sample,'reach'),220));
check(()=>assert.equal(parser.readMediaMetric(sample,'views'),280));
check(()=>assert.equal(parser.readMediaMetric(sample,'saved'),8));
check(()=>assert.equal(parser.readMediaMetric(sample,'follows'),null));
check(()=>assert.equal(parser.readMediaMetric({data:[{name:'reach',values:[{value:'NaN'}]}]},'reach'),null));
check(()=>assert.equal(parser.readMediaMetric({data:[{name:'reach',values:[{value:-4}]}]},'reach'),null));
const feed=parser.parseMediaSignals(sample,{data:[{name:'follows',total_value:{value:3}},{name:'profile_visits',total_value:{value:9}}]},null,false);
check(()=>assert.equal(feed.values.follows,3));
check(()=>assert.equal(feed.values.profile_visits,9));
check(()=>assert.equal(feed.observed.follows,true));
check(()=>assert.equal(feed.values.ig_reels_avg_watch_time,null));
const reel=parser.parseMediaSignals(sample,null,{data:[{name:'ig_reels_avg_watch_time',values:[{value:5100}]},{name:'ig_reels_video_view_total_time',values:[{value:1020000}]}]},true);
check(()=>assert.equal(reel.values.ig_reels_avg_watch_time,5100));
check(()=>assert.equal(reel.values.follows,null));
check(()=>assert.equal(reel.observed.follows,false));
const audience={data:[{name:'reach',total_value:{value:240,breakdowns:[{
 dimension_keys:['follow_type'],results:[{dimension_values:['FOLLOWER'],value:55},
 {dimension_values:['NON_FOLLOWER'],value:185}]
}]}}]};
check(()=>assert.equal(parser.parseAccountAudienceReach(audience).reached_nonfollowers,185));
check(()=>assert.equal(parser.parseAccountAudienceReach(audience).reached_followers,55));
check(()=>assert.equal(parser.parseAccountAudienceReach({data:[{name:'reach',total_value:{value:240}}]}),null));
check(()=>assert.equal(parser.parseAccountAudienceReach({data:[{name:'reach',total_value:{value:240,breakdowns:[{
 dimension_keys:['follow_type'],results:[{dimension_values:['FOLLOWER'],value:55}]
}]}}]}),null));
check(()=>assert.equal(parser.parseAccountAudienceReach({data:[{name:'reach',total_value:{value:350,breakdowns:[{
 dimension_keys:['follow_type'],results:[{dimension_values:['FOLLOWER'],value:55},
 {dimension_values:['NON_FOLLOWER'],value:185}]
}]}}]}),null));
const meta=(values={})=>({horizon_hours:72,source:'insights',reach:200,views:260,shares:10,saves:8,
 media_follows:2,media_profile_visits:4,reel_avg_watch_time_ms:4200,reel_total_watch_time_ms:420000,
 metric_availability:{reach:true,views:true,shares:true,saved:true,follows:true,profile_visits:true,
 ig_reels_avg_watch_time:true,ig_reels_video_view_total_time:true},...values});
const raw=(id,kind='feed',type='conversation_prompt',lang='ko',metric=meta(),hour=0)=>({
 run_id:id,published_at:new Date(Date.UTC(2026,8,1)+hour*3600000).toISOString(),
 title:'Example editorial',format:kind,topic:type,language:lang,hook_style:'curiosity',
 metric,duration_seconds:20
});
const asPost=x=>policy.normalizePostInsight(x);
const measured=asPost(raw('r1'));
check(()=>assert.equal(measured.media_follows,2));
check(()=>assert.equal(measured.media_profile_visits,4));
check(()=>assert.equal(measured.reach,200));
check(()=>assert.equal(measured.shares,10));
check(()=>assert.equal(asPost(raw('r2','reel')).media_follows,null));
check(()=>assert.equal(asPost(raw('r2','reel')).reel_avg_watch_time_ms,4200));
check(()=>assert.equal(asPost(raw('r2','reel')).duration_seconds,20));
check(()=>assert.equal(asPost(raw('r3','feed','korea_life','en',meta({metric_availability:{}}))).shares,null));
check(()=>assert.equal(asPost(raw('r4','feed','korea_life','en',meta({shares:0,saves:0}))).shares,0));
check(()=>assert.equal(asPost(raw('r5','feed','korea_life','en',meta({reach:null}))).reach,null));
check(()=>assert.equal(policy.observedNumber(0,true),0));
check(()=>assert.equal(policy.observedNumber(0,false),null));
check(()=>assert.equal(policy.observedNumber(Infinity,true),null));
// Use posts as the unit, not repeated 24h/72h observations or view impressions.
// 36 published posts; strong topic outperforms in BOTH time halves, low variance.
const posts=[];
for(let i=0;i<36;i++){
 const topic=i%2?'conversation_prompt':'korea_life';
 const high=i%2===1;
 const metric=meta({reach:300,shares:high?(22+i%3):1+i%2,saves:high?(18+i%2):1});
 posts.push(asPost(raw('feed'+i,'feed',topic,'ko',metric,i*18)));
}
const report=policy.evaluatePerformanceReport(posts);
check(()=>assert.equal(report.learning.topic.ko.active,true));
check(()=>assert.equal(report.learning.topic.ko.winner,'conversation_prompt'));
check(()=>assert.equal(report.learning.topic.en.active,false));
check(()=>assert.equal(report.learning.reel_hooks.en.active,false));
check(()=>assert.match(policy.learnedEditorialGuidance(report,'feed','ko'),/conversation_prompt/));
check(()=>assert.equal(policy.learnedEditorialGuidance(report,'feed','en'),''));
check(()=>assert.equal(report.totals.published,36));
check(()=>assert.equal(report.totals.fully_measured,36));
const limited=policy.evaluatePerformanceReport(posts.slice(0,11));
check(()=>assert.equal(limited.learning.topic.ko.active,false));
check(()=>assert.equal(policy.learnedEditorialGuidance(limited,'feed','ko'),''));
// Missing official observation must never be treated as zero or influence learning.
const missing=posts.map((p,i)=>i<20?{...p,shares:null,observed:{...p.observed,shares:false}}:p);
check(()=>assert.equal(policy.evaluatePerformanceReport(missing).learning.topic.ko.active,false));
// Exclude suspicious spam/outliers; do not choose viral one-post accidents.
const outlier={...posts[0],run_id:'outlier',shares:400,saves:150};
const flagged=policy.evaluatePerformanceReport([...posts,outlier]);
check(()=>assert.equal(flagged.totals.learning_excluded_outliers,1));
check(()=>assert.equal(flagged.learning.topic.ko.winner,'conversation_prompt'));
// Deduplicate 24 and 72 hour snapshots in all reporting and learning.
const earlier={...posts[0],horizon_hours:24,shares:99};
check(()=>assert.equal(policy.evaluatePerformanceReport([...posts,earlier]).totals.published,36));
// Temporal disagreement prevents feedback even with large total reach.
const reversal=[];
for(let i=0;i<36;i++){
 const first=i<18,high=(i%2===1)===first;
 const kind=i%2===1?'conversation_prompt':'korea_life';
 reversal.push(asPost(raw('flip'+i,'feed',kind,'ko',meta({reach:300,shares:high?25:1,saves:high?20:1}),i*12)));
}
check(()=>assert.equal(policy.evaluatePerformanceReport(reversal).learning.topic.ko.active,false));
// Reel hook learning is language-specific and never borrows Feed reach.
const reels=[];
for(let i=0;i<36;i++){
 const strong=i%2===0,hook=strong?'practical':'humor';
 const item=asPost(raw('reel'+i,'reel','brand','en',meta({reach:340,shares:strong?30:1,saves:strong?18:2}),i*12));
 item.hook_style=hook;reels.push(item);
}
const reelReport=policy.evaluatePerformanceReport(reels);
check(()=>assert.equal(reelReport.learning.reel_hooks.en.active,true));
check(()=>assert.equal(reelReport.learning.reel_hooks.en.winner,'practical'));
check(()=>assert.equal(reelReport.learning.reel_hooks.ko.active,false));
check(()=>assert.match(policy.learnedEditorialGuidance(reelReport,'reel','en'),/practical/));
// Integrity: missing per-post nonfollower fields / account attribution.
check(()=>assert.match(report.account_audience_note,/account-level only/));
check(()=>assert.equal('nonfollower_reach' in posts[0],false));
const front=read('src/components/admin-marketing-performance.tsx');
const worker=read('supabase/functions/roundy-marketing/index.ts');
const collector=read('supabase/functions/roundy-marketing/insights-worker.ts');
const migration=read('supabase/migrations/20261012103000_instagram_performance_learning.sql');
const reel=read('src/lib/marketing-reels.ts');
const editorial=read('src/lib/marketing-editorial.ts');
const creative=read('src/lib/marketing-reel-creative-service.ts');
check(()=>assert.match(front,/AdminMarketingPerformance/));
check(()=>assert.match(front,/비팔로워 도달 \(계정 전체 기준\)/));
check(()=>assert.match(front,/—/));
check(()=>assert.match(front,/marketing-performance-scroll/));
check(()=>assert.match(worker,/captureAccountAudienceReach/));
check(()=>assert.match(worker,/media_follows:performance\.media_follows/));
check(()=>assert.match(collector,/metric_availability:/));
check(()=>assert.match(collector,/source:complete\?'insights':'basic'/));
check(()=>assert.match(migration,/instagram_audience_reach_snapshots/));
check(()=>assert.match(migration,/metric_availability jsonb/));
check(()=>assert.match(migration,/media_follows integer/));
check(()=>assert.doesNotMatch(migration,/update public\.instagram_post_insights|delete from public\.(marketing_runs|instagram_post_drafts|instagram_reel_drafts)/i));
check(()=>assert.match(reel,/readInstagramPerformance\(service\)/));
check(()=>assert.match(editorial,/performanceEditorialHint\(db,'feed'/));
check(()=>assert.match(creative,/performanceEditorialHint\(db,'reel'/));
console.log('PASS '+n+' Instagram Performance Stage 5 assertions: official observed metrics, account-only nonfollower, null vs zero, 72h de-duplication, outlier suppression, per-language cohort stability and guarded prompt feedback.');
