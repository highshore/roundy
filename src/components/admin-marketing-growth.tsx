'use client';
import {useEffect,useState} from 'react';
import {Heading} from './heading';
import {tr,type Locale} from '@/lib/locale';
import type {GrowthPillar,GrowthSlot} from '@/lib/marketing-growth-planner';

type Row=Record<string,any>;
const pillars:Record<GrowthPillar,[string,string]>={
 seoul:['Seoul discoveries','서울 트렌드와 핫플'],
 culture:['Korea life','한국 생활과 문화'],
 humor:['Original humor','공감형 밈과 릴스'],
 people:['People and conversation','사람과 대화'],
 brand:['Roundy updates','라운디 소식']
};
const formats:Record<string,[string,string]>={
 carousel:['Carousel','캐러셀'],
 reel_candidate:['Reel idea','릴스 제작 후보'],
 brand:['Brand post','브랜드 콘텐츠']
};
const pillarDescriptions:Record<GrowthPillar,[string,string]>={
 seoul:['Sourced discoveries worth saving','확인된 서울 명소와 실용 정보'],
 culture:['Everyday Korean culture','생활 속 문화 차이와 공감'],
 humor:['Original, relatable moments','독창적인 상황극과 유머'],
 people:['Useful ways to connect','새로운 사람과 대화하는 방법'],
 brand:['Occasional brand updates','서비스와 브랜드의 새로운 소식']
};
const number=(value:unknown)=>Number(value||0).toLocaleString();
const signedNumber=(value:unknown)=>value==null?'—':(Number(value)>0?'+':'')+Number(value).toLocaleString();
const ratio=(value:unknown,total:unknown)=>Math.min(100,Math.round(Number(value||0)/Math.max(1,Number(total||1))*100));
const dateLabel=(value:string,locale:Locale)=>{
 const parts=new Date(value+'T12:00:00+09:00');
 return Number.isNaN(parts.getTime())?'':parts.toLocaleDateString(locale==='ko'?'ko-KR':'en-US',{weekday:'short',timeZone:'Asia/Seoul'});
};

