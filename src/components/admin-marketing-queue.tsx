'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowRight,CalendarClock,CheckCircle2,Clock3,Image as ImageIcon,RefreshCw,ShieldAlert} from 'lucide-react';
import {tr,type Locale} from '@/lib/locale';
import {formatMarketingKstTime,marketingScheduleItems,type MarketingRow,type ScheduleItem} from '@/lib/marketing-admin-view';
type View='upcoming'|'review'|'issues'|'history';
const STORY_BASE='/api/admin/marketing/stories';
const publishStatus:Record<string,[string,string]>={
 queued:['Queued','대기'],scheduled:['Scheduled','예약'],approved:['Approved','승인'],
 generated:['Ready for review','검수 대기'],generating:['Generating','생성 중'],
 publishing:['Publishing','게시 중'],sent:['Published','발행됨'],published:['Published','발행됨'],
 failed:['Failed','실패'],needs_review:['Needs verification','결과 확인 필요'],
 manual_ready:['Manual upload','수동 업로드'],canceled:['Canceled','취소']
};
export function AdminMarketingQueue({locale,runs,onNavigate}:{
 locale:Locale;runs:MarketingRow[];onNavigate:(tab:'draft'|'publishing'|'stories')=>void
}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [stories,setStories]=useState<MarketingRow[]>([]),[attempts,setAttempts]=useState<MarketingRow[]>([]);
 const [feedAttempts,setFeedAttempts]=useState<Record<string,MarketingRow[]>>({});
 const [view,setView]=useState<View>('upcoming'),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=useCallback(async()=>{
  const r=await fetch(STORY_BASE,{cache:'no-store'});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||'STORY_STATUS_UNAVAILABLE');
  setStories(data.stories||[]);setAttempts(data.attempts||[]);
 },[]);
 useEffect(()=>{
  let canceled=false;
  fetch(STORY_BASE,{cache:'no-store'}).then(async r=>{const v=await r.json();if(!r.ok)throw new Error(v.error||'STORY_STATUS_UNAVAILABLE');return v;})
   .then(data=>{if(!canceled){setStories(data.stories||[]);setAttempts(data.attempts||[]);}})
   .catch(e=>{if(!canceled)setError(String(e.message||e));})
   .finally(()=>{if(!canceled)setLoading(false);});
  return()=>{canceled=true;};
 },[]);
 const all=useMemo(()=>marketingScheduleItems(runs,stories),[runs,stories]);
 const upcoming=new Set(['queued','scheduled','publishing']);
 const review=new Set(['generated','approved','generating']);
 const issues=new Set(['failed','needs_review','manual_ready']);
 const visible=all.filter(item=>view==='upcoming'?upcoming.has(item.status):
  view==='review'?review.has(item.status):
   view==='issues'?issues.has(item.status):
    ['sent','published','canceled'].includes(item.status));
 const counts={
  upcoming:all.filter(x=>upcoming.has(x.status)).length,
  review:all.filter(x=>review.has(x.status)).length,
  issues:all.filter(x=>issues.has(x.status)).length,
  history:all.filter(x=>['sent','published','canceled'].includes(x.status)).length
 };
 async function readFeedAttempts(id:string){
  const response=await fetch('/api/admin/marketing/runs/'+id+'/attempts',{cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'ATTEMPT_HISTORY_UNAVAILABLE');
  setFeedAttempts(prev=>({...prev,[id]:data.attempts||[]}));
 }
 function renderItem(item:ScheduleItem){
  const feed=runs.find(r=>r.id===item.id);
  const story=stories.find(s=>s.id===item.id);
  const related=story?attempts.filter(a=>a.story_id===story.id):feedAttempts[item.id]||[];
  return <details className="marketing-queue-entry" key={item.kind+item.id}>
   <summary>
    <div className="marketing-queue-entry-image">
     {item.image_url?<img src={item.image_url} alt=""/>:item.kind==='story'?<ImageIcon size={20}/>:<CalendarClock size={20}/>}
    </div>
    <div className="marketing-queue-entry-details">
     <span className="marketing-queue-entry-kind">{item.kind==='story'?'STORY':'FEED'}{feed?.snapshot?.feed_sequence?' #'+feed.snapshot.feed_sequence:''}</span>
     <strong>{item.title}</strong>
     <small>{formatMarketingKstTime(item.scheduled_for,locale)||item.date_kst} {item.scheduled_for?'':' / '+item.date_kst+' KST'}</small>
    </div>
    <span className={'marketing-workspace-pill marketing-workspace-pill-'+item.status}>
     {t(...(publishStatus[item.status]||['Unknown','알 수 없음']))}
    </span>
   </summary>
   <div className="marketing-queue-entry-expanded">
    <div className="marketing-queue-detail-grid">
     <p><strong>{t('Content type','콘텐츠 유형')}</strong>
      <span>{item.kind==='story'?'Instagram Story':'Instagram Feed'}</span></p>
     <p><strong>{t('Schedule date (KST)','발행 날짜 (KST)')}</strong><span>{item.date_kst||'—'}</span></p>
     {feed?.snapshot?.feed_carousel_count&&<p><strong>{t('Card count','카드 수')}</strong>
      <span>{feed.snapshot.feed_carousel_count} {t('slides','장')}</span></p>}
     {feed?.snapshot?.feed_slot_position&&<p><strong>{t('Daily slot','일일 슬롯')}</strong>
      <span>#{feed.snapshot.feed_slot_position}</span></p>}
     {story?.feed_date_kst&&<p><strong>{t('Original Feed due','원본 Feed 발행일')}</strong>
      <span>{story.feed_date_kst} KST</span></p>}
    </div>
    {item.error&&item.status!=='sent'&&item.status!=='published'&&
     <p className={issues.has(item.status)?'admin-error':'marketing-workspace-muted'}>{item.error}</p>}
    <div className="marketing-queue-attempts">
     <strong>{t('Publish attempts','발행 시도 이력')}</strong>
     {item.kind==='feed'&&!feedAttempts[item.id]&&<button type="button" className="admin-secondary"
      onClick={()=>void readFeedAttempts(item.id).catch(e=>setError(String(e)))}>
      {t('Load Feed attempt log','Feed 시도 기록 조회')}</button>}
     {related.length===0&&<p className="marketing-workspace-muted">{t('No recorded API attempt.','기록된 API 시도가 없습니다.')}</p>}
     {related.map((attempt:MarketingRow)=><p key={attempt.id||attempt.story_id+attempt.started_at}>
      <span>{String(attempt.state||'')}</span>
      <small>{formatMarketingKstTime(attempt.started_at,locale)}</small>
      {attempt.error_message&&<span>{attempt.error_message}</span>}
     </p>)}
    </div>
    <div className="marketing-queue-entry-actions">
     {item.kind==='story'?<button type="button" className="admin-secondary" onClick={()=>onNavigate('stories')}>
      {t('Review in Stories','Stories에서 검토')}<ArrowRight size={15}/></button>:
      <button type="button" className="admin-secondary" onClick={()=>onNavigate('publishing')}>
       {t('View Feed history / retry','Feed 기록 및 재시도')}<ArrowRight size={15}/></button>}
    </div>
   </div>
  </details>;
 }
 return <section className="marketing-workspace-section">
  <div className="marketing-workspace-section-head">
   <div><p className="admin-kicker">PUBLISHING / ASIA–SEOUL</p>
    <h2>{t('Publishing schedule','발행 대기열 및 일정')}</h2>
    <p>{t('Feed and Story status together. All days and times are shown in KST. Automatic retry is never used for uncertain outcomes.',
      'Feed와 Story 상태를 한곳에서 확인합니다. 모든 날짜와 시간은 KST 기준이며 결과가 불확실하면 자동 재시도하지 않습니다.')}</p>
   </div>
   <button type="button" className="admin-secondary" disabled={loading}
    onClick={()=>{setError('');void load().catch(e=>setError(String(e)));}}>
    <RefreshCw size={16}/>{t('Refresh Story status','Story 상태 새로고침')}</button>
  </div>
  <div className="marketing-workspace-panel">
   <div className="marketing-queue-filterbar" role="group" aria-label={t('Filter publishing records','발행 기록 필터')}>
    {([
     ['upcoming',t('Upcoming','예약 및 대기'),<Clock3 size={16}/>],
     ['review',t('Awaiting approval','검수 및 승인 대기'),<ShieldAlert size={16}/>],
     ['issues',t('Failures & verification','오류 및 결과 확인'),<ShieldAlert size={16}/>],
     ['history',t('Published history','발행 완료'),<CheckCircle2 size={16}/>]
    ] as const).map(([key,label,icon])=><button type="button" key={key} aria-pressed={view===key}
     onClick={()=>setView(key)}>{icon}{label}<small>{counts[key]}</small></button>)}
   </div>
   {error&&<p role="alert" className="admin-error">{error}</p>}
   {loading&&<p className="marketing-workspace-muted" role="status">{t('Loading Story status…','Story 상태 불러오는 중…')}</p>}
   <div className="marketing-queue-list">
    {visible.length?visible.map(renderItem):
     <div className="marketing-asset-empty"><CalendarClock size={28}/>
      <strong>{t('No items in this view','해당 상태의 콘텐츠가 없습니다')}</strong>
      <p>{t('Approved posts retain their KST reservations until publishing.',
       '승인된 게시물은 발행될 때까지 KST 예약을 유지합니다.')}</p>
      <button className="admin-secondary" type="button" onClick={()=>onNavigate('draft')}>
       {t('Go to Drafts','초안으로 이동')}<ArrowRight size={14}/></button>
     </div>}
   </div>
  </div>
 </section>;
}
