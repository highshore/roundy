// Admin-only helpers called after route authentication, origin and role checks.
// Opening or reviewing copy never queues a post or relaxes source/media checks.
import {hasEditorialCopy} from './marketing-workflow';
import {copyFingerprint} from './marketing-editorial-feedback';
import {draftQuality} from './marketing-editorial';
import {classifyQualityIssues} from './marketing-content-policy';
import {importStockSelections} from './marketing-stock-photos';
type Row=Record<string,any>;
const read=(r:any)=>{if(r.error)throw r.error;return r.data;};
export async function openSavedEditorialCopy(db:any,jobId:string):Promise<Row|null>{
 const job=read(await db.from('marketing_generation_jobs').select('*').eq('id',jobId).single());
 if(!job||job.status!=='completed')throw new Error('RESULT_NOT_COMPLETE');
 const existing=read(await db.from('instagram_post_drafts').select('*').eq('source_generation_job_id',jobId).maybeSingle());
 if(existing){
  if(existing.status!=='needs_approval')throw new Error('RESULT_ALREADY_USED');
  return existing;
 }
 const snapshot=job.result_snapshot;
 if(!hasEditorialCopy(snapshot))throw new Error('SAVED_COPY_NOT_AVAILABLE');
 // Fully passing results retain the existing atomic import implementation.
 if(snapshot.quality_report?.status==='passed')return null;
 const base=read(await db.from('instagram_post_drafts').select('*').eq('id',job.draft_id).single());
 const active=read(await db.from('marketing_generation_jobs').select('id').eq('draft_id',base.id).eq('status','running').limit(1));
 if(active?.length)throw new Error('GENERATION_ALREADY_RUNNING');
 const now=new Date().toISOString();
 // Whitelist server-saved editorial data; no snapshot approval, schedule or run is copied.
 const keys=['draft_date','content_pillar','caption','cta','destination_url','images','generation_reason','recommended_time_kst','window_start_kst','window_end_kst','content_mode','draft_kind','growth_topic_type','carousel_slides','research_sources','research_status','content_language','content_document','event_id','trend_id','render_style','campaign_pattern','campaign_tone','campaign_version','launch_date','event_campaign_stage','event_campaign_pattern','event_campaign_version','event_facts_snapshot','visual_source'];
 const patch:Row={};for(const key of keys)if(snapshot[key]!==undefined||base[key]!==undefined)patch[key]=snapshot[key]??base[key];
 Object.assign(patch,{status:'needs_approval',draft_role:'candidate',revision:1,
  generation_source:job.automatic?'automation':'manual',source_generation_job_id:jobId,
  quality_report:snapshot.quality_report||{version:3,status:'unchecked',issues:[],review_required:true},
  quality_revision:null,approved_at:null,approved_by:null,marketing_run_id:null,scheduled_for:null,
  published_at:null,eligible_for_optimization:false,imported_at:null,updated_at:now});
 const inserted=await db.from('instagram_post_drafts').insert(patch).select('*').single();
 if(inserted.error){
  if(inserted.error.code!=='23505')throw inserted.error;
  const raced=read(await db.from('instagram_post_drafts').select('*').eq('source_generation_job_id',jobId).single());
  if(raced.status!=='needs_approval')throw new Error('RESULT_ALREADY_USED');
  return raced;
 }
 const candidate=inserted.data;
 if(['stock','pexels'].includes(String(candidate.visual_source)))
  await importStockSelections(db,candidate.id,snapshot.stock_photo_selections||[]);
 return read(await db.from('instagram_post_drafts').update({imported_at:now})
  .eq('id',candidate.id).eq('status','needs_approval').select('*').single());
}
export async function saveEditorialFeedback(db:any,id:string,value:Row,actor:string):Promise<Row>{
 if(!['approve','rework'].includes(value.decision)||typeof value.note!=='string'||value.note.trim().length<8||value.note.trim().length>500)
  throw new Error('EDITORIAL_FEEDBACK_NOTE_REQUIRED');
 const draft=read(await db.from('instagram_post_drafts').select('*').eq('id',id).single());
 if(draft.status!=='needs_approval'||draft.draft_role!=='candidate'||!draft.imported_at||!hasEditorialCopy(draft))throw new Error('DRAFT_NOT_EDITABLE');
 if(!Number.isInteger(value.revision)||value.revision!==draft.revision)throw new Error('DRAFT_CHANGED_REFRESH_FIRST');
 const active=read(await db.from('marketing_generation_jobs').select('id').eq('draft_id',id).eq('status','running').limit(1));
 if(active?.length)throw new Error('GENERATION_ALREADY_RUNNING');
 const report=draftQuality(draft),critical=classifyQualityIssues(report.issues).critical;
 if(value.decision==='approve'&&(draft.content_document?.source_review_required||critical.length))
  throw new Error('SOURCE_REVIEW_CANNOT_BE_OVERRIDDEN');
 const now=new Date().toISOString(),fingerprint=copyFingerprint(draft);
 const feedback={decision:value.decision,note:value.note.trim(),fingerprint,actor_id:actor,at:now,
  sample:draft.carousel_slides.filter((slide:Row)=>slide.role!=='brand_outro')
   .map((slide:Row)=>String(slide.title||'')+'\n'+String(slide.body||'')).join('\n\n').slice(0,2000)};
 const document={...draft.content_document,
  editorial_feedback:[...(draft.content_document?.editorial_feedback||[]),feedback].slice(-20),
  editorial_review_required:value.decision!=='approve',
  editorial_human_approval:value.decision==='approve'?{fingerprint,actor_id:actor,at:now}:null};
 const next={...draft,content_document:document},quality=draftQuality(next);
 // Content-only approval does not imply photo/render or publication approval.
 const result=read(await db.from('instagram_post_drafts').update({content_document:document,
  revision:draft.revision+1,quality_revision:null,quality_report:{...quality,review_required:true},updated_at:now})
  .eq('id',id).eq('revision',draft.revision).eq('status','needs_approval').select('*').maybeSingle());
 if(!result)throw new Error('DRAFT_CHANGED_REFRESH_FIRST');
 return result;
}
