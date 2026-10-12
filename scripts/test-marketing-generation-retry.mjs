import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=path=>fs.readFileSync(path,'utf8');
const compile=code=>ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
function declaration(path,name){
 const text=source(path),file=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);
 const node=file.statements.find(s=>ts.isFunctionDeclaration(s)?s.name?.text===name:
  ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(file)===name));
 assert.ok(node,`Missing production declaration ${name}`);return node.getText(file);
}
// Execute the ACTUAL production validator and enum declarations, without loading
// the paid provider, Supabase, renderer or any environmental credentials.
const validatorCode=[
 ...['CAMPAIGN_PATTERNS','CAMPAIGN_TONES'].map(n=>declaration('src/lib/marketing-campaign.ts',n)),
 ...['EVENT_CAMPAIGN_STAGES','EVENT_CAMPAIGN_PATTERNS'].map(n=>declaration('src/lib/marketing-event-campaign.ts',n)),
 ...['topics','allowedTopics','validateGenerationInput'].map(n=>declaration('src/lib/marketing-generation.ts',n)),
].join('\n');
const validation={exports:{},Error};vm.runInNewContext(compile(validatorCode),validation);
const validate=validation.exports.validateGenerationInput;
const helper={exports:{},Error};vm.runInNewContext(compile(source('src/lib/marketing-generation-retry.ts')),helper);
const restore=helper.exports.restoreSavedGenerationInput;
const roundtrip=value=>JSON.parse(JSON.stringify(value));
const key='fixture_saved_topic';
// Same serialized option shape as the reported failed MBTI job, with synthetic
// identifiers and content. Explicit nulls must survive the fixture roundtrip.
const snapshot=roundtrip({mode:'both',event_id:null,language:'ko',trend_id:null,
 topic_type:'mbti',instruction:'Keep the saved topic and original Korean direction.',
 launch_date:null,photo_first:true,render_only:false,visual_mode:'cards',content_mode:'growth_carousel',
 ai_image_slot:0,campaign_tone:null,carousel_plan:{mode:'fixed',version:1,slide_count:5,
  body_font_size_px:36,reservation_number:null,title_font_size_px:72},confirm_photo:false,
 visual_source:'stock',editorial_lane:'auto',campaign_pattern:null,story_card_count:5,
 selected_topic_key:null,brand_outro_enabled:true,answer_first_enabled:true,
 event_campaign_stage:null,event_campaign_pattern:null,
 topic_selection:{selected:null,candidates:[{angle_key:key,headline:'Saved fixture topic',status:'discarded',reasons:['Needs editorial review']}]} });
