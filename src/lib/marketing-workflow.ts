// Presentation states are separate from persisted job statuses and publishing gates.
// A completed provider request is not the same thing as a publishable post.
type Row=Record<string,any>;
export type EditorialState='running'|'system_error'|'topic_review'|'source_review'|'copy_review'|'translation_review'|'photo_review'|'render_review'|'ready'|'empty'|'published'|'scheduled';
export class EditorialReviewRequired extends Error {
 constructor(public code:string,message:string,public patch:Row|null=null){super(message);this.name='EditorialReviewRequired';}
}
export function hasEditorialCopy(row:Row|null|undefined):boolean {
 const s=row?.result_snapshot||row;
 return Boolean(s?.content_document&&Array.isArray(s.carousel_slides)&&s.carousel_slides.length&&String(s.caption||'').trim());
}
export function editorialState(row:Row|null|undefined):EditorialState {
 if(!row)return 'empty';
 if(row.status==='published'||row.status==='sent')return 'published';
 if(row.status==='scheduled'||row.status==='queued')return 'scheduled';
 if(row.status==='running')return 'running';
 const s=row.result_snapshot||row,doc=s.content_document||{},q=row.quality_report||s.quality_report||{};
 const code=String(row.error_code||'')+' '+String(row.error_message||'');
 if(row.status==='uncertain'||/UPSTREAM_OUTCOME_UNKNOWN|credit_balance_exhausted|OPENAI_KEY_MISSING|OPENAI_[45]|column .+ does not exist|JOB_EXPIRED/.test(code))return 'system_error';
 if(row.stage==='topic_review_required'||/TOPIC_CANDIDATES_DISCARDED/.test(code))return 'topic_review';
 if(row.stage==='source_review_required'||doc.source_review_required||q.severity==='critical'||q.classification?.critical?.length)return 'source_review';
 if(doc.translation_pending_indices?.length)return 'translation_review';
 if(doc.editorial_review_required||row.stage==='editorial_review_required'||/EDITORIAL_.*REJECTED|CONTENT_QUALITY_REJECTED|품질 검토 필요/.test(code))return 'copy_review';
 if(row.status==='failed')return 'system_error';
 if(!hasEditorialCopy(s))return 'empty';
 if(s.photos_pending_review||row.stage==='photo_review_required')return 'photo_review';
 if(doc.thumbnail_render_pending||!Array.isArray(s.images)||s.images.length!==s.carousel_slides.length||s.images.some((image:unknown)=>typeof image!=='string'||!image.trim()))return 'render_review';
 if(q.status!=='passed')return 'copy_review';
 return 'ready';
}
export const EDITORIAL_STATE_LABELS:Record<EditorialState,[string,string]>={
 running:['In progress','진행 중'],system_error:['System action needed','시스템 조치 필요'],
 topic_review:['Choose or refine a topic','주제 보완 필요'],source_review:['Verify sources','출처 보완 필요'],
 copy_review:['Edit the saved copy','원고 보완 필요'],translation_review:['Update translation','번역 갱신 필요'],
 photo_review:['Review photos','사진 선택 및 승인'],render_review:['Finish card images','이미지 완성 필요'],
 ready:['Ready for final approval','최종 승인 대기'],empty:['Not written yet','작성 전'],published:['Published','게시됨'],scheduled:['Scheduled','예약됨']
};
export function visibleEditorialDrafts(rows:Row[]):Row[] {
 const latest=new Map<string,Row>();
 for(const row of rows){
  if(!hasEditorialCopy(row)||!['needs_approval','failed'].includes(row.status))continue;
  const key=String(row.regeneration_root_id||row.id),old=latest.get(key);
  if(!old||Date.parse(row.updated_at||row.generated_at)>Date.parse(old.updated_at||old.generated_at))latest.set(key,row);
 }
 return [...latest.values()].sort((a,b)=>Date.parse(b.updated_at||b.generated_at)-Date.parse(a.updated_at||a.generated_at));
}
export function productionMetrics(jobs:Row[]){
 const threads=new Map<string,Row[]>();
 for(const job of jobs){const key=String(job.content_workflow_id||job.generation_thread_id||job.id);threads.set(key,[...(threads.get(key)||[]),job]);}
 const latest=[...threads.values()].map(rows=>[...rows].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0]);
 return {window:'latest_100_jobs',jobs:jobs.length,posts:threads.size,
  system_errors:latest.filter(row=>editorialState(row)==='system_error').length,
  editorial_reviews:latest.filter(row=>['copy_review','topic_review','source_review','translation_review'].includes(editorialState(row))).length,
  image_pending:latest.filter(row=>['photo_review','render_review'].includes(editorialState(row))).length,
  ready:latest.filter(row=>editorialState(row)==='ready').length,
  retries:jobs.filter(row=>row.retry_of_job_id).length,
  reserved_usd:jobs.reduce((n,row)=>n+Number(row.reserved_usd||0),0),
  input_tokens:jobs.reduce((n,row)=>n+Number(row.input_tokens||0),0),output_tokens:jobs.reduce((n,row)=>n+Number(row.output_tokens||0),0)};
}
