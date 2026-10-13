import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
  {exports,Buffer,Intl,Date,URL,console,require:name=>name.startsWith('.')?load(path.join(path.dirname(file),name+'.ts')):require(name)},{filename:file});
 return exports;
}
const policy=load('src/lib/marketing-editor-first.ts'),manual=load('src/lib/marketing-manual-slide.ts'),quality=load('src/lib/marketing-content-policy.ts');
const v2={editorial_workflow_version:2,editorial_series:'different_words'};
for(const series of policy.EDITORIAL_SERIES){
 assert.ok(policy.validEditorialSeries(series));
 for(const lang of ['ko','en'])for(const count of [3,5]){
  const prompt=policy.editorFirstWritingInstructions('conversation_prompt',lang,count,series);
  assert.ok(Buffer.byteLength(prompt)<6000);
  assert.match(prompt,/ONE short headline/);
  assert.match(prompt,/subject is fixed/);
  assert.doesNotMatch(prompt,/exactly FIVE.*candidates|Score EACH/i);
 }
}
assert.equal(policy.validEditorialSeries('anything'),false);
const hard=[
 '실제 인용된 출처가 없습니다.','검증할 수 없는 출처 참조가 있습니다.','보장성 또는 과장 표현이 있습니다.',
 '카드 역할과 순서가 맞지 않습니다.','한국어 카드 설명은 한국어로 작성해야 합니다.','STOCK_PHOTO_REVIEW_REQUIRED',
 '선택한 썸네일 문구와 첫 장 제목이 일치해야 합니다.','CAROUSEL_TEXT_OVERFLOW',
 '썸네일에서 클릭베이트 또는 검증되지 않은 보장 표현을 사용할 수 없습니다.','unknown-new-safety-check'
];
for(const issue of hard){
 assert.equal(policy.isEditorialSuggestion(issue),false,issue);
 const report=policy.editorFirstReview({status:'rejected',issues:[issue]},v2);
 assert.equal(report.status,'rejected');assert.equal(report.issues[0],issue);
}
const taste='카드 본문이 중복되거나 지나치게 유사합니다.';
assert.equal(policy.editorFirstReview({status:'rejected',issues:[taste]},v2).status,'passed');
assert.equal(policy.editorFirstReview({status:'rejected',issues:[taste]},{}).status,'rejected','historical rules unchanged');
assert.equal(policy.editorFirstReview({status:'rejected',issues:[taste]},{...v2,editorial_series:'invalid'}).status,'rejected');
const slides=[
 {role:'cover',title:'해결책보다 먼저 듣고 싶을 때',body:'아직 내 얘기는 끝나지 않았는데',secondary_body:'Before the story is even finished.',body_ko:'아직 내 얘기는 끝나지 않았는데',body_en:'Before the story is even finished.',highlight:'',source_ids:[]},
 {role:'key_insight',title:'조언은 조금 뒤에 듣고 싶어',body:'“방법은 나중에 같이 찾자. 지금은 좀 들어줘.”',secondary_body:'We can think about solutions later. Please listen first.',highlight:'',source_ids:[]},
 {role:'editorial_closing',title:'지금 필요한 반응을 말해보기',body:'“오늘은 내 얘기부터 끝까지 해도 돼?”',secondary_body:'Could I finish telling you about today first?',closing_type:'insight',highlight:'',source_ids:[]}
];
const doc={...v2,design_preset:'roundy_magazine_editorial_v2',schema_version:2,post_type:'conversation_prompt',
 carousel_template:{version:1,mode:'fixed',slide_count:3,reservation_number:null,title_font_size_px:72,body_font_size_px:36},
 answer_first:true,cover_editorial_version:1,thumbnail_candidates:[slides[0].title],thumbnail_selected_index:0,slides};
const source={id:'example',status:'needs_approval',revision:1,content_language:'ko',carousel_slides:slides,content_document:doc};
const before=JSON.stringify(source);
const edit=manual.composeManualMagazineEdit(source,{request_key:'manual:editor-first-cover',revision:1,index:0,
 title:'그런데 내 얘기는 아직 안 끝났어',body:slides[0].body,highlight:''});
assert.equal(edit.document.thumbnail_candidates.length,1);
assert.equal(edit.document.thumbnail_candidates[0],edit.slides[0].title);
assert.equal(edit.document.thumbnail_render_pending,true);
assert.equal(JSON.stringify(source),before,'manual editing never mutates the original');
assert.equal(edit.slides[1].body,slides[1].body);
const schema=quality.contentSchema('conversation_prompt','ko','',true,doc.carousel_template);
assert.equal(schema.properties.thumbnail_candidates.minItems,5,'legacy schema retained until trusted authoring opt-in');
const workflow=load('src/lib/marketing-workflow.ts');
assert.equal(workflow.editorialState({status:'completed',stage:'source_review_required'}),'source_review');
const ui=fs.readFileSync('src/components/admin-marketing-content-library.tsx','utf8');
assert.match(ui,/content-composer/);assert.match(ui,/subject/);assert.match(ui,/saveEdits|function save/);
assert.doesNotMatch(ui,/onLegacy/);
const photos=fs.readFileSync('src/lib/marketing-stock-photos.ts','utf8');
assert.match(photos,/isEditorFirst\(draft.content_document\)\?PHOTO_PROVIDERS.filter/);
console.log('PASS editor-first series, short prompts, advisory allowlist, legacy isolation, single-title edits, source-review and composer contracts');
