import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const ts=require('typescript');
const file='src/lib/marketing-editorial-quality.ts';
const module={exports:{}};
const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
vm.runInNewContext(compiled,{module,exports:module.exports},{filename:file});
const {evaluateEditorialEngagement,EDITORIAL_ENGAGEMENT_POLICY,EDITORIAL_ENGAGEMENT_THRESHOLD}=module.exports;

const weak={
  slides:[
    {role:'cover',title:'메뉴판 보며 꺼내는 첫 질문',body:'눈앞의 장소부터 물어보세요'},
    {role:'context',title:'메뉴판을 같이 보고 있다면',body:'“이 동네 자주 오세요?” 지금 있는 곳을 묻는 말로 대화를 열어보세요.'},
    {role:'insight',title:'답에서 하나를 골라요',body:'“네, 가끔요”라는 답엔 “오시면 보통 뭐 드세요?” 하고 이어가세요.'},
    {role:'insight',title:'메뉴 이름을 들었다면',body:'그 메뉴를 좋아하는지 물어보고 대화를 계속 이어가세요.'},
    {role:'editorial_closing',title:'주변을 묻고, 답에서 이어가기',body:'첫 질문은 눈앞의 장소에서 꺼내고 다음 질문은 답에서 골라보세요.'}
  ]
};
const strong={
  slides:[
    {role:'cover',title:'소개팅이 면접처럼 느껴지는 이유',body:'질문이 많은데 대화가 없는 순간'},
    {role:'context',title:'질문만 하면 면접이 된다',body:'“어디 사세요?” “무슨 일 하세요?” 질문만 반복하면 상대도 평가받는 기분이 들 수 있어요.'},
    {role:'insight',title:'내 이야기부터 한 조각',body:'질문을 더하는 대신 내 경험을 먼저 꺼내면 상대도 부담 없이 이야기를 나눌 수 있어요.'},
    {role:'insight',title:'사소한 공감이 이어지는 순간',body:'“저는 주말엔 나가고 싶은데 막상 귀찮아요.” 하고 말하면 뜻밖의 공통점을 발견할 수도 있어요.'},
    {role:'editorial_closing',title:'질문 세 개보다 내 이야기 한 조각',body:'질문만 던지지 말고 자기 얘기도 조금씩 꺼내보세요.'}
  ]
};
const weakResult=evaluateEditorialEngagement(weak,'ko');
const strongResult=evaluateEditorialEngagement(strong,'ko');
assert.ok(weakResult.score<EDITORIAL_ENGAGEMENT_THRESHOLD,JSON.stringify(weakResult));
assert.ok(weakResult.issues.some(x=>x.includes('표지')));
assert.ok(weakResult.issues.some(x=>x.includes('행동 지시')));
assert.ok(strongResult.score>=EDITORIAL_ENGAGEMENT_THRESHOLD,JSON.stringify(strongResult));
assert.equal(strongResult.issues.length,0);
assert.equal(strongResult.version,EDITORIAL_ENGAGEMENT_POLICY);

const weakEnglish={slides:[
  {title:'Easy conversation questions'},
  {title:'Start talking',body:'Ask what the other person likes and follow up.'},
  {title:'One more question',body:'Try another question and continue the conversation.'},
  {title:'Make it easy',body:'Ask a question that feels natural and easy.'},
  {title:'Better conversations start here',body:'Remember to keep the conversation going.'}
]};
assert.ok(evaluateEditorialEngagement(weakEnglish,'en').score<EDITORIAL_ENGAGEMENT_THRESHOLD);
assert.equal(evaluateEditorialEngagement({slides:[{title:'Only a cover'}]},'ko').score,0);

const policy=fs.readFileSync('src/lib/marketing-content-policy.ts','utf8');
const editorial=fs.readFileSync('src/lib/marketing-editorial.ts','utf8');
assert.match(policy,/editorial_engagement_policy===EDITORIAL_ENGAGEMENT_POLICY/);
assert.match(editorial,/isImmersiveMagazineDocument\(applied\)/);
assert.match(editorial,/EDITORIAL_ENGAGEMENT_GATE_REJECTED/);
assert.match(editorial,/repairUsed=true/);
console.log('PASS editorial engagement gate: weak KO/EN copy rejected, distinctive copy accepted, legacy opt-in, single repair and stop-before-images wired.');