const withRequest=extra=>({...snapshot,request_key:'retry:fixture-request-001',revision:2,...extra});
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
check('baseline snapshot reproduces INVALID_CAMPAIGN_PATTERN',()=>assert.throws(()=>validate(withRequest()),/INVALID_CAMPAIGN_PATTERN/));
check('restored snapshot passes unchanged strict validation',()=>{
 const parsed=validate(restore(withRequest()));assert.equal(parsed.content_mode,'growth_carousel');assert.equal(parsed.topic_type,'mbti');
 assert.equal(parsed.language,'ko');assert.equal(parsed.ai_image_slot,0);assert.equal(parsed.story_card_count,5);
 assert.equal(parsed.campaign_pattern,undefined);assert.equal(parsed.event_id,undefined);
});
for(const topic of ['mbti','dating_myth','conversation_prompt','trend_research'])for(const language of ['ko','en'])check(topic+' / '+language+' replay',()=>{
 const parsed=validate(restore(withRequest({topic_type:topic,language})));assert.equal(parsed.topic_type,topic);assert.equal(parsed.language,language);
});
check('explicit no-AI, false flags, nested nulls and saved topic are preserved',()=>{
 const v=restore(withRequest({ai_image_slot:null,answer_first_enabled:false,brand_outro_enabled:false}));
 assert.equal(v.ai_image_slot,null);assert.equal(v.answer_first_enabled,false);assert.equal(v.brand_outro_enabled,false);
 assert.equal(v.carousel_plan.reservation_number,null);assert.equal(v.topic_selection.selected,null);
 assert.equal(v.topic_selection.candidates[0].angle_key,key);assert.equal(v.instruction,snapshot.instruction);
});
check('original snapshot remains byte-equivalent',()=>{const before=JSON.stringify(snapshot);restore(snapshot);assert.equal(JSON.stringify(snapshot),before);});
check('optional null length/lane flags are treated as omitted',()=>assert.doesNotThrow(()=>validate(restore(withRequest({story_card_count:null,editorial_lane:null,answer_first_enabled:null})))));
check('prelaunch null defaults work without event contamination',()=>{
 const v=validate(restore(withRequest({content_mode:'prelaunch',topic_type:null})));assert.equal(v.campaign_pattern,'auto');assert.equal(v.campaign_tone,'modern_premium');
});
check('live event defaults preserve event identifier',()=>{
 const event='11111111-1111-4111-8111-111111111111';
 const v=validate(restore(withRequest({content_mode:'live_event',topic_type:null,event_id:event})));
 assert.equal(v.event_id,event);assert.equal(v.event_campaign_stage,'auto');assert.equal(v.event_campaign_pattern,'auto');
});
for(const ai_image_slot of [0,null])check('image retry ignores snapshot-derived AI slot '+ai_image_slot,()=>{
 const v=validate(restore(withRequest({mode:'image',render_only:true,ai_image_slot})));assert.equal(v.ai_image_slot,undefined);assert.equal(v.render_only,true);
});
for(const visual_source of ['none','uploaded'])check(visual_source+' retry omits inapplicable resolved AI slot',()=>{
 const v=validate(restore(withRequest({mode:'text',visual_source})));assert.equal(v.ai_image_slot,undefined);
});
check('photographic campaign replay still requires paid confirmation',()=>{
 const raw=withRequest({content_mode:'prelaunch',visual_mode:'photo',visual_source:'auto_ai',confirm_photo:false});
 assert.throws(()=>validate(restore(raw)),/CONFIRM_PAID_PHOTO_FIRST/);
 assert.doesNotThrow(()=>validate(restore({...raw,confirm_photo:true})));
});
for(const [extra,error] of [
 [{campaign_pattern:'invented'},/INVALID_CAMPAIGN_PATTERN/],
 [{campaign_pattern:'poster'},/CAMPAIGN_OPTIONS_PRELAUNCH_ONLY/],
 [{event_id:'11111111-1111-4111-8111-111111111111'},/EVENT_OPTIONS_LIVE_EVENT_ONLY/],
 [{campaign_tone:'wrong'},/INVALID_CAMPAIGN_TONE/],
 [{ai_image_slot:9},/INVALID_AI_IMAGE_SLOT/],
 [{story_card_count:4},/INVALID_STORY_CARD_COUNT/],
 [{content_mode:null},/INVALID_GENERATION_OPTIONS/],
 [{language:'xx'},/INVALID_CONTENT_LANGUAGE/],
])check('invalid non-null or required values still fail '+error,()=>assert.throws(()=>validate(restore(withRequest(extra))),error));
for(const raw of [null,[],1,'invalid'])check('malformed snapshot '+JSON.stringify(raw),()=>assert.throws(()=>restore(raw),/RETRY_PAYLOAD_UNAVAILABLE/));

