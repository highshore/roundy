// Shared read-only selectors for the existing Roundy marketing entities.
// Deliberately no local configuration or mutation: Supabase remains the source of truth.
export type MarketingRow=Record<string,any>;
export type ScheduleItem={
 id:string;kind:'feed'|'story';status:string;title:string;scheduled_for:string|null;
 date_kst:string;error:string;image_url:string|null;feed_run_id:string|null;
};
export function formatMarketingKst(value:string|Date|null|undefined){
 if(!value)return null;
 const date=value instanceof Date?value:new Date(value);
 if(Number.isNaN(date.getTime()))return null;
 return new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
 }).format(date);
}
export function formatMarketingKstTime(value:string|Date|null|undefined,locale='ko-KR'){
 if(!value)return '—';
 const date=value instanceof Date?value:new Date(value);
 if(Number.isNaN(date.getTime()))return '—';
 return new Intl.DateTimeFormat(locale,{
  timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric',
  hour:'2-digit',minute:'2-digit',hour12:false
 }).format(date)+' KST';
}
export function isMarketingFeedRun(run:MarketingRow){
 return run.channel==='instagram' && (run.snapshot?.media_kind||'feed')==='feed';
}
export function marketingScheduleItems(runs:MarketingRow[],stories:MarketingRow[]):ScheduleItem[]{
 const feeds=runs.filter(isMarketingFeedRun).map((r):ScheduleItem=>({
  id:String(r.id),kind:'feed',status:String(r.status||'unknown'),
  title:String(r.snapshot?.title||r.snapshot?.caption||'').split('\n')[0].slice(0,95)||'Roundy Feed',
  scheduled_for:r.scheduled_for||null,
  date_kst:formatMarketingKst(r.scheduled_for)||'',
  error:String(r.message||''),
  image_url:Array.isArray(r.snapshot?.images)?r.snapshot.images[0]||null:null,
  feed_run_id:String(r.id)
 }));
 const storyItems=stories.map((s):ScheduleItem=>({
  id:String(s.id),kind:'story',status:String(s.status||'unknown'),
  title:String(s.teaser_title||'Roundy Story'),
  scheduled_for:s.scheduled_for||null,
  date_kst:formatMarketingKst(s.scheduled_for)||String(s.preview_date_kst||''),
  error:String(s.error_message||s.error_code||''),
  image_url:s.image_url||null,feed_run_id:String(s.feed_run_id||'')
 }));
 const dateSort=(a:ScheduleItem,b:ScheduleItem)=>(
  (a.scheduled_for?Date.parse(a.scheduled_for):Number.POSITIVE_INFINITY)
  -(b.scheduled_for?Date.parse(b.scheduled_for):Number.POSITIVE_INFINITY)
 )||a.id.localeCompare(b.id);
 const pending=new Set(['queued','scheduled','approved','generated','generating','publishing']);
 const failures=new Set(['failed','needs_review','manual_ready']);
 return [...feeds,...storyItems].sort((a,b)=>{
  const priority=(x:ScheduleItem)=>pending.has(x.status)?0:failures.has(x.status)?1:2;
  return priority(a)-priority(b)||dateSort(a,b);
 });
}
export function marketingDashboardMetrics(drafts:MarketingRow[],runs:MarketingRow[],stories:MarketingRow[],approvedPhotoCount=0){
 const feed=runs.filter(isMarketingFeedRun);
 return {
  drafts_awaiting_review:drafts.filter(d=>d.status==='needs_approval').length,
  feeds_queued:feed.filter(r=>['queued','scheduled','publishing'].includes(r.status)).length,
  stories_awaiting_review:stories.filter(s=>['generated','approved'].includes(s.status)).length,
  unresolved_failures:feed.filter(r=>['failed','needs_review'].includes(r.status)).length
   +stories.filter(s=>['failed','needs_review'].includes(s.status)).length,
  approved_photos:approvedPhotoCount,
  stories_queued:stories.filter(s=>s.status==='scheduled').length
 };
}
