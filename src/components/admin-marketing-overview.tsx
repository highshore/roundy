'use client';
import {useEffect,useMemo,useState} from 'react';
import {ArrowRight,CalendarDays,CheckCircle2,Clock3,Images,Layers3,RefreshCw,Settings2,ShieldAlert,Sparkles} from 'lucide-react';
import {tr,type Locale} from '@/lib/locale';
import {formatMarketingKst,formatMarketingKstTime,marketingDashboardMetrics,marketingScheduleItems,type MarketingRow} from '@/lib/marketing-admin-view';

type Tab='draft'|'assets'|'queue'|'automation'|'stories'|'publishing'|'generation';
export function AdminMarketingOverview({locale,drafts,runs,settings,onNavigate}:{
 locale:Locale;drafts:MarketingRow[];runs:MarketingRow[];settings:MarketingRow|null;
 onNavigate:(tab:Tab)=>void
}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [stories,setStories]=useState<MarketingRow[]>([]),[photos,setPhotos]=useState<number|null>(null);
 const [busy,setBusy]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let cancelled=false;
  Promise.allSettled([
   fetch('/api/admin/marketing/stories',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('STORY_RECORDS_UNAVAILABLE');return r.json();}),
   fetch('/api/admin/marketing/photos/assets',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('PHOTO_ASSETS_UNAVAILABLE');return r.json();})
  ]).then(results=>{if(cancelled)return;
   if(results[0].status==='fulfilled')setStories(results[0].value.stories||[]);
   if(results[1].status==='fulfilled')setPhotos(Number(results[1].value.counts?.approved??0));
   if(results.some(r=>r.status==='rejected'))setError(t('Some live metrics are unavailable.','일부 실시간 지표를 불러오지 못했습니다.'));
  }).finally(()=>{if(!cancelled)setBusy(false);});
  return()=>{cancelled=true};
 },[locale]);
 const metrics=useMemo(()=>marketingDashboardMetrics(drafts,runs,stories,photos??0),[drafts,runs,stories,photos]);
 const queue=useMemo(()=>marketingScheduleItems(runs,stories).filter(x=>
  ['queued','scheduled','approved','generated','publishing'].includes(x.status)).slice(0,5),[runs,stories]);
 const today=formatMarketingKst(new Date())||'';
 const insight=metrics.unresolved_failures>0
  ?t('Some publication attempts need review. Resolve them before retrying.','발행 결과 확인이 필요한 항목이 있습니다. 재시도 전 상태를 확인하세요.')
  :metrics.drafts_awaiting_review>0
    ?t('Review drafts and their photo/quality checks before approval.','초안을 검토하고 사진 검수와 품질 검사 후 승인하세요.')
    :t('No urgent publication review is currently visible.','현재 확인된 긴급 게시 검토 항목이 없습니다.');
 return <section className="marketing-overview">
  <div className="marketing-overview-hero">
   <div className="marketing-overview-hero-copy">
    <span className="marketing-overview-eyebrow"><span className="marketing-live-dot"/>{t('Instagram content operations','Instagram 콘텐츠 운영')} / KST</span>
    <h2>{t('Plan. Review. Publish.','만들고, 검토하고, 발행하세요.')}</h2>
    <p>{insight}</p>
    <div className="marketing-overview-actions">
     <button type="button" className="admin-primary" onClick={()=>onNavigate('draft')}><Sparkles size={17}/>{t('Work on content','콘텐츠 작업하기')}<ArrowRight size={16}/></button>
     <button type="button" className="admin-secondary" onClick={()=>onNavigate('queue')}><CalendarDays size={17}/>{t('Publishing schedule','발행 일정')}</button>
    </div>
   </div>
   <div className="marketing-overview-day">
    <span>{t('Today in Seoul','서울 기준 오늘')}</span>
    <strong>{today}</strong><small>ASIA / SEOUL</small>
    <div className="marketing-overview-separator"/>
    <span>{t('Feed publication limit','Feed 일일 발행 한도')}</span>
    <strong>{Number(settings?.feed_daily_max_posts??1)} <small>/ {t('day','일')}</small></strong>
    <small>{settings?.carousel_mode==='alternating'?'3 → 5 → 3 → 5':'Fixed · 5 '+t('cards','장')}</small>
   </div>
  </div>
  <div className="marketing-kpi-grid">
   {[
    {icon:<Layers3 size={20}/>,label:t('Drafts awaiting review','승인 대기 초안'),count:metrics.drafts_awaiting_review,tip:t('Generate, edit and approve','생성, 수정, 승인'),tab:'draft' as Tab},
    {icon:<CalendarDays size={20}/>,label:t('Feed posts in queue','Feed 발행 대기'),count:metrics.feeds_queued,tip:t('KST posting sequence','KST 예약 순서'),tab:'queue' as Tab},
    {icon:<Images size={20}/>,label:t('Approved photos','승인된 사진 자산'),count:photos===null?'—':metrics.approved_photos,tip:t('Reviewed multi-provider photo library','검수 완료 사진 자산'),tab:'assets' as Tab},
    {icon:<ShieldAlert size={20}/>,label:t('Needs attention','조치 필요'),count:busy?'—':metrics.unresolved_failures,
     tip:t('Feed & Story failures','Feed 및 Story 오류'),tab:'queue' as Tab}
   ].map(item=><button key={item.label} type="button" className="marketing-kpi-card"
    onClick={()=>onNavigate(item.tab)}>
    <span className="marketing-kpi-icon">{item.icon}</span>
    <strong>{item.count}</strong><span>{item.label}</span><small>{item.tip}<ArrowRight size={13}/></small>
   </button>)}
  </div>
  <div className="marketing-overview-columns">
   <section className="marketing-workspace-panel marketing-overview-queue">
    <div className="marketing-overview-heading"><div><p className="admin-kicker">UP NEXT</p>
     <h3>{t('Upcoming publishing','다가오는 발행 일정')}</h3>
     <p>{t('Approved Feed and Story items in Seoul time.','승인된 Feed와 Story의 서울 기준 예약 일정입니다.')}</p>
    </div><button className="admin-secondary" type="button" onClick={()=>onNavigate('queue')}>{t('View all','전체 보기')}<ArrowRight size={15}/></button></div>
    {queue.length?queue.map(item=><div className="marketing-overview-queue-row" key={item.kind+item.id}>
     <span className="marketing-overview-queue-thumb">{item.image_url?<img src={item.image_url} alt=""/>:item.kind==='feed'?<Layers3 size={20}/>:<Images size={20}/>}</span>
     <div><strong>{item.title}</strong><small>{item.kind==='feed'?'Feed':'Story'} / {formatMarketingKstTime(item.scheduled_for,locale)||item.date_kst}</small></div>
     <span className="marketing-workspace-pill">{item.status==='queued'?t('Queued','대기 중'):item.status==='scheduled'?t('Scheduled','예약됨'):item.status==='generated'?t('Review','검토 필요'):t('Approved','승인됨')}</span>
    </div>):<div className="marketing-asset-empty"><Clock3 size={24}/><strong>{t('No upcoming posts yet','예정된 게시물이 없습니다')}</strong>
     <p>{t('Once you approve content, its reserved KST date will appear here.','콘텐츠를 승인하면 이곳에 KST 예약 일정이 표시됩니다.')}</p>
    </div>}
   </section>
   <section className="marketing-workspace-panel marketing-overview-controls">
    <div className="marketing-overview-heading"><div><p className="admin-kicker">WORKFLOW</p>
     <h3>{t('Content safety at a glance','콘텐츠 검수 현황')}</h3></div></div>
    <div className="marketing-overview-setting-line"><CheckCircle2 size={18}/>
     <div><strong>{t('Human approval required','관리자 최종 승인 필수')}</strong>
      <small>{t('Draft copy, image rights and quality checks','문구, 사진 저작권, 품질 검증')}</small></div></div>
    <div className="marketing-overview-setting-line"><Layers3 size={18}/>
     <div><strong>{t('Carousel','카드뉴스')} / {settings?.carousel_mode==='alternating'?'Alternating':'Fixed'}</strong>
      <small>{settings?.carousel_mode==='alternating'?'3 → 5 '+t('by scheduled order','발행 순서 적용'):'5 '+t('cards','장')+' / 4:5'}</small></div></div>
    <div className="marketing-overview-setting-line"><Images size={18}/>
     <div><strong>{t('Story preview automation','Story 미리보기 자동 생성')}</strong>
      <small>{settings?.story_preview_auto_enabled?t('Enabled (manual approval still required)','켜짐 (승인은 수동)'):t('Disabled','꺼짐')}</small></div></div>
    <button type="button" className="admin-secondary marketing-overview-settings-link"
     onClick={()=>onNavigate('automation')}><Settings2 size={16}/>{t('Open marketing settings','마케팅 설정 열기')}<ArrowRight size={15}/></button>
   </section>
  </div>
  {error&&<p className="admin-error" role="status">{error}</p>}
 </section>;
}
