import assert from 'node:assert/strict';import {centralHarness} from './marketing-central-harness.mjs';
const h=await centralHarness();let n=0;
try{
 const start=await h.controller.startContentWorkflow(h.db,h.frozen,h.actor),id=start.content.id;
 assert.equal((await h.controller.startContentWorkflow(h.db,h.frozen,h.actor)).content.id,id);n++;
 await assert.rejects(()=>h.controller.startContentWorkflow(h.db,{...h.frozen,editorial_series:'read_the_room'},h.actor),/IDEMPOTENCY_KEY_CONFLICT/);n++;
 let r=await h.task(id);assert.equal(r.content.stage,'media',JSON.stringify(r));assert.equal(h.counts.copy,1);n++;
 r=await h.task(id);assert.equal(r.content.status,'blocked');assert.equal(r.content.required_action,'photo_approval_required');n++;
 await h.photos(id);await h.resume(id);r=await h.task(id);assert.equal(r.content.stage,'render');n++;
 h.failRender();r=await h.task(id);assert.equal(r.content.status,'failed');assert.equal(r.content.stage,'render');n++;
 await h.resume(id);r=await h.task(id);assert.equal(r.content.stage,'review');assert.equal(h.counts.copy,1);n++;
 r=await h.task(id);assert.equal(r.content.required_action,'final_approval_required',JSON.stringify(r));n++;
 assert.equal((await h.q('select count(*)::int n from marketing_runs'))[0].n,0);n++;
 // The real approval RPC, all real triggers and the fixed 3+brand reservation run without a Meta call.
 const detail=await h.controller.contentDetail(h.db,id),report=h.load('src/lib/marketing-preflight-service.ts');
 const pf=await report.reviewMarketingDraft(h.db,detail.draft),quality=report.mergePreflightQuality(h.load('src/lib/marketing-editorial.ts').draftQuality(detail.draft),pf);
 const scheduled=await h.rpc('approve_marketing_content',{p_content:id,p_state:detail.content.state_version,p_actor:h.actor,p_report:quality});
 assert.equal(scheduled.content.status,'scheduled');assert.equal(scheduled.publication.run.snapshot.feed_carousel_count,3);n++;
 // A 5+brand mixed-media render can resume without purchasing the AI image twice.
 const mixed=await h.controller.startContentWorkflow(h.db,{...h.frozen,request_key:'manual:mixed-media-runtime',story_card_count:5,ai_image_slot:0},h.actor),mid=mixed.content.id;
 await h.task(mid);await h.task(mid);await h.photos(mid);await h.resume(mid);await h.task(mid);
 h.failRender();let m=await h.task(mid);assert.equal(m.content.status,'failed',JSON.stringify(m));assert.equal(h.counts.images,1);n++;
 const rawCount=h.uploads.filter(x=>x.bucket==='marketing-images').length;assert.equal(rawCount,1);n++;
 await h.resume(mid);m=await h.task(mid);assert.equal(m.content.stage,'review');assert.equal(h.counts.images,1);n++;
 m=await h.task(mid);assert.equal(m.content.required_action,'final_approval_required',JSON.stringify(m));n++;
 const beforeState=m.content.state_version,photo=(await h.q('select asset_id from marketing_draft_photos where draft_id=$1 limit 1',[mid]))[0].asset_id;
 await h.q("update marketing_photo_assets set reviewed_at=reviewed_at+interval '1 second' where id=$1",[photo]);
 assert.equal((await h.state(mid)).stage,'media');assert.ok((await h.state(mid)).state_version>beforeState);n++;
 await assert.rejects(()=>h.rpc('approve_marketing_content',{p_content:mid,p_state:beforeState,p_actor:h.actor,p_report:quality}),/CONTENT_CHANGED_REFRESH/);n++;
 // Real manual editing must retain version 1 and invalidate only its dependent media/render/review outputs.
 const old=(await h.q('select snapshot from marketing_content_versions where content_id=$1 and version=1',[mid]))[0].snapshot;
 const edited=await h.rpc('edit_marketing_content_copy',{p_content:mid,p_state:(await h.state(mid)).state_version,p_actor:h.actor,p_snapshot:{...old,caption:old.caption+'\n수정한 캡션'}});
 assert.equal(edited.version,2);assert.equal((await h.q('select snapshot from marketing_content_versions where content_id=$1 and version=1',[mid]))[0].snapshot.caption,old.caption);n++;
 assert.equal((await h.q('select images from instagram_post_drafts where id=$1',[mid]))[0].images.length,0);n++;
 // A researched post executes discovery separately. A failed writer retries only copy with saved evidence.
 const researched=await h.controller.startContentWorkflow(h.db,{...h.frozen,request_key:'manual:research-runtime',topic_type:'seoul_dating',story_card_count:5},h.actor),rid=researched.content.id;
 const callsBefore=h.counts.discovery;let research=await h.task(rid);assert.equal(research.content.stage,'copy',JSON.stringify(research));assert.equal(h.counts.discovery,callsBefore+1);n++;
 h.failCopy();research=await h.task(rid);assert.equal(research.content.status,'failed');assert.equal(research.content.stage,'copy');n++;
 await h.resume(rid);research=await h.task(rid);assert.equal(research.content.stage,'media',JSON.stringify(research));assert.equal(h.counts.discovery,callsBefore+1);n++;
 await h.task(rid);const refine=await h.rpc('refine_marketing_content_subject',{p_content:rid,p_state:(await h.state(rid)).state_version,p_actor:h.actor,p_instruction:'변경한 장소 비교 소재',p_confirm_paid:true});
 assert.equal(refine.version,2);assert.equal(refine.stage,'discovery');assert.ok((await h.q('select snapshot from marketing_content_versions where content_id=$1 and version=1',[rid]))[0].snapshot);n++;
 await h.rpc('archive_marketing_content',{p_content:rid,p_state:refine.state_version});
 // All supported editorial subjects use the same durable entrypoint, with discovery only where required.
 const topics=['mbti','dating_archetype','book_insight','trend_research','meme_remix','dating_myth','conversation_prompt','seoul_dating','korea_life','mini_quiz'];
 for(const topic of topics){
  const begin=await h.controller.startContentWorkflow(h.db,{...h.frozen,request_key:'manual:topic-matrix-'+topic,topic_type:topic,language:'en',story_card_count:5,instruction:topic==='book_insight'?"You're Not Listening":'Keep the selected subject.'},h.actor);
  let value=await h.task(begin.content.id);if(value.content.stage==='copy'&&value.content.status==='queued')value=await h.task(begin.content.id);
  if(topic==='book_insight'){assert.equal(value.content.required_action,'copy_review_required');assert.equal(value.content.error_code,'EDITORIAL_COPY_QUALITY_REJECTED');assert.ok((await h.q('select snapshot from marketing_content_versions where content_id=$1',[begin.content.id]))[0].snapshot);}else assert.equal(value.content.stage,'media',topic+': '+JSON.stringify(value));n++;
  await h.rpc('archive_marketing_content',{p_content:begin.content.id,p_state:value.content.state_version});
 }
 const brand=await h.controller.startContentWorkflow(h.db,{...h.frozen,request_key:'manual:brand-matrix',content_mode:'prelaunch',topic_type:undefined},h.actor);
 const brandResult=await h.task(brand.content.id);assert.equal(brandResult.content.stage,'media',JSON.stringify(brandResult));n++;
 await h.rpc('archive_marketing_content',{p_content:brand.content.id,p_state:brandResult.content.state_version});
 // Pausing cannot route to the legacy writer or discard already completed stages.
 await h.pg.exec('update marketing_content_workflow_control set enabled=false');
 await assert.rejects(()=>h.controller.startContentWorkflow(h.db,{...h.frozen,request_key:'manual:paused-runtime'},h.actor),e=>e.message==='CONTENT_WORKFLOW_PAUSED');n++;
 console.log('PASS '+n+' real-migration central worker integration checks; copy, media, isolated render recovery, exact preflight and 3+1 publishing reservation. AI/Storage responses are fixtures; no external calls.');
}catch(e){console.error('CENTRAL_RUNTIME_FAILURE',e.message);console.error((await h.q('select stage,status,error_code,error_message from marketing_contents')));throw e;}finally{await h.pg.close();}
