import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const file='src/lib/marketing-reel-creative.ts',m={exports:{}};
const compiled=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(compiled,{exports:m.exports,module:m,URL,Set,Map,Math,Number,JSON,require:n=>n==='node:crypto'?require(n):require(n)},{filename:file});
const p=m.exports;
let assertions=0;
const check=(f)=>{f();assertions++;};
const hookKo='소개팅이 면접처럼 느껴지는 이유';
const hookEn='Why first dates feel like interviews';
check(()=>assert.equal(p.reviewFirstThreeSeconds(hookKo,'소개팅에서 질문만 계속하면 면접처럼 느껴질 수 있다.','ko').passed,true));
check(()=>assert.equal(p.reviewFirstThreeSeconds(hookEn,'First dates can feel like interviews when questions never stop.','en').passed,true));
check(()=>assert.equal(p.reviewFirstThreeSeconds('의미 있는 연결','자연스럽게 소통하세요','ko').passed,false));
check(()=>assert.equal(p.reviewFirstThreeSeconds('100% guaranteed dating success','Promise is impossible','en').passed,false));
const titles=[
 '소개팅이 면접처럼 느껴지는 이유','카톡에서는 웃긴데 만나면 어색한 이유',
 '데이트 장소에서 놓치는 중요한 소음','첫 만남 직후 친구에게 하는 말',
 '서울 주말 약속이 자꾸 미뤄지는 이유'
];
const ids=[
 'first_date_interview','texting_in_person','date_location_noise','post_date_recap','weekend_scheduling'
];
const candidates=titles.map((title,i)=>({
 title,hook_text:title,core_message:'처음 만난 사람과 대화를 이어갈 때 실제로 경험할 수 있는 구체적인 상황과 대비를 보여줍니다.',
 share_reason:'친구도 실제로 경험했을 법한 상황이라 나중에 이야기할 이유가 충분합니다.',
 format_type:p.REEL_FORMATS[i],target_audience:'서울에서 새로운 사람을 만나는 20-30대',
 estimated_duration_sec:25,novelty:5,value:5,shareability:5
}));
check(()=>assert.equal(p.evaluateReelIdeas({candidates},'ko').length,5));
check(()=>assert.equal(p.evaluateReelIdeas({candidates},'ko').filter(x=>x.status==='eligible').length>=1,true));
check(()=>assert.equal(p.evaluateReelIdeas({candidates},'ko',[titles[0]])[0].status,'discarded'));
check(()=>assert.throws(()=>p.evaluateReelIdeas({candidates:candidates.slice(1)},'ko'),/FIVE/));
const plan={
 version:1,format_type:'what_to_say_instead',language:'ko',title:hookKo,
 hook_text:hookKo,caption:'소개팅에서 질문을 던지기만 하면 대화가 면접처럼 느껴질 수 있습니다.',
 share_reason:'친구에게도 익숙한 소개팅 질문 패턴이라 함께 이야기를 나누기 좋은 영상입니다.',
 voiceover_script:'소개팅에서 내가 하는 질문만 이어지면 면접처럼 느껴질 수도 있습니다. 자신의 경험을 한 조각 먼저 꺼내보세요.',
 cta_soft:'서울의 새로운 만남에 대한 이야기는 Roundy에서 이어집니다.',
 scenes:[
  {role:'hook',duration_sec:3,overlay_text:hookKo,voiceover_line:'질문만 오가는 첫 만남이 어색한 이유입니다.',asset_id:null},
  {role:'body',duration_sec:6,overlay_text:'취미는요? 직업은요?',voiceover_line:'질문 두 개만 연속으로 하면 이력서를 읽는 기분이 들 수 있죠.',asset_id:null},
  {role:'body',duration_sec:6,overlay_text:'내 이야기 한 조각부터',voiceover_line:'그 대신 내 경험을 짧게 꺼내 상대가 이야기할 여유를 만들어 보세요.',asset_id:null},
  {role:'body',duration_sec:6,overlay_text:'답보다 경험을 주고받기',voiceover_line:'상대의 답에서 새로운 경험이 이어질 때 어색함이 줄어들 수도 있습니다.',asset_id:null},
  {role:'ending',duration_sec:6,overlay_text:'질문 세 개보다 공감 한 번',voiceover_line:'좋은 대화는 질문 수가 아니라 이야기의 흐름에 있습니다.',asset_id:null}
 ]
};
const valid=p.validateReelPlan(plan,'ko');
check(()=>assert.equal(valid.duration_seconds,27));
check(()=>assert.equal(valid.scenes[0].duration_sec,3));
check(()=>assert.equal(valid.hook_review.passed,true));
check(()=>assert.equal(valid.scenes[4].role,'ending'));
check(()=>assert.equal(p.reelPlanHash(valid),p.reelPlanHash(p.validateReelPlan(valid,'ko'))));
check(()=>assert.equal(p.reelPlanHash(valid).length,64));
check(()=>assert.throws(()=>p.validateReelPlan({...plan,scenes:[{...plan.scenes[0],duration_sec:4},...plan.scenes.slice(1)]},'ko'),/3_SECOND_HOOK|SCENE_TIMELINE/));
check(()=>assert.throws(()=>p.validateReelPlan({...plan,scenes:plan.scenes.slice(0,2)},'ko'),/STORYBOARD_INVALID/));
check(()=>assert.throws(()=>p.validateReelPlan({...plan,scenes:[{...plan.scenes[0],overlay_text:'Completely new text'},...plan.scenes.slice(1)]},'ko'),/OPENING_MUST_MATCH/));
check(()=>assert.throws(()=>p.validateReelPlan({...plan,language:'en'},'ko'),/LANGUAGE_MISMATCH/));
check(()=>assert.throws(()=>p.validateReelPlan({...plan,scenes:[...plan.scenes.slice(0,2),{...plan.scenes[2],asset_id:'../../private'},...plan.scenes.slice(3)]},'ko'),/ASSET_ID_INVALID/));
check(()=>assert.throws(()=>p.validateReelPlan({...plan,caption:'100% guaranteed success!'},'ko'),/UNSUPPORTED_CLAIM/));
check(()=>assert.deepEqual([...p.REEL_FORMATS],['myth_vs_reality','three_quick_tips','awkward_moment_fix','what_to_say_instead','relatable_observation']));
check(()=>assert.equal(p.reelIdeasJsonSchema().properties.candidates.minItems,5));
check(()=>assert.equal(p.reelScriptJsonSchema().properties.scenes.maxItems,5));
check(()=>assert.match(p.reelAiIdeasPrompt('ko','people',[]),/FIVE/));
check(()=>assert.match(p.reelAiScriptPrompt('ko',p.evaluateReelIdeas({candidates},'ko')[0]),/FIRST scene is exactly 3 seconds/));
const rights={
 kind:'licensed_video',creator:'Original Creator',source_url:'https://example.org/clip',
 license_url:'https://example.org/license',license_note:'Commercial adaptation and repost license granted.',
 original_owned:false,rights_attested:true,commercial_use_allowed:true,modifications_allowed:true
};
check(()=>assert.equal(p.videoSourceRights(rights).kind,'licensed_video'));
check(()=>assert.throws(()=>p.videoSourceRights({...rights,source_url:'javascript:alert(1)'}),/SOURCE_AND_LICENSE_REQUIRED/));
check(()=>assert.throws(()=>p.videoSourceRights({...rights,modifications_allowed:false}),/RIGHTS_EVIDENCE_REQUIRED/));
check(()=>assert.equal(p.videoSourceRights({...rights,original_owned:true,source_url:'',license_url:''}).original_owned,true));
check(()=>assert.equal(p.videoSourceRights({...rights,kind:'ai_image',ai_model:'gpt-image-2.5-flare',source_url:'',license_url:''}).kind,'ai_image'));
for(const file of ['src/lib/marketing-reel-creative-service.ts','src/lib/marketing-reels.ts',
 'src/lib/marketing-reel-timeline-renderer.ts','src/components/admin-marketing-reel-creative.tsx',
 'src/components/admin-marketing-reels.tsx','src/components/admin-marketing-reel-creative.css',
 'supabase/migrations/20261012090000_reel_studio_creative_assets.sql']){
 check(()=>assert.ok(read(file).length>100,file));
}
const service=read('src/lib/marketing-reel-creative-service.ts');
const route=read('src/lib/marketing-reels.ts');
const renderer=read('src/lib/marketing-reel-timeline-renderer.ts');
const ui=read('src/components/admin-marketing-reel-creative.tsx');
const migration=read('supabase/migrations/20261012090000_reel_studio_creative_assets.sql');
check(()=>assert.match(service,/reserve_marketing_reel_ai/));
check(()=>assert.match(service,/verifiedSceneAssets/));
check(()=>assert.match(service,/REEL_APPROVED_ASSETS_ONLY/));
check(()=>assert.match(service,/version_parent_id:source.id/));
check(()=>assert.match(service,/source_kind:null/));
check(()=>assert.match(service,/rights_attested:false,status:'draft'/));
check(()=>assert.match(route,/await assertReadyReelPlan\(service,row\)/));
check(()=>assert.match(route,/rendered_plan_hash:plan\?reelPlanHash\(plan\):null/));
check(()=>assert.match(route,/enqueue_instagram_reel/));
check(()=>assert.match(renderer,/ctx\.drawImage\(source/));
check(()=>assert.match(renderer,/next\.video\.play/));
check(()=>assert.match(renderer,/canvas\.width=720;canvas\.height=1280/));
check(()=>assert.match(renderer,/REEL_OVERLAY_NEEDS_SHORTER_COPY/));
check(()=>assert.match(ui,/AI 주제 후보 5개/));
check(()=>assert.match(ui,/onDraftCreated/));
check(()=>assert.match(ui,/createTimelineReel/));
check(()=>assert.match(ui,/rightsConfirmed/));
check(()=>assert.match(ui,/video.*controls/));
check(()=>assert.match(migration,/guard_reel_storyboard_queue/));
check(()=>assert.match(migration,/guard_reel_asset_immutable/));
check(()=>assert.match(migration,/marketing_reel_ai_runs/));
check(()=>assert.match(migration,/public\.marketing_ai_control/));
check(()=>assert.match(migration,/version_parent_id/));
check(()=>assert.match(migration,/upsert:false|No browser update\/delete/));
check(()=>assert.doesNotMatch(migration,/\b(delete from|truncate|drop table)\s+public\.(instagram_reel_drafts|instagram_post_drafts)/i));
console.log('PASS '+assertions+' Reel Studio Stage 4 assertions: KO/EN hook gates, 5 ideas, 15-30 second 9:16 storyboard, video+AI assets, budget+rights+version+publisher safety.');
