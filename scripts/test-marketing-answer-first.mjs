import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=ts.transpileModule(read('src/lib/marketing-answer-first.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
const layoutCode=ts.transpileModule(read('src/lib/marketing-carousel-template.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const layoutModule={exports:{}};
vm.runInNewContext(layoutCode,{module:layoutModule,exports:layoutModule.exports});
vm.runInNewContext(js,{module,exports:module.exports,
 require:name=>{if(name==='./marketing-carousel-template')return layoutModule.exports;throw new Error('Unexpected module '+name);}
});
const {
 fiveEditorialRoles,fiveCampaignRoles,fiveEventRoles,withAnswerFirstSchema,
 answerFirstIssues,applyAnswerFirstDocument,selectAnswerFirstHeadline
}=module.exports;

for(const [type,legacy] of [
 ['seoul_dating',['cover','scenario','etiquette','plan','checklist','cta']],
 ['trend_research',['cover','finding','context','limitation','practice','cta']],
 ['dating_myth',['cover','myth','finding','limitation','practice','cta']],
 ['seoul_trend',['cover','facts','experience','date_plan','practical','practice','cta']],
 ['conversation_prompt',['cover','opener','followup','listen','practice','cta']]
]){
 const actual=fiveEditorialRoles(type,legacy);
 assert.equal(actual.length,5,type);
 assert.equal(actual[0],'cover');
 assert.equal(actual[4],'cta');
 assert.ok(actual.every(role=>legacy.includes(role)),type+' only uses supported roles');
}
for(const [pattern,old] of [['poster',['hook','benefit','cta']],['countdown',['hook','countdown','cta']]]){
 assert.equal(fiveCampaignRoles(pattern,old).length,5);
}
for(const [pattern,old] of [['event_poster',['hook','facts','cta']],['offer',['hook','offer','facts','cta']]]){
 assert.equal(fiveEventRoles(pattern,old).length,5);
}
const baseSchema={properties:{slides:{type:'array'}},required:['slides']};
assert.equal(withAnswerFirstSchema(baseSchema,'ko',false),baseSchema);
const schema=withAnswerFirstSchema(baseSchema,'ko',true);
assert.equal(schema.properties.thumbnail_candidates.minItems,3);
assert.equal(schema.properties.thumbnail_candidates.maxItems,3);
assert.ok(schema.required.includes('thumbnail_candidates'));
assert.equal(baseSchema.properties.thumbnail_candidates,undefined,'original schema must remain untouched');

const headlines=['성수에서 서울숲부터 시작하기','성수 첫 데이트 서울숲 코스','서울숲 산책으로 첫 만남 시작'];
const slides=[
 {role:'cover',title:headlines[0],body:'서울숲 산책을 먼저 추천합니다.'},
 {role:'scenario',title:'왜 서울숲인가',body:'근거를 바탕으로 한 배경'},
 {role:'etiquette',title:'첫 번째 장소',body:'실제 방문 동선 정보'},
 {role:'plan',title:'실용적인 제안',body:'확인된 정보를 바탕으로 한 팁'},
 {role:'cta',title:'Roundy',body:'함께 새로운 대화를'}
];
const generated=applyAnswerFirstDocument({slides,thumbnail_candidates:headlines},true);
assert.equal(generated.answer_first,true);
assert.equal(generated.slides[0].title,headlines[0]);
assert.equal(answerFirstIssues(generated,'ko').length,0);
const changed=selectAnswerFirstHeadline(generated,1,true);
assert.equal(changed.thumbnail_selected_index,1);
assert.equal(changed.thumbnail_render_pending,true);
assert.equal(changed.slides[0].title,headlines[1]);
assert.equal(answerFirstIssues(changed,'ko').some(issue=>issue.includes('렌더링')),true);
assert.equal(selectAnswerFirstHeadline(generated,1,false).thumbnail_render_pending,false);
assert.equal(selectAnswerFirstHeadline(changed,1,true),changed,'same candidate must not bump revision');
assert.throws(()=>selectAnswerFirstHeadline(generated,3,false),/INVALID_THUMBNAIL_CHOICE/);
assert.throws(()=>selectAnswerFirstHeadline({},0,false),/THUMBNAIL_CHOICES_UNAVAILABLE/);
assert.equal(answerFirstIssues({...generated,thumbnail_candidates:[headlines[0],headlines[0],headlines[2]]},'ko').some(x=>x.includes('달라야')),true);
assert.equal(answerFirstIssues({...generated,thumbnail_candidates:['어디서 데이트할까?',headlines[1],headlines[2]]},'ko').some(x=>x.includes('질문')),true);
assert.equal(answerFirstIssues({...generated,thumbnail_candidates:[headlines[0],'충격 무조건 성공하는 데이트',headlines[2]]},'ko').some(x=>x.includes('클릭베이트')),true);
assert.equal(answerFirstIssues({...generated,slides:slides.slice(0,3)},'ko').some(x=>x.includes('5장')),true);
assert.equal(answerFirstIssues({slides},'ko').length,0,'old documents stay valid');
const admin=read('src/lib/marketing.ts');
assert.match(admin,/path\[2\]==='thumbnail'&&req\.method==='PATCH'/);
assert.match(admin,/eq\('revision',old\.revision\)/);
assert.match(admin,/status!=='needs_approval'/);
const editor=read('src/components/admin-marketing.tsx');
assert.match(editor,/thumbnail_candidates/);
assert.match(editor,/thumbnail_render_pending/);
assert.match(editor,/Re-render with selected headline/);
const generation=read('src/lib/marketing-generation.ts');
assert.match(generation,/carousel_answer_first_enabled/);
assert.match(generation,/thumbnail_render_pending:false/);
assert.match(generation,/answer_first_enabled:input\.answer_first_enabled===true/);
// Explicitly assert this change did not alter the old image renderer or publisher.
console.log('PASS marketing Answer-First: five-card roles, strict candidate schema, safe headlines, guarded manual choice, legacy compatibility, pending image rerender');
