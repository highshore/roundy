import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import ts from 'typescript';

const read = path => readFile(path, 'utf8');
const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString('base64');
const { isRoundyEvent, retiredEventDestination } = await import(compile(await read('src/lib/event-scope.ts')));
for (const theme of ['1:1 Speed Mingle', '1:1 Speed Meetup']) assert.equal(isRoundyEvent({ theme }), true);
for (const theme of ['Business Talk', 'Business Meetup', 'Other', '', null, undefined]) assert.equal(isRoundyEvent({ theme }), false);
const original = [{ theme: 'Business Talk', id: 'archive' }, { theme: '1:1 Speed Mingle', id: 'current' }];
assert.deepEqual(original.filter(isRoundyEvent).map(e => e.id), ['current']);
assert.equal(original.length, 2, 'Filtering must not mutate the historical records');
for (const path of ['/business-talk', '/business-talk/', '/how-it-works/business-talk']) assert.equal(retiredEventDestination(path), '/events');
assert.equal(retiredEventDestination('/events', 'Business Talk'), '/events');
assert.equal(retiredEventDestination('/events', 'Business Meetup'), '/events');
for (const path of ['/', '/discover', '/events', '/how-it-works', '/how-it-works/mingle', '/about', '/signin']) assert.equal(retiredEventDestination(path, '1:1 Speed Mingle'), null);

const retiredCopy = /business[ -]?talk|business[ -]?meetup|one\s*cup\s*english|1\s*cup(?:english)?|영어\s?한잔|비즈니스\s*토크/i;
for (const dir of ['src/components', 'src/lib']) {
 for (const filename of await readdir(dir)) {
  if (!/\.tsx?$/.test(filename) || filename === 'event-scope.ts') continue;
  assert.doesNotMatch(await read(`${dir}/${filename}`), retiredCopy, `${dir}/${filename} must not contain retired copy`);
 }
}
const app = await read('src/components/app.tsx');
assert.doesNotMatch(app, /legacyTalks|event-category-filters|80\+|roundy-business-hero/);
assert.match(app, /data\.events\.filter\(isRoundyEvent\)/);
assert.match(app, /d\.events\.filter\(isRoundyEvent\)/);
assert.match(app, /nativePast\.map/);
assert.match(app, /occupancyLabel\(attending,e.capacity,locale\)/);
assert.match(app, /NotoAnimatedEmoji/);
const api = await read('src/app/api/[...path]/route.ts');
assert.match(api, /events:\(data\?\?\[\]\)\.filter\(isRoundyEvent\)/);
assert.match(api, /data\.event\)\?\{\.\.\.data,event:null,eligible:false\}/);
const legacy = await read('src/app/api/legacy-business-talks/route.ts');
assert.match(legacy, /status: 410/);
assert.match(legacy, /events: \[\]/);
assert.doesNotMatch(legacy, /fetch\(|https?:\/\//);
const page = await read('src/app/[[...path]]/page.tsx');
assert.match(page, /retiredEventDestination/);
assert.match(page, /permanentRedirect\(retired/);
assert.match(page, /remaining\.append\(key,item\)/, 'Preserve referral and other unrelated query parameters');
assert.match(await read('src/lib/data.ts'), /eventCategories=\['1:1 Speed Mingle'\]/);
assert.match(await read('src/lib/event-input.ts'), /eventCategories as readonly string\[\]/);
for (const path of ['src/lib/about-copy.ts', 'src/components/about-us.tsx']) assert.doesNotMatch(await read(path), /80\+|proofValue|about\/conversation|about\/moments/);
console.log('PASS: active event allowlist, retired routes/feed, bilingual content audit, historical-data preservation and key UI regressions');

// Execute the real public GET handler against a local fake database, not only its source shape.
const apiWithoutImports = ts.transpileModule(api, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText.replace(/^import[^\n]*\n/gm, '');
const fake = `
const isRoundyEvent=${isRoundyEvent.toString()};
const rows=${JSON.stringify(original)};
const NextResponse={json:(data,init)=>new Response(JSON.stringify(data),init)};
const createClient=async()=>({from:(table)=>{if(table!=='events')throw Error('Unexpected table');return {select:()=>({is:()=>({order:async()=>({data:rows,error:null})})})}}});
`;
const { GET } = await import('data:text/javascript;base64,' + Buffer.from(fake + apiWithoutImports).toString('base64'));
const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
try {
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.invalid';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='local-test';
 const response=await GET({method:'GET'},{params:Promise.resolve({path:['events']})});
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{events:[original[1]]});
} finally {
 if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
 if(oldKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=oldKey;
}
console.log('PASS: real public API handler excludes retired database events without touching their records');
