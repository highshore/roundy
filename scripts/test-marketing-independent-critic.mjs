import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const file='src/lib/marketing-editorial-critic.ts',mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module:mod,exports:mod.exports},{filename:file});
const p=mod.exports;
let count=0;
function check(fn){fn();count++;}

const good=(angle_key,score=5)=>({
 headline:'소개팅이 끝난 뒤에도 그 말이 마음에 남았던 순간',
 angle_key,core_insight:'다음 약속을 잡지 못한 이유를 마주치게 되는 대화',
 reader_payoff:'그때 그 말을 왜 했는지 깨닫게 된다',
 scene:'서로 웃으면서 헤어졌는데 집에 와서 연락이 멈춘 순간',
 score,status:'eligible',reasons:[],novelty:5,reader_value:5,curiosity:5,shareability:5,
 editorial_reason:'실제 익숙한 장면이면서 새로운 관점을 담는다'
});
const original={
 version:1,status:'selected',
 selected:good('automatic_first_choice'),
 candidates:[{...good('automatic_first_choice'),status:'selected'},good('original_social_scene'),good('third_editorial_scene')],
 recent_count:0,history_days:60,threshold:80,reviewed_at:'2026-10-12'
};
const rate=(angle_key,vals,decision='approve')=>({
 angle_key,hook:vals[0],scene:vals[1],originality:vals[2],usefulness:vals[3],shareability:vals[4],
 decision,reason:'관찰과 이야기의 밀도를 기준으로 다른 후보와 구분해 평가했습니다.'
});
const values=[
 rate('automatic_first_choice',[5,2,2,4,2]),
 rate('original_social_scene',[5,5,5,5,5]),
 rate('third_editorial_scene',[4,4,4,4,4])
];
const reviewed=p.independentlyRankTopics(original,{reviews:values});
check(()=>assert.equal(reviewed.selection.selected.angle_key,'original_social_scene'));
check(()=>assert.equal(reviewed.selection.candidates[0].status,'discarded'));
check(()=>assert.equal(reviewed.selection.candidates[1].status,'selected'));
check(()=>assert.equal(reviewed.reviews[0].approved,false));
check(()=>assert.equal(reviewed.reviews[1].score,100));
check(()=>assert.equal(reviewed.reviews[2].approved,true));
check(()=>assert.equal(original.selected.angle_key,'automatic_first_choice')); // no in-place pollution
check(()=>assert.equal(p.topicCriticSchema().properties.reviews.maxItems,5));
check(()=>assert.throws(()=>p.independentlyRankTopics(original,{reviews:values.slice(1)}),/COUNT_MISMATCH/));
check(()=>assert.throws(()=>p.independentlyRankTopics(original,{reviews:[values[0],values[0],values[2]]}),/UNMATCHED_KEY/));
check(()=>assert.throws(()=>p.independentlyRankTopics(original,{reviews:[values[0],{...values[1],scene:7},values[2]]}),/INVALID_RATING/));
const rejected=p.independentlyRankTopics(original,{reviews:values.map(x=>({...x,decision:'reject'}))});
check(()=>assert.equal(rejected.selection.status,'discarded'));
check(()=>assert.equal(rejected.selection.selected,null));

