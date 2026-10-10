import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=ts.transpileModule(read('src/lib/marketing-carousel-template.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const module={exports:{}};
vm.runInNewContext(code,{module,exports:module.exports});
const {CAROUSEL_CANVAS,resolveCarouselPlan,savedCarouselPlan,withCarouselPlan,
 carouselNarrative,wrapCarouselCopy,fitCarouselCopy,mobileCarouselFit}=module.exports;
const settings={carousel_mode:'fixed',carousel_default_slides:5,carousel_title_font_size_px:72,carousel_body_font_size_px:36};
assert.deepEqual([CAROUSEL_CANVAS.width,CAROUSEL_CANVAS.height,CAROUSEL_CANVAS.safe],[1080,1350,80]);
assert.equal(resolveCarouselPlan(settings).slide_count,5);
assert.equal(resolveCarouselPlan({...settings,carousel_default_slides:3}).slide_count,5,'fixed always five, regardless of stale default field');
assert.equal(resolveCarouselPlan(null),null,'old snapshots retain previous generator');
assert.deepEqual([1,2,3,4,5,6].map(i=>resolveCarouselPlan({...settings,carousel_mode:'alternating'},i).slide_count),[3,5,3,5,3,5]);
assert.throws(()=>resolveCarouselPlan({...settings,carousel_mode:'alternating'},null),/CAROUSEL_RESERVATION_REQUIRED/);
const five=resolveCarouselPlan(settings),three=resolveCarouselPlan({...settings,carousel_mode:'alternating'},1);
assert.equal(savedCarouselPlan(withCarouselPlan({name:'safe'},three)).slide_count,3);
assert.equal(savedCarouselPlan({name:'legacy'}),null);
assert.deepEqual(Array.from(carouselNarrative(3)),['RESULT','VALUE / DETAIL','ROUNDY']);
assert.deepEqual(Array.from(carouselNarrative(5)),['RESULT','CONTEXT','DETAIL','VALUE','ROUNDY']);
// Text must never silently lose facts: the sum of reconstructed words is preserved.
for(const sample of [
 '성수 첫 데이트, 서울숲부터 시작하는 코스',
 'A first-date itinerary with an unusually long uncompromising Englishwordwithoutspaces',
 '요약\n자료를 확인한 뒤 방문합니다.'
]){
 const fitted=fitCarouselCopy(sample,{width:920,availableHeight:1000,preferred:66,minimum:34,maxLines:15,label:'TEST'});
 assert.ok(fitted.fontSize>=34);
 assert.equal(fitted.lines.join('').replace(/\s+/g,''),sample.replace(/\s+/g,''),'no text truncation');
}
const emoji='👩🏽‍💻';
const complexToken='한국어'+emoji.repeat(24)+'데이트';
const wrapped=wrapCarouselCopy(complexToken,7);
assert.equal(wrapped.join(''),complexToken,'no grapheme truncation');
for(const line of wrapped){
 assert.ok(!line.startsWith('\u200D')&&!line.endsWith('\u200D'),'must not wrap within a joined emoji');
 assert.ok(!line.startsWith('🏽')&&!line.endsWith('👩'),'must not separate skin-tone modifier');
}
assert.throws(()=>fitCarouselCopy('x'.repeat(1800),{
 width:920,availableHeight:180,preferred:70,minimum:50,maxLines:3,label:'TITLE'
}),/CAROUSEL_TEXT_OVERFLOW_TITLE/);
const samples=[{role:'cover',title:'성수 첫 데이트, 서울숲부터 시작',body:'검증된 산책 코스를 먼저 선택하세요.'},
 {role:'value',title:'코스를 고를 때 볼 것',body:'장소와 이동 동선을 미리 확인한 뒤 편한 대화를 시작하세요.'},
 {role:'cta',title:'한 사람씩 직접 만나보기',body:'Roundy 로테이션 소개팅에서 실제 대화를 경험해보세요.'}];
for(let i=0;i<3;i++){
 const fitted=mobileCarouselFit(samples[i],three,i,'ko');
 assert.ok(fitted.title.fontSize>=50);
 assert.ok(fitted.body.fontSize>=38);
 assert.equal(fitted.margin,80);
}
assert.equal(mobileCarouselFit(samples[1],three,1,'ko').body.fontSize,42,
 '36px body baseline must render larger in the standardized template');
const visuals=read('src/lib/marketing-visuals.ts');
assert.match(visuals,/standardCarouselTree\(/);
assert.match(visuals,/rgba\(13,18,15,\.80\)/);
assert.match(visuals,/left:80,right:80/);
assert.match(visuals,/fontWeight:900/);
assert.match(visuals,/savedCarouselPlan\(document\)\?standardCarouselTree/);
const sql=read('supabase/migrations/20261010125000_marketing_carousel_slot_reservations.sql');
assert.match(sql,/pg_advisory_xact_lock/);
assert.match(sql,/on conflict\(draft_id\) do nothing/);
assert.match(sql,/grant execute on function public\.reserve_marketing_carousel_slot\(uuid\) to service_role/);
assert.doesNotMatch(sql,/(?:truncate|delete from public\.instagram_post_drafts|drop table)/i);
const generation=read('src/lib/marketing-generation.ts');
assert.match(generation,/reserve_marketing_carousel_slot/);
assert.match(generation,/input\.carousel_plan=plan/);
assert.match(generation,/coverCost=managedPhotoSourcing/);
const worker=read('supabase/functions/roundy-marketing/index.ts');
assert.ok(!worker.includes('marketing_carousel_slot_reservations'),'publisher remains untouched');
console.log('PASS standardized 4:5 cards: 3/5 reservation sequence, no-clipping fitter, larger mobile body, safe margins, brand contrast, old-draft compatibility');
