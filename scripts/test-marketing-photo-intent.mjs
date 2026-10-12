import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Local deterministic tests only. No paid providers or database writes.
const path='src/lib/marketing-photo-intent.ts';
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module,exports:module.exports},{filename:path});
const {photoSceneIntent,approvedPhotoFitsScene}=module.exports;
const nightExhibition={
 draft_kind:'growth_carousel',growth_topic_type:'seoul_trend',
 carousel_slides:[
  {role:'cover',title:'빛조각 보며 취향 얘기',body:'노원달빛산책, 당현천 무료 야간 전시'},
  {role:'context',title:'물길 따라 이어지는 전시',body:'당현천에서 작품을 따라 걸어요'},
  {role:'insight',title:'전시와 도슨트는 따로',body:'일부 투어 예약이 필요해요'}
 ]
};
const first=photoSceneIntent(nightExhibition,0);
assert.ok(first.scene_ids.includes('night'));
assert.ok(first.scene_ids.includes('exhibition'));
assert.match(first.query,/night illuminated/);
assert.match(first.query,/art exhibition/);
assert.equal(approvedPhotoFitsScene(nightExhibition,1,{search_query:'Seoul street cafe autumn'}),false);
assert.equal(approvedPhotoFitsScene(nightExhibition,1,{search_query:'Seoul city neighborhood culture'}),false);
assert.equal(approvedPhotoFitsScene(nightExhibition,1,{search_query:'Seoul South Korea night illuminated light installation art exhibition installation riverside stream walk'}),true);
assert.equal(approvedPhotoFitsScene(nightExhibition,0,{search_query:''}),false);
const cafe={
 draft_kind:'growth_carousel',growth_topic_type:'seoul_dating',
 carousel_slides:[{title:'첫 데이트 카페에서 대화가 끊긴다면',body:'마주 앉은 카페에서 처음 인사하는 순간'}]
};
assert.ok(photoSceneIntent(cafe,0).scene_ids.includes('cafe'));
assert.equal(approvedPhotoFitsScene(cafe,0,{search_query:'Seoul friendly cafe conversation'}),true);
assert.equal(approvedPhotoFitsScene(cafe,0,{search_query:'Seoul autumn forest trees'}),false);
assert.equal(approvedPhotoFitsScene({...cafe,growth_topic_type:'conversation_prompt'},0,{search_query:'Seoul autumn forest trees'}),true);
const stock=readFileSync('src/lib/marketing-stock-photos.ts','utf8');
assert.match(stock,/photoSceneIntent\(draft,slot\)/);
assert.match(stock,/approvedPhotoFitsScene\(draft,slot,asset\)/);
console.log('PASS scene-aware photo matching: night art search, unrelated photo reuse blocked, existing human approvals preserved.');
