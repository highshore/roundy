import 'server-only';
import {createServiceRoleClient} from './supabase/service';
import {contentResult,wakeContentWorkers} from './marketing-content-controller';
import {generateEditorialCopy,draftQuality} from './marketing-editorial';
import {GenerationError,marketingProviderRequest,renderCardsWithAssets,visualContext} from './marketing-generation';
import {EditorialReviewRequired} from './marketing-workflow';
import {CONTENT_PROFILES} from './marketing-content-policy';
import {configuredPhotoSourcingPolicy,savedPhotoSourcingPolicy,aiImageSlotForPolicy,photoCreditCaption} from './marketing-stock-photo-policy';
import {prepareStockSelections,stockReady,approvedStockCardAssets,listStockSelections,photoSelectionSnapshot} from './marketing-stock-photos';
import {photoCardSourceLabel} from './marketing-photo-rights';
import {photoReviewManifest} from './marketing-preflight';
import {reviewMarketingDraft,mergePreflightQuality} from './marketing-preflight-service';
import {loadEditorialAssets} from './marketing-render-assets';
import {generatedAssetKey,loadGeneratedAsset,persistGeneratedAsset} from './marketing-generated-assets';
type Row=Record<string,any>;
type DB=ReturnType<typeof createServiceRoleClient>;
// PostgreSQL jsonb reorders object keys; provenance equality must be structural.
function canonical(value:any):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
const IMAGE_MODEL='gpt-image-2.5-flare';
const cleanError=(e:any)=>String(e?.message||'Content step failed').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').slice(0,500);
function withPhotoPolicy(copy:Row,input:Row){
 const roles=(copy.carousel_slides||[]).map((s:Row)=>String(s.role||''));
 const policy=configuredPhotoSourcingPolicy(input.photo_settings,roles,input.ai_image_slot);
 if(!policy)throw new Error('CONTENT_PHOTO_POLICY_REQUIRED');
 return {...copy,content_document:{...copy.content_document,photo_sourcing:policy,story_length_source:'admin'},visual_source:'stock'};
}
export type ContentWorkerDependencies={call?:typeof marketingProviderRequest;render?:typeof renderCardsWithAssets;assets?:typeof loadEditorialAssets};
/** Each invocation claims and performs exactly ONE persisted stage. No giant synchronous runGeneration call. */
export async function processContentStep(db:DB=createServiceRoleClient(),contentId:string|null=null,deps:ContentWorkerDependencies={}){
 const claim=contentResult(await db.rpc('claim_marketing_content_step',{p_content:contentId}));
 if(!claim)return {idle:true};
 const {task,content}=claim as Row,job=(claim as Row).job as Row|null;
 const input=content.request_payload as Row;
 if(task.checkpoint?.completion){
  const saved=task.checkpoint.completion;
  const next=contentResult(await db.rpc('finish_marketing_content_step',{p_task:task.id,p_lease:task.lease_id,p_outcome:saved.outcome,p_result:saved.result,p_code:saved.code,p_message:saved.message}));
  if(next.status==='queued')await wakeContentWorkers(db);return {content:next,step:task.step,recovered:true};
 }
 let draft=(claim as Row).draft as Row;
 const deadline=Date.now()+265000;
 const checkpoint=async(value:Row={},external=false)=>{
  contentResult(await db.rpc('checkpoint_marketing_content_step',{p_task:task.id,p_lease:task.lease_id,p_checkpoint:value,p_external:external}));
  task.checkpoint={...task.checkpoint,...value};
 };
 let paidResponseReceived=false;
 const call=async(endpoint:string,body:Row,timeout:number):Promise<Row>=>{
  const allowed=task.step==='discovery'?'responses':task.step==='copy'?'chat/completions':task.step==='render'?'images/generations':null;
  if(endpoint!==allowed)throw new Error('CONTENT_STEP_PROVIDER_MISMATCH');
  if(deadline-Date.now()<timeout+5000)throw new Error('CONTENT_STEP_TIME_LIMIT');
  const control=contentResult(await db.from('marketing_ai_control').select('enabled,blocked_reason').eq('singleton',true).single());
  const workflow=contentResult(await db.from('marketing_content_workflow_control').select('enabled').eq('singleton',true).single());
  if(!control?.enabled||control.blocked_reason||!workflow?.enabled)throw new GenerationError('AI_PAUSED','Generation is paused; saved results are preserved.',false);
  await checkpoint({},true);
  const result=await (deps.call||marketingProviderRequest)(endpoint,body,Math.min(timeout,Math.max(1000,deadline-Date.now()-10000)));
  paidResponseReceived=true;
  return result;
 };
 let outcome:'succeeded'|'blocked'|'failed'|'uncertain'='succeeded',result:Row={},code:string|null=null,message:string|null=null;
 try{
  const version=contentResult(await db.from('marketing_content_versions').select('*').eq('content_id',content.id).eq('version',content.version).single());
  if(version.snapshot)draft={...draft,...version.snapshot,id:content.id,revision:draft.revision,status:draft.status};
  if(task.step==='discovery'){
   if(!job)throw new Error('CONTENT_JOB_REQUIRED');
   result=await generateEditorialCopy(db,draft,input,job,call,{central:true,researchOnly:true});
  }else if(task.step==='copy'){
   if(!job)throw new Error('CONTENT_JOB_REQUIRED');
   const research=(CONTENT_PROFILES as Row)[input.topic_type]?.research;
   const prior=research?contentResult(await db.from('marketing_content_steps').select('output').eq('content_id',content.id).eq('version',content.version)
    .eq('step','discovery').eq('status','succeeded').order('attempt',{ascending:false}).limit(1).maybeSingle()):null;
   if(research&&!prior?.output?.research_context)throw new EditorialReviewRequired('DISCOVERY_REFRESH_REQUIRED','자료 조사 단계의 저장 결과가 필요합니다.');
   const copy=await generateEditorialCopy(db,draft,input,job,call,{central:true,researchContext:prior?.output?.research_context});
   result={copy:withPhotoPolicy(copy,input)};
  }else if(task.step==='media'){
   if(!version.snapshot)throw new Error('SAVED_COPY_REQUIRED');
   const copyReport=draftQuality({...draft,content_document:{...draft.content_document,thumbnail_render_pending:false}});
   if(copyReport.status!=='passed'){
    outcome='blocked';code='COPY_REVIEW_REQUIRED';message=copyReport.issues.join(' ').slice(0,500);result={report:copyReport};
   }else{
    const selected=await prepareStockSelections(db,draft),ready=stockReady(draft,selected);
    result={ready,photos:photoSelectionSnapshot(selected),manifest:photoReviewManifest(selected)};
    if(!ready){outcome='blocked';code='PHOTO_APPROVAL_REQUIRED';message='선택된 사진의 출처와 사용 권한을 확인하고 승인하세요.';}
   }
  }else if(task.step==='render'){
   if(!version.snapshot||!job)throw new Error('SAVED_COPY_REQUIRED');
   const selected=await listStockSelections(db,content.id);
   if(!stockReady(draft,selected))throw new Error('PHOTO_APPROVAL_REQUIRED');
   const policy=savedPhotoSourcingPolicy(draft.content_document?.photo_sourcing),slot=aiImageSlotForPolicy(policy);
   const base=String(draft.caption||'').replace(/\n\n(?:Photos:|Photo sources \/ 사진 출처:)[\s\S]*$/,'').replace(/\n\nAI-generated editorial illustration: Card \d+$/,'');
   const caption=photoCreditCaption(slot===null?base:base+'\n\nAI-generated editorial illustration: Card '+(slot+1),selected);
   const assets=await (deps.assets||loadEditorialAssets)();
   Object.assign(assets,await approvedStockCardAssets(db,draft));
   assets.cardCredits=Object.fromEntries(selected.map(p=>[Number(p.slot),photoCardSourceLabel(p)]));
   if(slot!==null){
    const prompt=[
     'Generate ONE original, photorealistic TEXT-FREE editorial image for card '+(slot+1)+' of this Instagram carousel. Never generate a collage.',
     'Portrait 4:5. Contemporary Seoul editorial atmosphere with readable negative space for typography.',
     'It is an illustration only, never depict a named real venue, real participant, actual event photo or verified documentary evidence.',
     'Natural everyday adults and lighting; no writing, text, signs, logos, watermarks, screenshots, advertising layouts or branded products.',
     'The server overlays the exact card headline and body; do not generate typography.',
     'Selected card context:',visualContext(draft).split('\n')[slot]||''
    ].join('\n');
    const key=generatedAssetKey(prompt,IMAGE_MODEL);
    const doc={generated_ai_assets:{...draft.content_document?.generated_ai_assets,...task.checkpoint?.generated_ai_assets}};
    let image=await loadGeneratedAsset(db,doc,key);
    if(!image){
     const generated=await call('images/generations',{model:IMAGE_MODEL,prompt,n:1,size:'1024x1280',quality:'low',output_format:'jpeg',output_compression:85,background:'opaque'},150000);
     const encoded=generated.data?.[0]?.b64_json;
     if(typeof encoded!=='string'||encoded.length<100||encoded.length>8*1024*1024)throw new Error('INVALID_GENERATED_AI_THUMBNAIL');
     const saved=await persistGeneratedAsset(db,job.id,key,encoded);
     await checkpoint({generated_ai_assets:{...doc.generated_ai_assets,[key]:saved.asset}});
     image=saved.image;
    }
    if(slot===0)assets.photo=image;
    assets.cardPhotos={...assets.cardPhotos,[slot]:image};assets.reusePhotos=false;
   }
   // Publication always uses the original, version-bound photo manifest, never an arbitrary URL supplied by the browser.
   const images=await (deps.render||renderCardsWithAssets)(db,draft,job,assets,{},deadline);
   result={render:{images,caption,content_document:{...draft.content_document,thumbnail_render_pending:false,
    generated_ai_assets:{...draft.content_document?.generated_ai_assets,...task.checkpoint?.generated_ai_assets}}},manifest:photoReviewManifest(selected)};
  }else if(task.step==='review'){
   // Review the committed render projection, not the copy-only version snapshot.
   draft=contentResult(await db.from('instagram_post_drafts').select('*').eq('id',content.id).single());
   const rendered=contentResult(await db.from('marketing_content_steps').select('output').eq('content_id',content.id).eq('version',content.version)
    .eq('step','render').eq('status','succeeded').order('attempt',{ascending:false}).limit(1).single());
   const preflight=await reviewMarketingDraft(db,draft),report=mergePreflightQuality(draftQuality(draft),preflight);
   const currentManifest=canonical(preflight.photo_manifest),originalManifest=canonical(rendered?.output?.manifest);
   if(currentManifest!==originalManifest){report.status='rejected';report.issues.push('렌더링 이후 사진 정보가 변경됐습니다. 이미지를 다시 제작하세요.');}
   result={report};
   if(report.status!=='passed'){outcome='blocked';code='MARKETING_PREFLIGHT_FAILED';message=report.issues.join(' ').slice(0,500);}
  }else throw new Error('UNKNOWN_CONTENT_STEP');
 }catch(error){
  message=cleanError(error);
  code=error instanceof GenerationError||error instanceof EditorialReviewRequired?error.code:
   (/^[A-Z][A-Z0-9_]+$/.test(message)?message:'CONTENT_STEP_FAILED');
  if(error instanceof EditorialReviewRequired){
   outcome='blocked';
   if(error.patch){try{result={copy:withPhotoPolicy(error.patch,input)};}catch{outcome='failed';code='CONTENT_PHOTO_POLICY_REQUIRED';}}
  }else if(code==='UPSTREAM_OUTCOME_UNKNOWN'||(paidResponseReceived&&task.step==='render'&&!Object.keys(task.checkpoint?.generated_ai_assets||{}).length)){
   outcome='uncertain';
  }else if(code==='PHOTO_APPROVAL_REQUIRED')outcome='blocked';
  else outcome='failed';
  if(task.step==='discovery'&&job){
   try{const saved=contentResult(await db.from('marketing_generation_jobs').select('research_cache').eq('id',job.id).single());
    if(saved?.research_cache)result={...result,research_review:{sources:saved.research_cache.sources||[],notes:String(saved.research_cache.notes||'').slice(0,18000),diagnostics:saved.research_cache.diagnostics||null}};
   }catch{/* Keep the primary failure; the lease and original ledger still protect paid work. */}
  }
  if(error instanceof GenerationError&&error.block){
   contentResult(await db.from('marketing_ai_control').update({blocked_reason:message,updated_at:new Date().toISOString()}).eq('singleton',true));
  }
 }
 // A durable completion record allows the lease reconciler to commit a known result without another paid call.
 try{await checkpoint({completion:{outcome,result,code,message}});}catch{console.warn('Content completion checkpoint unavailable; attempting atomic result commit');}
 // Result, immutable copy version, compatibility projection and state transition commit together.
 const next=contentResult(await db.rpc('finish_marketing_content_step',{p_task:task.id,p_lease:task.lease_id,p_outcome:outcome,
  p_result:result,p_code:code,p_message:message}));
 if(next.status==='queued')await wakeContentWorkers(db);
 return {content:next,step:task.step,outcome};
}
