import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

// Load only the pure planner. Tests make no live provider, Meta or Supabase calls.
const source=readFileSync(new URL('../src/lib/marketing-growth-planner.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
vm.runInNewContext(js,{module:{exports},exports});
const {BASE_GROWTH_WEIGHTS,GROWTH_PILLARS,aggregateGrowthSignals,recommendGrowthWeights,planGrowthSlot,growthWeekPlan,growthPillarForTopic}=exports;
assert.equal(growthPillarForTopic('korea_life','growth_carousel'),'culture');
assert.equal(growthPillarForTopic('seoul_trend','growth_carousel'),'seoul');
assert.equal(growthPillarForTopic('meme_remix','growth_carousel'),'humor');
assert.equal(growthPillarForTopic(null,'brand'),'brand');
const anchor=Date.parse('2026-01-01T00:00:00Z');
const slots=Array.from({length:100},(_,i)=>planGrowthSlot(new Date(anchor+i*86400000).toISOString().slice(0,10)));
const counts=Object.fromEntries(GROWTH_PILLARS.map(p=>[p,slots.filter(s=>s.pillar===p).length]));
for(const p of GROWTH_PILLARS)assert.equal(counts[p],BASE_GROWTH_WEIGHTS[p],p+' 100-day allocation');
const languages=growthWeekPlan('2026-10-09').map(s=>s.language);
assert.equal(languages.filter(l=>l==='en').length,5);
assert.equal(languages.filter(l=>l==='ko').length,2);
assert.deepEqual(planGrowthSlot('2026-10-09'),planGrowthSlot('2026-10-09'));
assert.throws(()=>planGrowthSlot('2026-02-30'),/INVALID_GROWTH_DATE/);
assert.equal(slots.every(s=>s.pillar==='brand'?s.content_mode==='prelaunch':s.content_mode==='growth_carousel'),true);
const weak=aggregateGrowthSignals([{pillar:'humor',reach:3,shares:1,saves:0,comments:0,likes:1}]);
assert.equal(recommendGrowthWeights(weak).learning,false,'a 3-person reach is not a growth signal');
const strong=GROWTH_PILLARS.flatMap((pillar,i)=>Array.from({length:pillar==='brand'?5:8},()=>({
 pillar,reach:900,shares:i===2?30:5,saves:i===0?20:4,comments:1,likes:6
})));
const trained=recommendGrowthWeights(aggregateGrowthSignals(strong));
assert.equal(trained.learning,true,'learning should unlock with sustained evidence across all cohorts');
assert.ok(trained.weights.humor>BASE_GROWTH_WEIGHTS.humor,'high-sharing humor can gain limited allocation');
assert.ok(Math.abs(GROWTH_PILLARS.reduce((n,p)=>n+trained.weights[p],0)-100)<1e-6,'weights sum to 100');
assert.equal(trained.weights.brand,15,'brand exposure cap');
const broken=strong.filter(s=>s.pillar!=='culture');
assert.equal(recommendGrowthWeights(aggregateGrowthSignals(broken)).learning,false,'no extrapolation from untested pillar');
const generation=readFileSync(new URL('../src/lib/marketing-generation.ts',import.meta.url),'utf8');
const automation=readFileSync(new URL('../src/lib/marketing-content-automation.ts',import.meta.url),'utf8');
assert.match(automation,/growth_mode_enabled/);
assert.match(automation,/startContentWorkflow/);assert.match(automation,/korea_life/);
// Regression: every topic accepted by the generator, including the culture slot,
// must be persisted by the production DB constraint. Test against real Postgres
// semantics in memory; no Supabase, paid AI, or publishing calls.
const topicMigration=readFileSync(new URL('../supabase/migrations/20261013025000_allow_korea_life_growth_topic.sql',import.meta.url),'utf8');
const topicsDecl=generation.match(/const topics=\[([^\]]+)\]/);
const extrasDecl=generation.match(/const allowedTopics=\[\.\.\.topics,([^\]]+)\]/);
assert.ok(topicsDecl&&extrasDecl,'Generation topic allowlist must remain inspectable');
const generatorTopics=[
 ...[...topicsDecl[1].matchAll(/'([a-z_]+)'/g)].map(m=>m[1]),
 ...[...extrasDecl[1].matchAll(/'([a-z_]+)'/g)].map(m=>m[1])
];
const constraintValues=topicMigration.match(/add constraint instagram_post_drafts_growth_topic_type_check\s+check\s*\(\s*growth_topic_type is null or growth_topic_type in\s*\(([\s\S]*?)\)\s*\)/i);
assert.ok(constraintValues,'DB must enforce the explicit growth topic allowlist');
const databaseTopics=[...constraintValues[1].matchAll(/'([a-z_]+)'/g)].map(m=>m[1]);
assert.deepEqual([...new Set(databaseTopics)].sort(),[...new Set(generatorTopics)].sort(),
 'Generation validator and persisted DB growth topic allowlists must agree');
for(const slot of slots)assert.ok(slot.topic_type===null||databaseTopics.includes(slot.topic_type),
 'Scheduled topic '+slot.topic_type+' must be supported by the database');
const {PGlite}=await import('@electric-sql/pglite');
const constraintDb=new PGlite();
try {
 await constraintDb.exec("create table public.instagram_post_drafts (growth_topic_type text); insert into public.instagram_post_drafts values ('seoul_trend'),(null);");
 await constraintDb.exec(topicMigration);
 for(const topic of generatorTopics)await constraintDb.query('insert into public.instagram_post_drafts(growth_topic_type) values ($1)',[topic]);
 await assert.rejects(
  constraintDb.query('insert into public.instagram_post_drafts(growth_topic_type) values ($1)',['unrecognized_topic']),
  /check constraint/,
  'Unrecognized topic must still be rejected'
 );
 const rows=await constraintDb.query('select count(*)::int as count from public.instagram_post_drafts');
 assert.equal(rows.rows[0].count,generatorTopics.length+2,'Existing drafts remain preserved');
}finally{await constraintDb.close();}
const publisher=readFileSync(new URL('../supabase/functions/roundy-marketing/index.ts',import.meta.url),'utf8');
assert.match(publisher,/Number\(row\.reach\)>=50/);
assert.match(publisher,/total>=15&&totalReach>=3000/);
assert.match(publisher,/async function captureFollowerSnapshot/);
assert.match(publisher,/instagram_follower_snapshot_attempts/);
assert.match(publisher,/ignoreDuplicates:true/);
assert.match(publisher,/await captureFollowerSnapshot\(\)\.catch\(/);
const growth=readFileSync(new URL('../src/lib/marketing-growth.ts',import.meta.url),'utf8');
assert.match(growth,/instagram_follower_snapshots/);
assert.match(growth,/change_7d:followerChange\(7\)/);
assert.match(growth,/change_30d:followerChange\(30\)/);
console.log('Instagram growth engine tests passed: balanced schedule, bilingual slots, confidence gating, feedback weights, safe trend fallback, database topic consistency, existing draft preservation, follower snapshot guard and tiny-reach time guard.');
