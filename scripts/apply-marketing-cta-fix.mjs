import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function patch(s,from,to,label){if(!s.includes(from))throw new Error('Missing anchor: '+label);return s.replace(from,()=>to);}
{
 const p='src/lib/marketing-presentation.ts';let s=read(p);
 s=patch(s,"const clean = (v: unknown)","export const MAX_MARKETING_CTA_LENGTH=70;\nexport const generatedCta=(language:string)=>language==='en'?'Explore Roundy':'Roundy 둘러보기';\nexport function captionCtaIssues(caption:unknown,cta:unknown):string[]{\n const a=typeof caption==='string'?caption.trim():'',b=typeof cta==='string'?cta.trim():'';const issues:string[]=[];\n if(!a)issues.push('캡션이 비어 있습니다.');else if(a.length>2000)issues.push('캡션이 '+a.length+'자로 2,000자 제한을 초과했습니다.');\n if(!b)issues.push('CTA 안내 문구가 비어 있습니다.');else if(b.length>MAX_MARKETING_CTA_LENGTH)issues.push('CTA 안내 문구가 '+b.length+'자로 '+MAX_MARKETING_CTA_LENGTH+'자 제한을 초과했습니다.');\n return issues;\n}\nconst clean = (v: unknown)",'shared CTA contract');
 s=patch(s,"design_preset: {type:'string', enum:[EDITORIAL_PRESET]},","design_preset: {type:'string', enum:[EDITORIAL_PRESET]},\n      caption:text(ko?400:520),\n      cta:{type:'string',enum:[generatedCta(language)],minLength:1,maxLength:MAX_MARKETING_CTA_LENGTH},",'strict CTA schema');
 s=patch(s,"'The final CTA uses server-owned Roundy introduction copy and prints BOTH @roundy.meet and roundy.team. Do not repeat the same brand paragraph on the earlier cards.',","'Top-level cta is ONLY the exact short action label '+JSON.stringify(generatedCta(language))+'. It is NOT a paragraph, caption or URL field. The server renders contact details separately.',\n    'The final CTA uses server-owned Roundy introduction copy and prints BOTH @roundy.meet and roundy.team. Do not repeat the same brand paragraph on the earlier cards.',",'unambiguous CTA instructions');
 s=patch(s,"return {...raw, caption_ko, caption_en, caption:ko?caption_ko:caption_en, slides,","return {...raw, cta:generatedCta(language), caption_ko, caption_en, caption:ko?caption_ko:caption_en, slides,",'normalize top-level CTA before validation');
 write(p,s);
}
{
 const p='src/lib/marketing-content-policy.ts';let s=read(p);
 s=patch(s,"import {EDITORIAL_PRESET,","import {captionCtaIssues,EDITORIAL_PRESET,",'diagnostic import');
 s=patch(s,"if(!str(c.caption)||str(c.caption).length>2000||!str(c.cta)||str(c.cta).length>70)add('캡션 또는 CTA가 비어 있거나 너무 깁니다.');","for(const issue of captionCtaIssues(c.caption,c.cta))add(issue);",'specific caption/CTA diagnostics');
 write(p,s);
}
{
 const p='src/lib/marketing-output-recovery.ts';let s=read(p);
 s+=`\n// A failed local render can retry the same saved source, never silently switch to paid generation.
export function savedCtaRecoverySource(job:Row|null|undefined):string|null {
 if(canRecoverSavedCta(job))return job!.id;
 if(job?.status==='failed'&&!job.automatic&&job.operation==='render'&&job.error_code==='GENERATION_FAILED'&&typeof job.request_payload?.saved_recovery_of==='string'&&/^[0-9a-f-]{36}$/i.test(job.request_payload.saved_recovery_of))return job.request_payload.saved_recovery_of;
 return null;
}
export const canOfferSavedCtaRecovery=(job:Row|null|undefined)=>Boolean(savedCtaRecoverySource(job));
`;
 write(p,s);
}
{
 const p='src/lib/marketing-editorial.ts';let s=read(p);
 s="import {buildMarketingResearchTask,RESEARCH_TASK_VERSION} from './marketing-research-task';\n"+s;
 s=patch(s,"import {isCompactDocument,bilingualCaptionIssues}","import {captionCtaIssues,isCompactDocument,bilingualCaptionIssues}",'draft check import');
 s=patch(s,"const cacheKey=createHash('sha256').update(JSON.stringify(['research-v2',CONTENT_POLICY_VERSION,type,language,input.instruction||''])).digest('hex');","const researchTask=profile.research?buildMarketingResearchTask(type,input.instruction||'',language):'';\n const cacheKey=createHash('sha256').update(JSON.stringify([RESEARCH_TASK_VERSION,CONTENT_POLICY_VERSION,type,language,input.instruction||''])).digest('hex');",'concrete task cache');
 s=patch(s,"if(cache?.key===cacheKey&&Array.isArray(cache.sources)","if(cache?.key===cacheKey&&cache.search_completed===true&&Array.isArray(cache.sources)",'valid cache requirement');
 const begin="input:type==='book_insight'?",a=s.indexOf(begin),b=s.indexOf(",tools:[{type:'web_search'",a);
 if(a<0||b<0)throw new Error('Research input bounds missing');
 s=s.slice(0,a)+'input:researchTask'+s.slice(b);
 s=patch(s,"const cached={key:cacheKey,saved_at:new Date().toISOString(),sources,notes,search_completed:evidence.completed};","const cached={key:cacheKey,saved_at:new Date().toISOString(),sources,notes,subject:researchTask,search_completed:evidence.completed&&sources.length>0};",'do not cache empty evidence as successful');
 s=patch(s,"const issues=bilingualCaptionIssues(String(draft.caption||''));","const issues=[...bilingualCaptionIssues(String(draft.caption||'')),...captionCtaIssues(document.caption,draft.cta)];",'validate actual manually edited CTA');
 write(p,s);
}
{
 const p='src/lib/marketing-generation.ts';let s=read(p);
 s="import {prepareSavedCtaRecovery,SAVED_CTA_RECOVERY_VERSION} from './marketing-output-recovery';\n"+s;
 s=patch(s,"type GenerationThreadContext={threadId:string;attemptNumber:number;retryOfJobId:string};","type GenerationThreadContext={threadId:string;attemptNumber:number;retryOfJobId:string;recoverySourceJobId?:string};",'recovery thread context');
 s=patch(s,"let draft=await readDraft(db,draftId);",`let draft=await readDraft(db,draftId);
 let recoveryPatch:Row|null=null,recoverySource:Row|null=null;
 if(thread?.recoverySourceJobId){
  if(automatic||input.visual_mode!=='cards')throw new Error('SAVED_RESULT_RECOVERY_UNAVAILABLE');
  recoverySource=checked(await db.from('marketing_generation_jobs').select('*').eq('id',thread.recoverySourceJobId).single()).data as Row;
  if(!recoverySource||recoverySource.draft_id!==draftId||(recoverySource.generation_thread_id||recoverySource.id)!==thread.threadId)throw new Error('SAVED_RESULT_RECOVERY_MISMATCH');
  const original=recoverySource.request_payload;
  if(!original||original.content_mode!==input.content_mode||(original.topic_type||null)!==(input.topic_type||null)||original.language!==input.language||(original.instruction||'')!==(input.instruction||''))throw new Error('SAVED_RESULT_RECOVERY_MISMATCH');
  recoveryPatch=prepareSavedCtaRecovery(recoverySource);
 }`,'prepare recovery before any reservation or provider call');
 s=patch(s,"if(input.mode==='image'){const q=draftQuality(draft);","if(input.mode==='image'&&!recoveryPatch){const q=draftQuality(draft);",'saved recovery quality source');
 s=patch(s,"const operation=input.render_only||", "const operation=recoveryPatch?'render':input.render_only||",'reserve only zero-cost rendering');
 s=patch(s,"render:!!input.render_only})).digest('hex');","render:!!input.render_only,saved_recovery_of:thread?.recoverySourceJobId||null})).digest('hex');",'recovery idempotency fingerprint');
 s=patch(s,"render_only:input.render_only===true};","render_only:input.render_only===true,...(recoverySource?{saved_recovery_of:recoverySource.id}: {})};",'persist recovery lineage');
 s=patch(s,"if(operation!=='render'&&operation!=='photo'){",`if(recoveryPatch){
   contentQuality=recoveryPatch.quality_report;await progress(db,job,'restoring_saved_copy');
   // Preserve failed source snapshots. The recovery is a new zero-cost attempt in the SAME thread.
   checked(await db.from('marketing_generation_jobs').update({quality_report:contentQuality,result_snapshot:{...recoveryPatch,draft_id:draftId,recovery:{version:SAVED_CTA_RECOVERY_VERSION,source_job_id:recoverySource!.id,additional_paid_calls:0}}}).eq('id',job.id).eq('status','running'));
   draft=await savePartial(db,draft,{...recoveryPatch,last_regeneration_mode:input.mode,last_regeneration_instruction:input.instruction});
  }else if(operation!=='render'&&operation!=='photo'){`,'no paid rewrite path for recovery');
 s=patch(s,"if(input.mode!=='text'||automatic){","if(recoveryPatch||input.mode!=='text'||automatic){",'render recovered complete result');
 s=patch(s,"const resultSnapshot={\n   content_document:","const resultSnapshot={\n   ...(recoverySource?{recovery:{version:SAVED_CTA_RECOVERY_VERSION,source_job_id:recoverySource.id,original_cta:recoverySource.result_snapshot.content_document.cta,additional_paid_calls:0}}:{}),\n   content_document:",'recovery audit metadata');
 write(p,s);
}
{
 const p='src/lib/marketing.ts';let s=read(p);
 s="import {savedCtaRecoverySource} from './marketing-output-recovery';\n"+s;
 s=patch(s,"const retryPayload={...latest.request_payload,request_key:'retry:'+randomUUID(),revision:currentDraft.revision,confirm_photo:isPhoto};",`const recoverySourceJobId=savedCtaRecoverySource(latest);
  if(confirmation.recover_saved_result===true&&!recoverySourceJobId)return json({error:'SAVED_RESULT_RECOVERY_UNAVAILABLE'},409);
  const retryPayload={...latest.request_payload,request_key:(recoverySourceJobId?'recover:':'retry:')+randomUUID(),revision:currentDraft.revision,confirm_photo:isPhoto};`,'route server selects free recovery');
 s=patch(s,"const result=await runGeneration(currentDraft.id,retryPayload,user.id,false,{threadId,attemptNumber:nextAttempt,retryOfJobId:latest.id});\n  return json({...result,generation_thread_id:threadId,attempt_number:nextAttempt,retry_of_job_id:latest.id},result.error?400:200);",`try{
   const result=await runGeneration(currentDraft.id,retryPayload,user.id,false,{threadId,attemptNumber:nextAttempt,retryOfJobId:latest.id,...(recoverySourceJobId?{recoverySourceJobId}:{})});
   return json({...result,recovered_without_ai:!!recoverySourceJobId,generation_thread_id:threadId,attempt_number:nextAttempt,retry_of_job_id:latest.id},result.error?400:200);
  }catch(error){return json({error:error instanceof Error?error.message:'Recovery or retry could not start'},400);}`,'free recovery fails closed without fallback');
 s=patch(s,"v.cta.length>80","v.cta.trim().length>70||!v.cta.trim()",'editing shares CTA limit');
 write(p,s);
}
{
 const p='src/components/admin-marketing.tsx';let s=read(p);
 s=patch(s,"'use client';","'use client';\nimport {canOfferSavedCtaRecovery} from '@/lib/marketing-output-recovery';",'UI recovery availability');
 s=patch(s,"function retryCost(job:Row){return job.operation===", "function retryCost(job:Row){if(canOfferSavedCtaRecovery(job))return 0;return job.operation===",'free recovery cost');
 s=patch(s,"const cost=retryCost(job),photo=", "const freeRecovery=canOfferSavedCtaRecovery(job),cost=retryCost(job),photo=",'free recovery flag');
 s=patch(s,"const confirmMessage=t(","const confirmMessage=freeRecovery?t('Recover the saved content and render cards without calling any AI? No additional AI charge; it will not publish automatically.','저장된 본문을 재사용해 카드만 복구할까요? AI를 호출하지 않아 추가 AI 비용이 없으며 자동 게시하지 않습니다.'):t(",'free recovery confirmation');
 s=patch(s,"{confirm_retry:true,confirm_paid_photo:photo}","{confirm_retry:true,confirm_paid_photo:photo,recover_saved_result:freeRecovery}",'prevent unexpected paid fallback');
 s=patch(s,"setNotice(t('Retry complete. Open the result and choose Add to Drafts.','재시도가 완료됐습니다. 결과를 확인한 뒤 초안으로 가져오세요.'));","setNotice(r.data.recovered_without_ai?t('Recovered the saved result without any AI request. Review it, then add it to Drafts.','AI를 호출하지 않고 저장된 결과를 복구했습니다. 결과를 검토한 뒤 초안으로 가져오세요.'):t('Retry complete. Open the result and choose Add to Drafts.','재시도가 완료됐습니다. 결과를 확인한 뒤 초안으로 가져오세요.'));",'completion feedback');
 s=patch(s,"{t('Retry same settings','같은 설정으로 재시도')}</button>","{canOfferSavedCtaRecovery(latest)?t('Recover saved result — no AI charge','저장된 결과로 무료 복구'):t('Retry same settings','같은 설정으로 재시도')}</button>",'recovery button');
 s=patch(s,"RESULT_ALREADY_USED:['This generated result", "SAVED_RESULT_RECOVERY_UNAVAILABLE:['This saved result cannot be recovered automatically. No paid retry was started.','이 저장 결과는 자동 복구할 수 없습니다. 유료 재시도는 시작하지 않았습니다.'],\n   SAVED_RESULT_RECOVERY_MISMATCH:['The saved result does not match this thread. Refresh before retrying.','저장 결과와 스레드가 일치하지 않습니다. 새로고침 후 확인하세요.'],\n   RESULT_ALREADY_USED:['This generated result",'friendly recovery errors');
 s=s.replace('maxLength={80}','maxLength={70}');
 write(p,s);
}
console.log('CTA contract + zero-provider recovery + concrete research tasks integrated. No live API calls or DB changes.');