export function AdminMarketingGrowth({locale}:{locale:Locale}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [data,setData]=useState<Row|null>(null);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/admin/marketing/growth',{signal:controller.signal,cache:'no-store'})
   .then(async response=>{
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Could not load growth metrics');
    return result;
   })
   .then(result=>{if(!controller.signal.aborted)setData(result);})
   .catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Growth metrics unavailable');})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[]);
 if(loading)return <section className="marketing-tab-panel" aria-busy="true"><p role="status">{t('Loading growth insights…','성장 분석 데이터를 불러오는 중입니다…')}</p></section>;
 if(!data)return <section className="marketing-tab-panel"><p role="alert" className="admin-error">{error||t('Growth insights unavailable','성장 지표를 불러오지 못했습니다.')}</p></section>;

 const stats=data.totals||{},followers=data.followers||{};
 const summary=(data.pillars||[]) as Row[],topics=(data.topics||[]) as Row[];
 const plan=(data.week_plan||[]) as GrowthSlot[],thresholds=data.thresholds||{};
 const weights=data.weights||{};
 const active=data.enabled===true,learning=data.learning===true;
 const published=Number(stats.published||0),measured=Number(stats.measured||0),reach=Number(stats.measured_reach||0);
 const allocations=summary.filter(row=>row.pillar in pillars);

 return <section className="marketing-tab-panel marketing-insights">
  <header className="marketing-insights-heading">
   <p className="admin-kicker">ROUNDY / GROWTH INSIGHTS</p>
   <Heading level={2}>{t('Instagram growth','인스타그램 성장 분석')}</Heading>
   <p>{t('Plan and measure useful Seoul content without guessing from tiny samples.','서울 콘텐츠의 편성과 성과를 한곳에서 확인합니다.')}</p>
  </header>

  <div className={'marketing-insight-notice'+(active?' is-active':'')}>
   <span className="marketing-insight-notice-dot" aria-hidden="true"/>
   <div>
    <strong>{active?t('Growth planning enabled','성장 모드 활성화'):t('Growth planning paused','성장 모드 비활성화')}</strong>
    <p>{active
     ?t('Daily suggestions follow the content mix below. Every post still needs approval.','아래 기준으로 매일 주제를 편성하며 실제 게시는 승인 후 진행됩니다.')
     :t('This is a proposed content mix. Enable Growth mode under Automation when ready.','아래 비율은 실험 계획입니다. 자동화 탭에서 성장 모드를 켤 수 있습니다.')}</p>
   </div>
  </div>

  <section className="marketing-insight-section" aria-labelledby="growth-performance-title">
   <header className="marketing-insight-section-head">
    <div><Heading level={3} id="growth-performance-title">{t('Account overview','계정 현황')}</Heading>
     <p>{t('Actual account totals and the last 90 days of post data','실제 팔로워 수와 최근 90일 게시물 데이터')}</p>
    </div>
   </header>
   <dl className="marketing-insight-kpis">
    <div className="marketing-insight-kpi">
     <dt>{t('Followers','현재 팔로워')}</dt>
     <dd>{followers.current==null?'—':number(followers.current)}</dd>
     <small>{followers.snapshot_date||t('Waiting for a snapshot','첫 수집 대기')}</small>
    </div>
    <div className="marketing-insight-kpi">
     <dt>{t('Net change, 7 days','최근 7일 순증감')}</dt>
     <dd>{signedNumber(followers.change_7d)}</dd>
     <small>{t('30-day change','30일 증감')} {signedNumber(followers.change_30d)}</small>
    </div>
    <div className="marketing-insight-kpi">
     <dt>{t('Published posts','게시 완료')}</dt>
     <dd>{number(published)}</dd>
     <small>{t('Measured posts','성과 수집')} {number(measured)}</small>
    </div>
    <div className="marketing-insight-kpi">
     <dt>{t('Cumulative reach','측정 누적 도달')}</dt>
     <dd>{number(reach)}</dd>
     <small>{t('Missing post insights','미측정 게시물')} {number(stats.missing_reach)}</small>
    </div>
   </dl>
   {followers.capture_status==='unavailable'&&
    <p className="marketing-insight-alert" role="status">{t('Follower data could not be collected. Check the Instagram API permissions.','팔로워 데이터 수집에 실패했습니다. Instagram API 권한을 확인하세요.')}</p>}
   {followers.current==null&&followers.capture_status!=='unavailable'&&
    <p className="marketing-insight-footnote">{t('Follower snapshots will appear when the Instagram API returns the metric. Missing data is never treated as zero.','Instagram API에서 수집한 팔로워 수가 여기에 표시됩니다. 미수집 값은 0으로 처리하지 않습니다.')}</p>}
  </section>

  <section className="marketing-insight-section" aria-labelledby="growth-allocation-title">
   <header className="marketing-insight-section-head">
    <div><Heading level={3} id="growth-allocation-title">{t('Content mix','콘텐츠 편성 비율')}</Heading>
     <p>{t('Initial topic allocation, adjusted only after enough real data','실측 데이터가 충분해지기 전까지는 기준 비율을 유지합니다.')}</p></div>
    <span className="marketing-insight-pill">{learning?t('Learning','성과 반영 중'):t('Experiment','실험 단계')}</span>
   </header>
   <div className="marketing-insight-progress">
    <div className="marketing-insight-progress-line">
     <span>{t('Posts measured','측정 게시물')} <b>{number(measured)} / {number(thresholds.min_posts||30)}</b></span>
     <span>{t('Reach','누적 도달')} <b>{number(reach)} / {number(thresholds.min_reach||5000)}</b></span>
    </div>
    <div className="marketing-insight-progress-track" role="progressbar" aria-label={t('Measured post sample progress','측정 게시물 표본 확보 진행률')} aria-valuemin={0} aria-valuemax={Number(thresholds.min_posts||30)} aria-valuenow={Math.min(measured,Number(thresholds.min_posts||30))}>
     <span style={{width:ratio(measured,thresholds.min_posts||30)+'%'}}/>
    </div>
   </div>
   <ul className="marketing-insight-allocation-list">
    {allocations.map((row:Row)=>{
     const pillar=row.pillar as GrowthPillar,percent=Math.max(0,Number(weights[pillar]||0));
     return <li key={pillar} className="marketing-insight-allocation">
      <div className="marketing-insight-allocation-head">
       <div><strong>{t(...pillars[pillar])}</strong><small>{t(...pillarDescriptions[pillar])}</small></div>
       <b>{Math.round(percent)}%</b>
      </div>
      <div className="marketing-insight-allocation-track" aria-hidden="true"><span style={{width:Math.min(percent,100)+'%'}}/></div>
      <p>{t('Posts','게시물')} {number(row.posts)} <span aria-hidden="true">/</span> {t('Reach','도달')} {number(row.reach)} <span aria-hidden="true">/</span> {t('Shares','공유')} {number(row.shares)} <span aria-hidden="true">/</span> {t('Saves','저장')} {number(row.saves)}</p>
     </li>;
    })}
   </ul>
  </section>

  <section className="marketing-insight-section" aria-labelledby="growth-plan-title">
   <header className="marketing-insight-section-head">
    <div><Heading level={3} id="growth-plan-title">{t('Next 7 days','향후 7일 편성안')}</Heading>
     <p>{t('One planned topic per day. Reel ideas still need separate video production.','날짜별 예정 주제입니다. 릴스 후보는 영상 제작 후 게시할 수 있습니다.')}</p></div>
   </header>
   <ol className="marketing-insight-calendar">
    {plan.map(slot=><li className="marketing-insight-calendar-item" key={slot.date}>
     <div className="marketing-insight-calendar-day" aria-label={slot.date}>
      <strong>{slot.date.slice(-2)}</strong><span>{dateLabel(slot.date,locale)}</span>
     </div>
     <div className="marketing-insight-calendar-body">
      <strong>{t(...pillars[slot.pillar])}</strong>
      <div className="marketing-insight-inline-meta">
       <span className="marketing-insight-language">{slot.language.toUpperCase()}</span>
       <span>{t(...(formats[slot.recommended_format]||['Content','콘텐츠']))}</span>
      </div>
      <p>{t(...pillarDescriptions[slot.pillar])}</p>
     </div>
    </li>)}
   </ol>
   <p className="marketing-insight-footnote">{t('Seoul trends require verified sources. Otherwise the planner uses a safer evergreen topic.','서울 트렌드는 확인된 출처가 있어야 사용하며, 부족하면 상시 콘텐츠로 대체합니다.')}</p>
  </section>

  <section className="marketing-insight-section" aria-labelledby="growth-topic-title">
   <header className="marketing-insight-section-head">
    <div><Heading level={3} id="growth-topic-title">{t('Topic and language performance','주제와 언어별 성과')}</Heading>
     <p>{t('Shares and saves are engagement signals, not follower conversions.','공유와 저장은 반응 지표이며 팔로워 전환을 의미하지 않습니다.')}</p></div>
   </header>
   {topics.length?<ul className="marketing-insight-topic-list">{topics.map((row:Row)=><li key={row.topic+row.language}>
    <div><strong>{String(row.topic||'').replaceAll('_',' ')}</strong><span className="marketing-insight-language">{String(row.language||'').toUpperCase()}</span></div>
    <p>{t('Posts','게시물')} {number(row.posts)} <span aria-hidden="true">/</span> {t('Reach','도달')} {number(row.reach)}</p>
    <p>{t('Share rate','공유율')} {row.share_rate||0}% <span aria-hidden="true">/</span> {t('Save rate','저장률')} {row.save_rate||0}%</p>
   </li>)}</ul>:<p className="marketing-insight-empty">{t('No measured content yet. Results appear here after publishing and insight collection.','아직 수집된 성과가 없습니다. 게시 후 지표가 확보되면 표시됩니다.')}</p>}
   <p className="marketing-insight-footnote">{t('Account-level follower totals cannot identify which individual post gained a follower.','계정 전체의 팔로워 순증감만으로 개별 게시물의 기여도를 판단할 수 없습니다.')}</p>
  </section>
 </section>;
}
