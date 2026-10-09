'use client';
import {useEffect,useState} from 'react';
import {Heading} from './heading';
import {tr,type Locale} from '@/lib/locale';
import type {GrowthPillar,GrowthSlot} from '@/lib/marketing-growth-planner';

type Row=Record<string,any>;
const labels:Record<GrowthPillar,[string,string]>={
 seoul:['Seoul discoveries','서울 트렌드와 핫플'],
 culture:['Korea life','한국 생활과 문화'],
 humor:['Relatable humor','공감형 밈과 릴스'],
 people:['People and conversation','사람과 대화'],
 brand:['Roundy updates','라운디 소식']
};
const formatLabels:Record<string,[string,string]>={
 carousel:['Carousel','캐러셀'],reel_candidate:['Reel candidate (manual)','릴스 후보 (수동 제작)'],brand:['Brand post','브랜드 콘텐츠']
};

export function AdminMarketingGrowth({locale}:{locale:Locale}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [data,setData]=useState<Row|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);
  fetch('/api/admin/marketing/growth',{signal:controller.signal,cache:'no-store'})
   .then(async response=>{const json=await response.json();if(!response.ok)throw new Error(json.error||'Could not load growth metrics');return json;})
   .then(result=>{if(!controller.signal.aborted){setData(result);setError('');}})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Growth metrics unavailable');})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[]);
 if(loading)return <section className="marketing-tab-panel"><p role="status">{t('Loading organic growth metrics…','콘텐츠 성장 지표를 조회하는 중입니다…')}</p></section>;
 if(!data)return <section className="marketing-tab-panel"><p className="admin-error" role="alert">{error||t('Growth analytics unavailable','성장 지표를 불러올 수 없습니다')}</p></section>;
 const stats=data.totals||{},summary=(data.pillars||[]) as Row[],topics=(data.topics||[]) as Row[],plan=(data.week_plan||[]) as GrowthSlot[],threshold=data.thresholds||{};
 return <section className="marketing-tab-panel">
  <div className="admin-section-title"><div><p className="admin-kicker">ROUNDY GROWTH ENGINE</p><Heading level={2}>{t('Organic growth control','오가닉 성장 관리')}</Heading><p>{t('An editorial test plan, not a claim about Instagram ranking weights. Publishing still requires approval.','Instagram 공식 알고리즘 가중치가 아닌 라운디의 실험 계획입니다. 실제 게시는 계속 관리자 승인이 필요합니다.')}</p></div></div>
  <div className="marketing-setup"><strong>{data.enabled?t('Growth mode enabled','성장 모드 활성화'):t('Growth mode not enabled','성장 모드 비활성화')}</strong>
   <p>{t('You can turn it on in Automation. Until then the existing daily content planner stays intact.','자동화 탭에서 성장 모드를 켤 수 있습니다. 활성화 전에는 기존 일일 콘텐츠 기획을 그대로 유지합니다.')}</p>
   <p>{t('Reels listed below are production recommendations, not automatic video creation or publishing.','아래 릴스는 제작 권장안입니다. 영상 자동 생성이나 릴스 자동 게시는 아직 지원되지 않습니다.')}</p>
  </div>
  <div className="admin-two">
   <div className="marketing-settings-card"><strong>{t('Published posts (90d)','게시물 (90일)')}</strong><p><strong>{stats.published??0}</strong></p></div>
   <div className="marketing-settings-card"><strong>{t('Measured posts with reach','도달이 측정된 게시물')}</strong><p><strong>{stats.measured??0}</strong></p></div>
   <div className="marketing-settings-card"><strong>{t('Cumulative measured reach','측정 도달 합계')}</strong><p><strong>{stats.measured_reach??0}</strong></p></div>
   <div className="marketing-settings-card"><strong>{t('Unmeasured posts','도달 데이터가 없는 게시물')}</strong><p><strong>{stats.missing_reach??0}</strong></p></div>
  </div>
  <div className="marketing-settings-card">
   <div className="admin-section-title"><Heading level={3}>{t('Editorial allocation','콘텐츠 편성 비율')}</Heading></div>
   <p className="admin-help">{data.learning?t('Sample minimum passed: cautiously adjusting content weights.','표본 기준을 충족해 콘텐츠 비율을 제한적으로 조정하고 있습니다.'):t('Experiment stage: fixed editorial mix. Performance is too sparse for automatic winner selection.','실험 단계입니다. 자동 우승 주제를 고르기엔 데이터가 부족해 기준 비율을 유지합니다.')}</p>
   <div className="marketing-log-list">{summary.map(row=>{
    const p=row.pillar as GrowthPillar;
    return <div className="marketing-log-row" key={p}><div className="marketing-log-main"><div><strong>{t(...labels[p])} — {Math.round(Number(data.weights?.[p]||0))}%</strong><small>{t('Posts','게시물')} {row.posts} / {t('Reach','도달')} {row.reach} / {t('Shares per 100 reach','도달 100명당 공유')} {row.share_rate} / {t('Saves per 100 reach','저장')} {row.save_rate}</small></div></div></div>;
   })}</div>
   <p className="admin-help">{t('Learning starts after at least','학습 시작 기준:')} {threshold.min_posts} {t('posts,','개 게시물,')} {threshold.min_reach} {t('aggregate reach, and minimum evidence in each content group.','명 이상의 누적 도달 및 각 콘텐츠 유형의 최소 표본 확보.')}</p>
  </div>
  <div className="marketing-settings-card">
   <div className="admin-section-title"><Heading level={3}>{t('Next seven days','향후 7일 편성안')}</Heading></div>
   <div className="marketing-log-list">{plan.map(slot=><div className="marketing-log-row" key={slot.date}><div className="marketing-log-main"><div><strong>{slot.date} · {t(...labels[slot.pillar])}</strong><small>{slot.language.toUpperCase()} / {t(...formatLabels[slot.recommended_format])} / {slot.editorial_goal}</small></div></div></div>)}</div>
   <p className="admin-help">{t('Verified Seoul topics are used only when a valid trend fact pack is available; otherwise a safe evergreen Korea-life topic replaces the scheduled slot.','서울 트렌드는 검증된 최신 팩트팩이 있을 때만 사용하며, 확인된 자료가 없으면 안전한 한국 생활 상시 콘텐츠로 대체합니다.')}</p>
  </div>
  <div className="marketing-settings-card">
   <div className="admin-section-title"><Heading level={3}>{t('Topics and language evidence','주제 및 언어별 성과')}</Heading></div>
   {topics.length?<div className="marketing-log-list">{topics.map((row:Row)=><div className="marketing-log-row" key={row.topic+row.language}><div className="marketing-log-main"><div><strong>{row.topic} / {row.language?.toUpperCase()}</strong><small>{t('Posts','게시물')} {row.posts} · {t('Reach','도달')} {row.reach} · {t('Share rate','공유율')} {row.share_rate}% · {t('Save rate','저장률')} {row.save_rate}%</small></div></div></div>)}</div>:<p>{t('No measured post data yet.','측정된 게시물 데이터가 아직 없습니다.')}</p>}
   <p className="admin-help">{t('Current Instagram integration does not provide profile-to-follow conversion. Reach and engagement are proxy metrics; do not interpret them as followers gained.','현재 Instagram 연동에는 프로필 방문 대비 팔로우 전환 데이터가 없습니다. 도달과 반응은 대리지표이며 실제 신규 팔로워 수와 다릅니다.')}</p>
  </div>
 </section>;
}
