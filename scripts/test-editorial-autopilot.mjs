import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const load=(path,requireFn)=>{
 const exports={};
 const compiled=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(compiled,{exports,require:requireFn,Date,Intl,URL,Set,console,Promise},{filename:path});
 return exports;
};
const src=load('src/lib/editorial-studio-policy.ts',()=>({}));
const auto=load('src/lib/marketing-editorial-autopilot.ts',name=>{
 if(name==='server-only')return {};
 if(name==='./editorial-studio-policy')return src;
 if(name==='./supabase/service')return {};
 if(name==='./marketing-generation')return {marketingProviderRequest:()=>{throw new Error('NO_NETWORK_IN_TEST');}};
 throw new Error('Unexpected import: '+name);
});
const link1='https://instagram.com/reel/ABC123';
const link2='https://visitseoul.net/places/2026-guide';
const link3='https://example.com/seoul-dates';
const response={output:[
 {type:'web_search_call',status:'completed',action:{sources:[{url:link1},{url:link2}]}},
 {type:'message',content:[{type:'output_text',text:'Cited local guide: '+link3,annotations:[{url_citation:{url:link3}}]}]}
]};
const links=auto.verifiedEditorialLinks(response);
assert.equal(links.size,3);
assert.ok(links.has(link1));
assert.equal(auto.normalizeEditorialEvidenceUrl('http://localhost:3000/foo'),null);
const story=[
 {title:'첫 만남에서 벌어진 일',body:'같은 상황을 서로 다른 사람이 어떻게 받아들였는지 설명합니다.'},
 {title:'서로 다른 선택',body:'첫 번째 생각과 두 번째 생각을 구체적인 차이로 비교합니다.'},
 {title:'당신의 생각은?',body:'상황을 정리하고 독자가 스스로 판단할 수 있게 질문합니다.'}
];
const candidate=(pillar,url,support,title,summary)=>({
 pillar,source_url:url,supporting_url:support,title,creator:'Public creator',summary,
 angle:'첫 만남에서 우리가 실제로 고민하는 상황에 대해 이야기합니다.',
 why_it_hooks:'누구나 겪는 상황에서 다른 결론이 나오는 순간을 보여줘 공감을 일으킵니다.',
 hooks:['소개팅에서 무심코 지나친 행동','상대방의 눈에는 다르게 보였다','첫 데이트는 이렇게 달라집니다'],
 storyboard:story
});
const data={candidates:[
 candidate('dating_opinions',link1,link1,'소개팅 대화에서 생긴 두 가지 오해','소개팅의 자연스러운 대화에서 서로 다르게 해석한 행동에 대한 공개 의견입니다.'),
 candidate('seoul_guides',link2,link3,'서울 데이트 장소 가이드 추천','서울에서 편안하게 대화할 수 있는 데이트 장소와 방문 계획을 비교한 가이드입니다.'),
 candidate('dating_opinions','https://fake.example/reel/not-indexed',link1,'검증되지 않은 가짜 콘텐츠','가짜 소스를 사용하여 근거가 없는 주장에 대한 소개를 제공합니다.')
]};
const result=auto.validateEditorialCandidates(data,links,[],4);
assert.equal(result.length,2,'requires provider-indexed URLs');
assert.equal(new Set(result.map(x=>x.source.pillar)).size,2,'retains pillar diversity');
const old=auto.validateEditorialCandidates(data,links,['소개팅 대화에서 생긴 두 가지 오해'],4);
assert.equal(old.length,1,'never regenerate existing headline topic');
const onlyOne=auto.validateEditorialCandidates({candidates:[candidate('seoul_guides',link2,link2,'서울에서 처음 만나는 데이트 이야기','데이트 코스를 소개하는 글이고 출처 검증이 한 곳뿐입니다.')]},links,[],4);
assert.equal(onlyOne.length,0,'Seoul guide requires independent corroboration');
const badModel=auto.validateEditorialCandidates({candidates:[{...data.candidates[0],hooks:['same','same','same']}]},links,[],4);
assert.equal(badModel.length,0,'generic repeated hooks cannot enter review');

const core=fs.readFileSync('supabase/migrations/20261015000100_editorial_source_studio.sql','utf8');
const migration=fs.readFileSync('supabase/migrations/20261015090000_editorial_autopilot.sql','utf8');
const dispatcher=fs.readFileSync('supabase/migrations/20261015090100_editorial_autopilot_cron.sql','utf8');
assert.match(dispatcher,/cron\.schedule/);
assert.doesNotMatch(dispatcher,/publish|media_publish/i);
assert.match(migration,/enable row level security/g);
assert.match(migration,/revoke all on public\.marketing_editorial_autopilot_control/);
assert.match(migration,/grant execute on function public\.reserve_marketing_editorial_autopilot_scan/);
assert.match(migration,/now\(\) at time zone 'Asia\/Seoul'/);
const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function public.is_admin() returns boolean language sql as $$select true$$;");
 await db.exec("create table public.marketing_contents(id uuid primary key);create table public.marketing_ai_control(singleton boolean primary key,enabled boolean,blocked_reason text,daily_budget_usd numeric,monthly_budget_usd numeric);create table public.marketing_generation_jobs(created_at timestamptz,reserved_usd numeric);");
 await db.exec("insert into public.marketing_ai_control values(true,true,null,1.00,30.00)");
 await db.exec(core);
 await db.exec(migration);
 const tables=await db.query("select relname,relrowsecurity from pg_class where relname in ('marketing_editorial_autopilot_scans','marketing_editorial_autopilot_control')");
 assert.equal(tables.rows.length,2);
 assert.ok(tables.rows.every(x=>x.relrowsecurity));
 const reserve="select public.reserve_marketing_editorial_autopilot_scan($1,$2) as outcome";
 const key='editorial:manual:11111111-1111-4111-8111-111111111111';
 const first=await db.query(reserve,[key,true]);
 assert.equal(first.rows[0].outcome.accepted,true);
 const same=await db.query(reserve,[key,true]);
 assert.equal(same.rows[0].outcome.accepted,false,'idempotent scan key');
 await db.query("update public.marketing_editorial_autopilot_scans set status='completed' where scan_key=$1",[key]);
 const second=await db.query(reserve,['editorial:manual:22222222-2222-4222-8222-222222222222',true]);
 assert.equal(second.rows[0].outcome.accepted,true);
 await assert.rejects(db.query(reserve,['editorial:manual:33333333-3333-4333-8333-333333333333',true]),/EDITORIAL_SCAN_DAILY_LIMIT/);
 assert.equal((await db.query("select has_function_privilege('anon','public.reserve_marketing_editorial_autopilot_scan(text,boolean)','EXECUTE') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('service_role','public.reserve_marketing_editorial_autopilot_scan(text,boolean)','EXECUTE') as allowed")).rows[0].allowed,true);
}finally{await db.close();}
const route=fs.readFileSync('src/app/api/internal/marketing-editorial-autopilot/route.ts','utf8');
assert.match(route,/marketing_scheduler_authorized/);
const controller=fs.readFileSync('src/lib/marketing-editorial-studio.ts','utf8');
assert.match(controller,/confirm_editorial_review/);
assert.match(controller,/editorial_review:'approved'/);
assert.match(controller,/editorial_review:'rejected'/);
assert.doesNotMatch(route,/media_publish|approve_marketing_content/);
console.log('PASS editorial autopilot verified source and theme screening, human approval gates, idempotent bounded scan reservations, database RLS, and safe scheduled dispatch.');
