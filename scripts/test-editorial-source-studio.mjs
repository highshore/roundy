import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';

const policyFile='src/lib/editorial-studio-policy.ts';
const output=ts.transpileModule(readFileSync(policyFile,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
vm.runInNewContext(output,{exports,Date,URL,console},{filename:policyFile});
const {canonicalEditorialUrl,parseEditorialSource,initialEditorialDraft,parseEditorialDraft,editorialHandoffInstruction}=exports;
const sample={pillar:'dating_opinions',source_url:'https://www.instagram.com/reel/ABC123/?utm_source=x&igshid=track#clip',
 title:'소개팅에서 첫인상이 중요한 이유',creator:'creator',summary:'서로 다른 첫인상에 대한 공개 인터뷰를 참고해 토론 주제로 재구성할 수 있습니다.',source_published_at:'2026-10-01'};
const parsed=parseEditorialSource(sample);
assert.equal(parsed.source_url,'https://instagram.com/reel/ABC123');
assert.equal(canonicalEditorialUrl('https://example.com/a/?utm_campaign=test'),'https://example.com/a');
for(const url of ['file:///etc/passwd','http://127.0.0.1/test','https://localhost/test','javascript:alert(1)','https://user:pass@example.com/a']){
 assert.throws(()=>canonicalEditorialUrl(url),/SOURCE_URL/);
}
assert.throws(()=>parseEditorialSource({...sample,source_published_at:'2026-02-30'}),/SOURCE_DATE_INVALID/);
assert.throws(()=>parseEditorialSource({...sample,summary:'short'}),/SOURCE_TITLE_AND_SUMMARY_REQUIRED/);
const idea=initialEditorialDraft(parsed);
assert.equal(idea.hooks.length,3);
const valid=parseEditorialDraft(idea);
assert.equal(valid.storyboard.length,3);
assert.throws(()=>parseEditorialDraft({...valid,hooks:[valid.hooks[0],valid.hooks[0],valid.hooks[2]]}),/EDITORIAL_BRIEF_INCOMPLETE/);
assert.throws(()=>parseEditorialDraft({...valid,selected_hook:'not one of the options'}),/EDITORIAL_BRIEF_INCOMPLETE/);
const handoff=editorialHandoffInstruction(parsed,valid);
assert.ok(handoff.length<=500);
assert.ok(handoff.includes('PREFERRED HOOK'));
assert.ok(handoff.includes('Independently verify'));
assert.ok(handoff.includes('instagram.com'));

const migration=readFileSync('supabase/migrations/20261015000100_editorial_source_studio.sql','utf8');
assert.match(migration,/enable row level security/g);
assert.match(migration,/create policy editorial_sources_admin_read/);
assert.match(migration,/revoke all on public.marketing_editorial_sources/);
assert.match(migration,/grant select on public.marketing_editorial_sources/);
assert.doesNotMatch(migration,/media_publish|schedule_marketing|cron\.schedule/);
const appRoute=readFileSync('src/app/admin/[[...path]]/page.tsx','utf8');
assert.match(appRoute,/'editorial'/);
const api=readFileSync('src/lib/marketing.ts','utf8');
assert.match(api,/marketingEditorialStudioApi\(req,service,path\.slice\(1\),actor\.id\)/);
const server=readFileSync('src/lib/marketing-editorial-studio.ts','utf8');
assert.match(server,/startContentWorkflow\(/);
assert.match(server,/editorialHandoffInstruction/);
assert.match(server,/EDITORIAL_REQUEST_RECONCILIATION_REQUIRED/);
assert.doesNotMatch(server,/media_publish\s*\(|publish_marketing|schedule_marketing|approve_marketing_content\s*\(/i);
const client=readFileSync('src/components/admin-editorial-studio.tsx','utf8');
assert.match(client,/dating_opinions/);
assert.match(client,/seoul_guides/);
assert.match(client,/selected_hook/);
assert.match(client,/storyboard/);
assert.match(client,/Create unpublished carousel/);
assert.doesNotMatch(client,/Publish now|Approve & schedule|reel studio/i);

const db=new PGlite();
try{
 await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function public.is_admin() returns boolean language sql as $$select true$$;");
 await db.exec("create table public.marketing_contents(id uuid primary key); create table public.marketing_ai_control(singleton boolean primary key, enabled boolean, blocked_reason text, daily_budget_usd numeric,monthly_budget_usd numeric); create table public.marketing_generation_jobs(created_at timestamptz, reserved_usd numeric);");
 await db.exec("insert into public.marketing_ai_control values(true,true,null,0.25,5);");
 await db.exec(migration);
 const source=await db.query("insert into public.marketing_editorial_sources(pillar,source_url,title,summary) values('dating_opinions','https://instagram.com/reel/test','Example dating source title','A real interview about interesting disagreements and dating preferences.') returning id");
 const sourceId=source.rows[0].id;
 const created=await db.query("insert into public.marketing_editorial_ideas(source_id,angle) values($1,'Original angle') returning id,revision",[sourceId]);
 const ideaId=created.rows[0].id;
 const reserve="select public.reserve_marketing_editorial_suggestion($1,$2,$3,$4) as result";
 const fingerprint='a'.repeat(64);
 const run=await db.query(reserve,[ideaId,1,'editorial:plan:'+ideaId+':1',fingerprint]);
 assert.equal(run.rows[0].result.status,'reserved');
 const repeat=await db.query(reserve,[ideaId,1,'editorial:plan:'+ideaId+':1',fingerprint]);
 assert.equal(repeat.rows[0].result.id,run.rows[0].result.id,'identical operation is idempotent');
 await assert.rejects(db.query(reserve,[ideaId,1,'editorial:plan:'+ideaId+':1','b'.repeat(64)]),/EDITORIAL_REQUEST_CONFLICT/);
 const count=await db.query("select count(*)::int as n from public.marketing_editorial_suggestion_runs");
 assert.equal(count.rows[0].n,1);
 const rls=await db.query("select relrowsecurity from pg_class where relname='marketing_editorial_sources'");
 assert.equal(rls.rows[0].relrowsecurity,true);
}finally{await db.close();}
console.log('PASS editorial source normalization, hook/storyboard validation, protected API/page contracts, SQL migration and idempotent paid suggestion reservation');