const copy=(decision,vals,issues=[])=>({
 decision,hook:vals[0],scene:vals[1],originality:vals[2],progression:vals[3],shareability:vals[4],
 reason:'글 자체는 자연스럽지만 내용의 새로운 발견이 부족하고 같은 조언을 반복합니다.',
 issues
});
check(()=>assert.equal(p.assessIndependentCopyReview(copy('pass',[5,2,2,1,1])).status,'rewrite'));
check(()=>assert.equal(p.assessIndependentCopyReview(copy('replace_topic',[4,3,1,2,3])).status,'replace_topic'));
check(()=>assert.equal(p.assessIndependentCopyReview(copy('pass',[5,5,5,5,5])).status,'passed'));
check(()=>assert.equal(p.assessIndependentCopyReview(copy('pass',[5,5,5,5,5])).score,100));
check(()=>assert.equal(p.assessIndependentCopyReview(copy('rewrite',[3,4,3,2,2],['뻔한 조언을 반복하지 말고 구체적인 장면으로 발전시키세요.'])).issues.length,1));
check(()=>assert.throws(()=>p.assessIndependentCopyReview(copy('pass',[5,5,0,5,5])),/INVALID_RATING/));
check(()=>assert.throws(()=>p.assessIndependentCopyReview(copy('pass',[5,5,5,5,5],['a','b','c','d','e'])),/INVALID/));
check(()=>assert.equal(p.storyFirstPostType('conversation_prompt'),true));
check(()=>assert.equal(p.storyFirstPostType('dating_archetype'),true));
check(()=>assert.equal(p.storyFirstPostType('seoul_dating'),false));
check(()=>assert.equal(p.storyFirstPostType('trend_research'),false));
check(()=>assert.match(p.copyCriticPrompt('ko','story_first',5),/banal suggestion/));
check(()=>assert.match(p.topicCriticPrompt('ko'),/self-ratings have deliberately been hidden/));
check(()=>assert.match(p.copyCriticPrompt('ko','answer_first',5),/FACT-FIRST or service-journalism/));
check(()=>assert.match(p.copyCriticPrompt('ko','answer_first',5),/Reject unrelated social advice/));
check(()=>assert.match(p.copyCriticPrompt('ko','story_first',5),/recognisable human scene/));
const criticFeedback=p.assessIndependentCopyReview(copy('rewrite',[5,2,3,1,2],[
 '무대 선택과 감상 대화 이야기가 연결되지 않아 카드별로 다른 글처럼 읽힙니다.'
]));
const fixed=p.editorialRevisionBrief(criticFeedback,5,true);
check(()=>assert.equal(fixed.slide_progression.length,5));
check(()=>assert.ok(fixed.weakest_dimensions.includes('progression')));
check(()=>assert.match(fixed.editor_reason,/같은 조언/));
check(()=>assert.match(fixed.factual_lock,/source IDs/));
check(()=>assert.equal(fixed.editor_issues.length,1));
const narrative=p.editorialRevisionBrief(criticFeedback,3,false);
check(()=>assert.equal(narrative.slide_progression.length,3));
check(()=>assert.match(narrative.factual_lock,/Illustrative conversation/));

const editorial=fs.readFileSync('src/lib/marketing-editorial.ts','utf8');
const policy=fs.readFileSync('src/lib/marketing-content-policy.ts','utf8');
const first=fs.readFileSync('src/lib/marketing-answer-first.ts','utf8');
check(()=>assert.match(editorial,/const ranked=independentlyRankTopics\(/));
check(()=>assert.match(editorial,/criticCalls>=EDITORIAL_CRITIC_MAX_REVIEWS/));
check(()=>assert.match(editorial,/await reviewIfSafe\(\)/));
check(()=>assert.ok(editorial.indexOf('await reviewIfSafe();')<editorial.indexOf('let document:Row={')));
check(()=>assert.match(editorial,/switching_weak_topic/));
check(()=>assert.match(editorial,/EDITORIAL_INDEPENDENT_REVIEW_REJECTED/));
check(()=>assert.match(editorial,/ONE BOUNDED EDITORIAL REWRITE/));
check(()=>assert.match(editorial,/independent_editor_brief:editorialRevisionBrief/));
check(()=>assert.match(editorial,/editorialReview.current.reason/));
check(()=>assert.match(editorial,/critique:editorialReview.current\?\.status===/));
check(()=>assert.match(policy,/NARRATIVE MODE: STORY-FIRST/));
check(()=>assert.match(policy,/magazineAnswerFirstPrompt\(plan!\.slide_count,storyFirst\)/));
check(()=>assert.match(policy,/ONE STORY PER CAROUSEL/));
check(()=>assert.match(policy,/Do NOT alternate event catalog facts/));
const admin=fs.readFileSync('src/components/admin-marketing.tsx','utf8');
check(()=>assert.match(admin,/Independent editorial review failed/));
check(()=>assert.match(admin,/marketing-editorial-error-detail/));
check(()=>assert.match(first,/!storyFirst&&/));
console.log('PASS '+count+' independent editorial critic, bounded review, weak-vs-strong story, story-first contracts. No provider API calls.');
