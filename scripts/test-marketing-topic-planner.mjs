import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const path='src/lib/marketing-topic-planner.ts',module={exports:{}};
const source=fs.readFileSync(path,'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module,exports:module.exports,Date,Intl,Set,Number,Object,Math,JSON},{filename:path});
const p=module.exports;
let assertions=0;
const check=fn=>{fn();assertions++;};
const now=new Date('2026-10-12T00:00:00Z');
const candidate=(headline,angle_key,core_insight,novelty=5,reader_value=5,curiosity=5,shareability=5)=>({
 headline,angle_key,core_insight,novelty,reader_value,curiosity,shareability,
 reader_payoff:'독자가 다음 소개팅에서 단순히 질문만 늘리지 않고 서로 이야기를 주고받는 구체적 방법을 이해한다.',
 scene:'소개팅 자리에서 서로 질문을 쏟아내지만 눈치만 보게 되는 어색한 첫 10분의 순간.',
 editorial_reason:'어색했던 실제 순간을 새로운 시선으로 해석해 친구와 이야기할 만한 이유가 있다.'
});
const ideas=[
 candidate('소개팅이 면접처럼 느껴지는 이유','first_date_interview_questions','질문을 더하는 대신 내 이야기를 한 조각 공개할 때 상대방도 자신의 이야기를 꺼낼 수 있다는 관찰'),
 candidate('카톡에선 재밌는데 만나면 어색한 이유','texting_versus_meeting_context','메신저에서는 답변 시간을 고를 수 있지만 대면 자리에서는 침묵까지 함께 경험한다는 차이'),
 candidate('첫 데이트 장소에서 후회하는 선택','first_date_location_noise','첫 만남에선 유명한 공간보다 상대의 말이 들리는 조용한 자리가 편하게 대화할 가능성을 높인다'),
 candidate('첫 만남 직후 친구에게 하는 말','after_date_friend_recap','상대의 직업보다 대화 중 어떤 기분이 들었는지가 친구에게 먼저 떠오르는 경우도 있다'),
 candidate('주말 약속이 자꾸 미뤄지는 순간','weekend_social_planning_friction','선택지가 많을수록 날짜를 정하지 못할 때는 장소보다 시간을 먼저 확정하면 도움이 된다')
];
const history=p.topicHistoryFromRows([
 {id:'old',created_at:'2026-10-10T00:00:00Z',
  content_document:{editorial_topic_selection:{selected:{headline:'소개팅이 면접처럼 느껴지는 이유',angle_key:'first_date_interview_questions',core_insight:'질문만 하면 면접이 된다'}}},
  carousel_slides:[{title:'소개팅이 면접처럼 느껴지는 이유'}, {body:'질문만 하면 면접이 된다'}]},
 {id:'stale',created_at:'2026-07-10T00:00:00Z',carousel_slides:[{title:'만남 이후 다음 약속을 잡는 방법'}]},
 {id:'current',created_at:'2026-10-11T23:00:00Z',carousel_slides:[{title:'이번에 편집중인 콘텐츠'}]}
],[
 {created_at:'2026-10-10T00:01:00Z',result_snapshot:{draft_id:'old',carousel_slides:[{title:'소개팅이 면접처럼 느껴지는 이유'}]}},
 {created_at:'2026-10-11T00:00:00Z',result_snapshot:{draft_id:'second',carousel_slides:[{title:'서울에서 산책 중 나누는 현실적인 대화'}, {body:'서울에서 산책하다 잠시 쉬는 이야기'}]}}
],'current',now);
check(()=>assert.equal(history.length,2));
check(()=>assert.equal(history.some(h=>h.angle_key==='first_date_interview_questions'),true));
check(()=>assert.equal(history.some(h=>h.headline.includes('stale')),false));
const inspected=p.assessTopicCandidates({candidates:ideas},history,'ko',now);
check(()=>assert.equal(inspected.status,'selected'));
check(()=>assert.equal(inspected.candidates.length,5));
check(()=>assert.equal(inspected.candidates[0].status,'discarded'));
check(()=>assert.equal(inspected.candidates[0].reasons.some(s=>s.includes('유사 주제')),true));
check(()=>assert.notEqual(inspected.selected.angle_key,'first_date_interview_questions'));
check(()=>assert.equal(inspected.selected.score,100));
const weak=ideas.map((c,i)=>({...c,headline:'자연스럽게 대화 이어가기 '+i,angle_key:'empty_generic_advice_'+i,
 core_insight:'자연스럽게 대화하면 좋은 만남이 이루어집니다.',novelty:2,reader_value:1,curiosity:2,shareability:1}));
const rejected=p.assessTopicCandidates({candidates:weak},[], 'ko',now);
check(()=>assert.equal(rejected.status,'discarded'));
check(()=>assert.equal(rejected.selected,null));
check(()=>assert.equal(rejected.candidates.every(x=>x.status==='discarded'),true));
check(()=>assert.throws(()=>p.assessTopicCandidates({candidates:ideas.slice(0,4)},[],'ko',now),/five/));
const sameBatch=[ideas[1],{...ideas[1],headline:'카톡으로는 웃긴데 만나면 어색한 이유'},...ideas.slice(2,5)];
const repeated=p.assessTopicCandidates({candidates:sameBatch},[], 'ko',now);
check(()=>assert.equal(repeated.candidates[1].status,'discarded'));
check(()=>assert.equal(repeated.candidates[1].reasons.some(s=>s.includes('유사 주제')),true));
check(()=>assert.equal(p.topicCandidateSchema().properties.candidates.minItems,5));
check(()=>assert.match(p.topicDiscoveryPrompt('conversation_prompt','ko','',history),/RECENT HISTORY/));
const english=[
 candidate('Why first dates feel like job interviews','first_date_interview_questions','Questions arrive quickly, but people often need a moment to explain their own perspective.'),
 candidate('Why a quiet date feels different','quiet_date_room_to_listen','A quieter place gives both people time and room to share something personal.'),
 candidate('The small pause after meeting someone','post_meeting_pause_reflection','The moment after leaving a first date reveals the memory that stayed with you.'),
 candidate('When good messages turn into silence','text_message_meeting_gap','Face to face, you cannot edit out the pause as you could in a messaging app.'),
 candidate('What makes weekend plans so difficult','weekend_plans_choice_overload','Many options can delay a simple choice even when both people want to meet.')
].map(c=>({...c,reader_payoff:'Readers will recognize a specific point of social friction and gain a small, realistic way to think about it.',scene:'Two people meet in a busy cafe and the first few minutes feel awkward for a recognisable reason.'}));
check(()=>assert.equal(p.assessTopicCandidates({candidates:english},[], 'en',now).status,'selected'));
console.log('PASS '+assertions+' editorial topic discovery assertions. No API calls, changes to history, posts or external data.');
