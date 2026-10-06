import assert from 'node:assert/strict';
import fs from 'node:fs';
import {harness} from './test-marketing-compact-runtime.mjs';
let checks=0;const check=f=>{f();checks++;};
const sourceId='b4f06003-4779-4a1d-9cae-8c895089fe31';
const pieces={
 cover:['낯선 사람과 첫 대화','다음 질문보다 상대의 답을 먼저 들어보세요.','Notice their answer before planning another question.'],
 scenario:['자리부터 편하게 정해요','서로의 목소리가 들리는 자리를 골라 대화를 시작해보세요.','Choose a seat where you can both hear the conversation.'],
 etiquette:['늦는다면 먼저 연락해요','늦을 것 같으면 도착할 시간을 미리 알려주세요.','Send your expected arrival time when running late.'],
 plan:['다음 일정도 미리 알려줘요','나가야 하는 시간이 있다면 만났을 때 이야기해두세요.','Mention another commitment at the start of the meeting.'],
 checklist:['마지막으로 장소 확인','출구와 건물 입구를 서로 같은 곳으로 알고 있는지 확인하세요.','Check that you both mean the same exit and entrance.'],
 contrast:['솔직함에도 여러 방식','생각을 바로 말하거나 한 번 더 묻는 방식 모두 써볼 수 있어요.','You can state your view directly or ask a question first.'],
 example:['조금 더 구체적으로 묻기','“산책했어요.”라고 하면 “어떤 길을 걸었어요?”라고 물어보세요.','When they mention a walk, ask which route they took.'],
 reflection:['내 방식도 돌아보기','주로 듣는 편인지 바로 의견을 말하는 편인지 생각해보세요.','Consider whether you tend to listen or share an opinion first.'],
 cta:['라운디에서 만나요','서울에서 한 사람씩 직접 만나보세요.','Meet one person at a time in Seoul.'],
};
function scenario(language,topic,length=88){
 const h=harness(language),p=h.presentation;
 h.copy.post_type=topic;h.copy.cta='x'.repeat(length);
 h.copy.slides=h.policy.CONTENT_PROFILES[topic].roles.map(role=>{const [title,ko,en]=pieces[role];return {role,eyebrow:'',title:language==='ko'?title:({cover:'Start with the answer',scenario:'Choose a comfortable seat',etiquette:'Send a quick update',plan:'Share your timing',checklist:'Check the meeting point',contrast:'Different ways to be direct',example:'Ask about one detail',reflection:'Notice your usual response',cta:'Meet in Seoul'}[role]),body:language==='ko'?ko:en,secondary_body:language==='ko'?en:ko,highlight:'',options:[],source_ids:[]};});
 const request={mode:'both',content_mode:'growth_carousel',topic_type:topic,visual_mode:'cards',language,instruction:'',confirm_photo:false,render_only:false};
 const doc=structuredClone(h.copy);
 const source={id:sourceId,generation_thread_id:sourceId,attempt_number:1,draft_id:h.id,status:'failed',automatic:false,operation:'copy',error_code:'GENERATION_FAILED',error_message:'품질 검토 필요: '+h.recovery.LEGACY_CTA_FAILURE,request_payload:request,reserved_usd:.02,input_tokens:1492,output_tokens:776,created_at:'2026-10-05T00:00:00Z',result_snapshot:{draft_id:h.id,content_document:doc,content_language:language,quality_report:{version:2,status:'rejected',issues:[h.recovery.LEGACY_CTA_FAILURE],review_required:true},research_sources:[],research_status:'generated',draft_kind:'growth_carousel',growth_topic_type:topic,content_mode:'prelaunch',content_pillar:'concept',generation_reason:'Regression fixture',images:[]}};
 h.tables.marketing_generation_jobs.push(source);
 return {...h,source,request,p};
}
for(const language of ['ko','en'])for(const topic of ['seoul_dating','dating_archetype'])for(const length of [88,99,0]){
 const h=scenario(language,topic,length),raw=structuredClone(h.source.result_snapshot),before=JSON.stringify(h.source),ctx={threadId:sourceId,attemptNumber:2,retryOfJobId:sourceId,recoverySourceJobId:sourceId};
 const input={...h.request,request_key:'recover:test-'+language+'-'+topic+'-'+length,revision:1};
 check(()=>assert.equal(h.recovery.canRecoverSavedCta(h.source),true));
 const prepared=h.policy.prepareContent(raw.content_document,topic,language,[]);
 check(()=>assert.equal(prepared.report.status,'passed',JSON.stringify(prepared.report)));
 check(()=>assert.equal(prepared.cta,h.p.generatedCta(language)));
 check(()=>assert.equal(prepared.document.cta,prepared.cta));
 check(()=>assert.deepEqual(prepared.document.slides.slice(0,-1).map(s=>s.body),raw.content_document.slides.slice(0,-1).map(s=>s.body)));
 const result=await h.api.runGeneration(h.id,input,null,false,ctx);
 check(()=>assert.equal(result.job.status,'completed',JSON.stringify(result)));
 check(()=>assert.equal(h.requests.length,0));
 check(()=>assert.equal(h.reservations[0].p_operation,'render'));
 check(()=>assert.equal(result.job.reserved_usd,0));
 check(()=>assert.equal(result.draft.images.length,6));
 check(()=>assert.equal(result.draft.cta,h.p.generatedCta(language)));
 check(()=>assert.equal(result.job.result_snapshot.recovery.source_job_id,sourceId));
 check(()=>assert.equal(result.job.result_snapshot.recovery.additional_paid_calls,0));
 check(()=>assert.equal(JSON.stringify(h.source),before));
 const newJob=h.tables.marketing_generation_jobs.at(-1);
 check(()=>assert.equal(newJob.generation_thread_id,sourceId));
 check(()=>assert.equal(newJob.attempt_number,2));
 check(()=>assert.equal(newJob.request_payload.saved_recovery_of,sourceId));
 const duplicated=await h.api.runGeneration(h.id,input,null,false,ctx);
 check(()=>assert.equal(duplicated.deduplicated,true));
 check(()=>assert.equal(h.requests.length,0));
 const schema=h.policy.contentSchema(topic,language);
 check(()=>assert.equal(schema.properties.cta.enum[0],h.p.generatedCta(language)));
 check(()=>assert.equal(schema.properties.cta.maxLength,70));
 check(()=>assert.equal(schema.properties.cta.minLength,1));
}
{
 const h=scenario('ko','dating_archetype');
 check(()=>assert.deepEqual(Array.from(h.p.captionCtaIssues('valid','x'.repeat(70))),[]));
 check(()=>assert.ok(h.p.captionCtaIssues('valid','x'.repeat(71)).some(s=>s.includes('CTA')&&s.includes('71'))));
 check(()=>assert.ok(h.p.captionCtaIssues('', 'x').some(s=>s==='캡션이 비어 있습니다.')));
 check(()=>assert.ok(h.p.captionCtaIssues('x'.repeat(2001),'ok').some(s=>s.includes('2001')&&s.includes('캡션'))));
 for(const change of [{status:'completed'},{status:'uncertain'},{automatic:true},{operation:'photo'},{error_code:'CONTENT_QUALITY_REJECTED'}])check(()=>assert.equal(h.recovery.canRecoverSavedCta({...h.source,...change}),false));
 const missing=structuredClone(h.source);missing.result_snapshot.quality_report.issues=['실제 인용된 출처가 없습니다.'];check(()=>assert.equal(h.recovery.canRecoverSavedCta(missing),false));
 const longCaption=structuredClone(h.source);longCaption.result_snapshot.content_document.caption_ko='가'.repeat(401);check(()=>assert.throws(()=>h.recovery.prepareSavedCtaRecovery(longCaption)));
 const missingLanguage=structuredClone(h.source);missingLanguage.result_snapshot.content_document.caption_ko='';check(()=>assert.throws(()=>h.recovery.prepareSavedCtaRecovery(missingLanguage)));
 const missingSource=structuredClone(h.source);missingSource.result_snapshot.content_document.slides[1].source_ids=['FAKE'];check(()=>assert.throws(()=>h.recovery.prepareSavedCtaRecovery(missingSource)));
 const legacy=structuredClone(h.source);delete legacy.result_snapshot.content_document.design_preset;check(()=>assert.equal(h.recovery.canRecoverSavedCta(legacy),false));
 const altered=structuredClone(h.source);altered.result_snapshot.content_document.post_type='seoul_dating';check(()=>assert.throws(()=>h.recovery.prepareSavedCtaRecovery(altered)));
}
for(const bad of ['thread','topic','automatic','photo','caption']){
 const h=scenario('ko','seoul_dating'),ctx={threadId:sourceId,attemptNumber:2,retryOfJobId:sourceId,recoverySourceJobId:sourceId};
 const input={...h.request,request_key:'recover:bad-'+bad,revision:1};
 if(bad==='thread')ctx.threadId='cf4cc3e2-113e-45f7-9768-21101ba51d2c';
 if(bad==='topic')input.topic_type='dating_archetype';
 if(bad==='photo'){input.visual_mode='photo';input.confirm_photo=true;}
 if(bad==='caption')h.source.result_snapshot.content_document.caption_ko='';
 await assert.rejects(h.api.runGeneration(h.id,input,null,bad==='automatic',ctx));checks++;
 check(()=>assert.equal(h.requests.length,0));check(()=>assert.equal(h.reservations.length,0));
}
{
 const h=harness('ko');
 for(const type of ['book_insight','dating_myth','trend_research']){
  const task=h.research.buildMarketingResearchTask(type,'','ko');
  check(()=>assert.ok(task.includes('THREE targeted')));
  check(()=>assert.ok(type==='book_insight'?task.includes('published book'):type==='dating_myth'?task.includes('Asking more questions'):task.includes('underestimate')));
 }
 const chosen=h.research.buildMarketingResearchTask('dating_myth','첫인상과 말의 속도에 대한 연구','ko');check(()=>assert.ok(chosen.includes('첫인상과 말의 속도')));
 check(()=>assert.throws(()=>h.research.buildMarketingResearchTask('mini_quiz','','ko')));
 const source=fs.readFileSync('src/lib/marketing-editorial.ts','utf8');
 check(()=>assert.ok(source.includes('input:researchTask')));check(()=>assert.ok(source.includes('cache.search_completed===true')));check(()=>assert.ok(source.includes('search_completed:evidence.completed&&sources.length>0')));check(()=>assert.ok(source.includes('max_tool_calls:3')));
 const ui=fs.readFileSync('src/components/admin-marketing.tsx','utf8');check(()=>assert.ok(ui.includes('저장된 결과로 무료 복구')));check(()=>assert.ok(ui.includes('recover_saved_result:freeRecovery')));
 const api=fs.readFileSync('src/lib/marketing.ts','utf8');check(()=>assert.ok(api.includes('confirmation.recover_saved_result===true&&!recoverySourceJobId')));
}
console.log('PASS '+checks+' CTA/recovery/topic assertions. All provider calls mocked; saved-result recovery makes zero provider requests.');