// Exercise the real retry HTTP handler, using the real request validator and a
// stopped-before-provider runGeneration stub. DB writes and fetches are forbidden.
const originalId='22222222-2222-4222-8222-222222222222',draftId='33333333-3333-4333-8333-333333333333';
async function retryRoute({jobPatch={},draftPatch={},confirmation={},signedIn=true,newer=false}={}){
 const job={id:originalId,draft_id:draftId,generation_thread_id:originalId,content_workflow_id:originalId,
  attempt_number:1,status:'failed',automatic:false,operation:'copy_photo',request_payload:roundtrip(snapshot),...jobPatch};
 const draft={id:draftId,status:'needs_approval',revision:3,...draftPatch};
 const calls=[],rows={marketing_generation_jobs:[...(newer?[{...job,id:'44444444-4444-4444-8444-444444444444',attempt_number:2}]:[]),job],instagram_post_drafts:[draft]};
 const before=JSON.stringify(rows);
 class Q{
  constructor(table){this.rows=rows[table]||[];this.filters=[];this.n=Infinity;}
  select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}order(){return this;}limit(n){this.n=n;return this;}
  maybeSingle(){return Promise.resolve({data:roundtrip(this.rows.filter(r=>this.filters.every(f=>f(r))).slice(0,this.n)[0]||null),error:null});}
  update(){throw Error('Unexpected DB write');}insert(){throw Error('Unexpected DB write');}
 }
 const service={from:table=>new Q(table),rpc:()=>{throw Error('Unexpected DB RPC');}};
 const context={exports:{},Error,console,URL,Date,process:{env:{}},fetch:()=>{throw Error('Unexpected network request');},require:name=>{
  if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options.status})}};
  if(name==='node:crypto')return require(name);
  if(name==='./supabase/service')return {createServiceRoleClient:()=>service};
  if(name==='./marketing-generation-retry')return helper.exports;
  if(name==='./marketing-output-recovery')return {savedCtaRecoverySource:()=>null};
  if(name==='./marketing-generation')return {validateGenerationInput:validate,runGeneration:async(id,payload,actor,automatic,thread)=>{
   const parsed=validate(payload);calls.push({id,parsed,actor,automatic,thread});
   return {draft:{...draft},job:{id:'fixture-new-attempt',status:'completed',stage:'editorial_review_required'},review_required:true};
  }};
  return {};
 }};
 vm.runInNewContext(compile(source('src/lib/marketing.ts')),context);
 const request={method:'POST',json:async()=>({confirm_retry:true,confirm_paid_photo:true,selected_topic_key:key,...confirmation})};
 const client={auth:{getUser:async()=>({data:{user:signedIn?{id:'fixture-admin'}:null}})}};
 const response=await context.exports.marketingApi(request,client,['generation','jobs',originalId,'retry']);
 assert.equal(JSON.stringify(rows),before,'Existing job/draft changed');return {response,calls};
}
if(process.argv.includes('--expect-unfixed')){
 const {response,calls}=await retryRoute();assert.equal(response.status,400);assert.equal(response.body.error,'INVALID_CAMPAIGN_PATTERN');assert.equal(calls.length,0);
 console.log('REPRODUCED: real retry route rejects its own saved null campaign fields before provider execution.');
}else{
 const {response,calls}=await retryRoute();
 check('real retry route accepts the saved topic request',()=>{assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(calls.length,1);});
 check('selected candidate, thread, revision and language stay intact',()=>{
  const call=calls[0];assert.equal(call.thread.selectedTopicKey,key);assert.equal(call.thread.retryOfJobId,originalId);
  assert.equal(call.thread.attemptNumber,2);assert.equal(call.parsed.revision,3);assert.equal(call.parsed.topic_type,'mbti');
  assert.equal(call.parsed.language,'ko');assert.equal(call.automatic,false);assert.match(call.parsed.request_key,/^retry:/);
  assert.equal(call.parsed.confirm_photo,true);assert.equal(call.parsed.ai_image_slot,0);
 });
 for(const [name,args,status,error] of [
  ['confirmation',{confirmation:{confirm_retry:false}},400,'RETRY_CONFIRMATION_REQUIRED'],
  ['paid image confirmation',{confirmation:{confirm_paid_photo:false}},400,'CONFIRM_PAID_PHOTO_FIRST'],
  ['signed-in actor',{signedIn:false},401,'Sign in required'],
  ['uncertain outcome',{jobPatch:{status:'uncertain'}},400,'RETRY_ONLY_FAILED_MANUAL'],
  ['completed job',{jobPatch:{status:'completed'}},400,'RETRY_ONLY_FAILED_MANUAL'],
  ['automatic job',{jobPatch:{automatic:true}},400,'RETRY_ONLY_FAILED_MANUAL'],
  ['superseded attempt',{newer:true},409,'GENERATION_THREAD_NOT_RETRYABLE'],
  ['published draft',{draftPatch:{status:'published'}},409,'DRAFT_NOT_EDITABLE'],
  ['unknown topic',{confirmation:{selected_topic_key:'not-in-snapshot'}},400,'SAVED_TOPIC_NOT_SELECTABLE'],
  ['invalid saved pattern',{jobPatch:{request_payload:{...snapshot,campaign_pattern:'invented'}}},400,'INVALID_CAMPAIGN_PATTERN'],
 ]){
  const result=await retryRoute(args);check(name+' gate preserved',()=>{assert.equal(result.response.status,status);assert.equal(result.response.body.error,error);assert.equal(result.calls.length,0);});
 }
 const noSelection=await retryRoute({confirmation:{selected_topic_key:undefined}});
 check('ordinary retry also replays successfully',()=>{assert.equal(noSelection.response.status,200);assert.equal(noSelection.calls.length,1);});
 console.log(`PASS ${checks} saved-request and real retry-route assertions; no live AI, database writes or Instagram publishing.`);
}
