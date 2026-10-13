import fs from 'node:fs';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let checks=0;
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const rpc=async(name,args)=>{const keys=Object.keys(args);return (await q('select public.'+name+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') as result',Object.values(args)))[0]?.result;};
const actor='11111111-1111-4111-8111-111111111111';
const state=async id=>(await q('select * from marketing_contents where id=$1',[id]))[0];
const input={content_mode:'growth_carousel',topic_type:'conversation_prompt',language:'ko',instruction:'대화 예시',ai_image_slot:null,carousel_plan:{mode:'fixed',slide_count:3}};
const copy={content_document:{schema_version:2,slides:[],editorial_workflow_version:2},carousel_slides:[{role:'cover'},{role:'key_insight'},{role:'editorial_closing'},{role:'brand_outro'}],caption:'테스트 원고입니다.',cta:'',content_language:'ko',draft_kind:'growth_carousel',growth_topic_type:'conversation_prompt',research_sources:[],research_status:'not_required'};
async function start(key='manual:central-test-001',payload=input){return rpc('start_marketing_content',{p_key:key,p_input:payload,p_origin:'manual',p_actor:actor});}
async function claim(id){return rpc('claim_marketing_content_step',{p_content:id});}
async function finish(job,outcome='succeeded',result={}){return rpc('finish_marketing_content_step',{p_task:job.task.id,p_lease:job.task.lease_id,p_outcome:outcome,p_result:result});}
async function rejects(fn,pattern){await assert.rejects(fn,pattern);checks++;}
try{
 await db.exec(fs.readFileSync('scripts/marketing-central-test-schema.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261013103350_marketing_central_content_workflow.sql','utf8'));
 await db.query('insert into auth.users values($1)',[actor]);
 await rejects(()=>start(),/CONTENT_WORKFLOW_PAUSED/);
 await db.exec('update marketing_content_workflow_control set enabled=true');
 const c=await start();assert.equal(c.stage,'copy');assert.equal(c.status,'queued');checks++;
 assert.equal((await start()).id,c.id);assert.equal((await q('select count(*)::int n from instagram_post_drafts'))[0].n,1);checks++;
 await rejects(()=>start('manual:central-test-001',{...input,language:'en'}),/IDEMPOTENCY_KEY_CONFLICT/);
 const copyTask=await claim(c.id);assert.equal(copyTask.task.step,'copy');assert.equal(await claim(c.id),null);checks++;
 await rejects(()=>rpc('finish_marketing_content_step',{p_task:copyTask.task.id,p_lease:actor,p_outcome:'succeeded',p_result:{copy}}),/STALE_CONTENT_WORKER/);
 await rejects(async()=>rpc('archive_marketing_content',{p_content:c.id,p_state:(await state(c.id)).state_version}),/CONTENT_NOT_ARCHIVABLE/);
 const afterCopy=await finish(copyTask,'succeeded',{copy});assert.equal(afterCopy.stage,'media');checks++;
 assert.equal((await q('select snapshot from marketing_content_versions where content_id=$1',[c.id]))[0].snapshot.caption,copy.caption);checks++;
 await rejects(()=>db.query("update marketing_content_versions set snapshot='{}' where content_id=$1",[c.id]),/CONTENT_VERSION_IMMUTABLE/);
 await rejects(()=>db.query("update instagram_post_drafts set caption='unexpected' where id=$1",[c.id]),/USE_CONTENT_WORKFLOW/);
 const mediaTask=await claim(c.id);const mediaBlocked=await finish(mediaTask,'blocked',{ready:false});assert.equal(mediaBlocked.required_action,'photo_approval_required');checks++;
 await rejects(()=>rpc('resume_marketing_content',{p_content:c.id,p_state:c.state_version}),/CONTENT_CHANGED_REFRESH/);
 await rpc('resume_marketing_content',{p_content:c.id,p_state:mediaBlocked.state_version});
 const approvedMedia=await claim(c.id);await finish(approvedMedia,'succeeded',{ready:true,manifest:[]});
 const renderTask=await claim(c.id);
 const failed=await rpc('finish_marketing_content_step',{p_task:renderTask.task.id,p_lease:renderTask.task.lease_id,p_outcome:'failed',p_result:{},p_code:'STORAGE_FAILURE'});
 assert.equal(failed.stage,'render');assert.equal((await q('select count(*)::int n from marketing_content_steps where content_id=$1 and step=\'copy\'',[c.id]))[0].n,1);checks++;
 await rpc('resume_marketing_content',{p_content:c.id,p_state:failed.state_version});
 const retry=await claim(c.id);assert.equal(retry.task.step,'render');checks++;
 await rejects(()=>finish(retry,'succeeded',{render:{images:[]}}),/RENDER_COUNT_MISMATCH/);
 assert.equal((await state(c.id)).status,'running');checks++;
 await finish(retry,'succeeded',{render:{images:Array(4).fill('https://fixture.invalid/test.jpg'),caption:copy.caption,content_document:copy.content_document},manifest:[]});
 const review=await claim(c.id),draft=(await q('select revision from instagram_post_drafts where id=$1',[c.id]))[0];
 const report={version:2,status:'passed',issues:[],preflight:{status:'passed',revision:draft.revision,photo_manifest:[]}};
 const ready=await finish(review,'succeeded',{report});assert.equal(ready.required_action,'final_approval_required');checks++;
 assert.equal((await q('select count(*)::int n from marketing_runs'))[0].n,0);checks++;
 const published=await rpc('approve_marketing_content',{p_content:c.id,p_state:ready.state_version,p_actor:actor,p_report:report});
 assert.equal(published.content.status,'scheduled');checks++;
 await rejects(()=>rpc('approve_marketing_content',{p_content:c.id,p_state:ready.state_version,p_actor:actor,p_report:report}),/CONTENT_CHANGED_REFRESH/);
 await rejects(()=>rpc('edit_marketing_content_copy',{p_content:c.id,p_state:published.content.state_version,p_snapshot:copy,p_actor:actor}),/CONTENT_NOT_EDITABLE/);
 await db.query("update marketing_runs set status='sent' where id=$1",[published.content.publishing_run_id]);assert.equal((await state(c.id)).status,'published');checks++;
 const u=await start('manual:central-uncertain');const ut=await claim(u.id);
 await rpc('checkpoint_marketing_content_step',{p_task:ut.task.id,p_lease:ut.task.lease_id,p_external:true});
 await db.query("update marketing_content_steps set lease_expires_at=now()-interval '1 minute' where id=$1",[ut.task.id]);
 await claim(u.id);const expired=await state(u.id);assert.equal(expired.status,'uncertain');checks++;
 await rejects(()=>rpc('resume_marketing_content',{p_content:u.id,p_state:expired.state_version,p_confirm_paid:true}),/CONFIRM_UNKNOWN_EXTERNAL_RESULT/);
 await rejects(()=>finish(ut,'succeeded',{copy}),/STALE_CONTENT_WORKER/);
 const b=await start('manual:central-budget');await db.exec("select set_config('fixture.budget_blocked','true',false)");
 assert.equal(await claim(b.id),null);assert.equal((await state(b.id)).error_code,'GENERATION_BUDGET_REACHED');checks++;
 await db.exec("select set_config('fixture.budget_blocked','false',false)");
 const saved=await start('manual:completion-checkpoint'),savedTask=await claim(saved.id);
 await rpc('checkpoint_marketing_content_step',{p_task:savedTask.task.id,p_lease:savedTask.task.lease_id,p_external:true,
  p_checkpoint:{completion:{outcome:'succeeded',result:{copy},code:null,message:null}}});
 await db.query("update marketing_content_steps set lease_expires_at=now()-interval '1 minute' where id=$1",[savedTask.task.id]);
 const recovered=await claim(saved.id);assert.equal(recovered.task.step,'media');checks++;
 assert.equal((await q("select status from marketing_content_steps where id=$1",[savedTask.task.id]))[0].status,'succeeded');checks++;
 await rejects(()=>finish(savedTask,'succeeded',{copy}),/STALE_CONTENT_WORKER/);
 await finish(recovered,'blocked',{ready:false});
 const refined=await rpc('refine_marketing_content_subject',{p_content:saved.id,p_state:(await state(saved.id)).state_version,p_instruction:'새로운 소재 메모',p_actor:actor,p_confirm_paid:true});
 assert.equal(refined.version,2);assert.equal(refined.stage,'copy');checks++;
 assert.equal((await q('select snapshot from marketing_content_versions where content_id=$1 and version=1',[saved.id]))[0].snapshot.caption,copy.caption);checks++;
 // The central tables can be read only by admins and mutated only by service RPCs.
 await db.exec('set role authenticated');
 assert.equal((await q('select count(*)::int n from marketing_contents'))[0].n,0);checks++;
 await rejects(()=>rpc('claim_marketing_content_step',{}),/permission denied/);
 await rejects(()=>db.exec("update marketing_contents set status='published'"),/permission denied/);
 await db.exec('reset role');
 console.log('PASS '+checks+' central PostgreSQL controller checks: stable identity, atomic completion, immutable versions, fencing, isolated retry, budgets, RLS and publisher bridge. Dependency RPCs are fixtures; no external calls.');
}finally{await db.close();}
