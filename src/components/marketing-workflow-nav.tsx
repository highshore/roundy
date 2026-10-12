'use client';
import {tr,type Locale} from '@/lib/locale';
import {editorialState,EDITORIAL_STATE_LABELS} from '@/lib/marketing-workflow';
import './marketing-workflow-nav.css';
type Row=Record<string,any>;
const groups=[
 {id:'content',en:'Content',ko:'콘텐츠',tabs:['draft','reels','stories','trend','assets','generation']},
 {id:'calendar',en:'Calendar',ko:'캘린더',tabs:['queue','publishing']},
 {id:'performance',en:'Performance',ko:'성과',tabs:['growth','overview']},
 {id:'settings',en:'Settings',ko:'설정',tabs:['automation','connection']}
];
export function MarketingWorkflowNav({locale,activeTab,items,onNavigate}:{locale:Locale;activeTab:string;items:readonly(readonly[string,string,any])[];onNavigate:(id:any)=>void}){
 const t=(en:string,ko:string)=>tr(locale,en,ko),current=groups.find(g=>g.tabs.includes(activeTab))||groups[0];
 return <nav className="marketing-workflow-nav" aria-label={t('Instagram workspace','인스타그램 작업 메뉴')}>
  <div className="marketing-workflow-groups">{groups.map(g=><button type="button" key={g.id} aria-pressed={current.id===g.id} onClick={()=>onNavigate(g.tabs[0])}>{t(g.en,g.ko)}</button>)}</div>
  <div className="marketing-workflow-tools" role="tablist" aria-label={t(current.en,current.ko)}>{current.tabs.map(id=>{
   const item=items.find(x=>x[0]===id);if(!item)return null;const Icon=item[2];
   return <button type="button" role="tab" key={id} aria-selected={activeTab===id} onClick={()=>onNavigate(id)}><Icon size={15}/>{item[1]}</button>;
  })}</div>
 </nav>;
}
export function MarketingWorkflowSteps({draft,locale}:{draft:Row;locale:Locale}){
 const t=(en:string,ko:string)=>tr(locale,en,ko),state=editorialState(draft);
 const step=['empty','topic_review'].includes(state)?0:['copy_review','source_review','translation_review'].includes(state)?1:['photo_review','render_review'].includes(state)?2:3;
 const target=step<2?'roundy-editorial-studio':step===2?'roundy-marketing-photo-editor':'roundy-marketing-approval';
 const total=draft.carousel_slides?.length||0,stories=draft.content_document?.brand_outro_version===1?total-1:total;
 return <section className="marketing-workflow-steps" aria-label={t('Next step','다음 작업')}>
  <ol>{[['Topic','주제'],['Copy','원고'],['Images','이미지'],['Approval','승인']].map(([en,ko],index)=><li key={en} aria-current={step===index?'step':undefined}><span>{index+1}</span>{t(en,ko)}</li>)}</ol>
  <div><p><strong>{t(...EDITORIAL_STATE_LABELS[state])}</strong><small>{stories} {t('story cards','장 본문')}{stories!==total?' + 1 '+t('Roundy card','라운디 소개'):''} / {t('Total','총')} {total}{t(' cards','장')}</small></p>
   <button type="button" className="admin-secondary" onClick={()=>document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'})}>{t('Continue editing','이어서 작업')}</button></div>
 </section>;
}
export function MarketingProductionMetrics({metrics,locale}:{metrics:Row|null;locale:Locale}){
 if(!metrics)return null;const t=(en:string,ko:string)=>tr(locale,en,ko);
 return <section className="marketing-production-metrics"><h3>{t('Production health','콘텐츠 제작 상태')}</h3>
  <p>{t('Latest 100 recorded steps, grouped by content workflow. Reserved amounts are not provider invoices.','최근 작업 기록 최대 100건을 콘텐츠별로 묶었습니다. 예약액은 실제 API 청구액이 아닙니다.')}</p>
  <dl>{[['system_errors','System issues','시스템 오류'],['editorial_reviews','Copy / source review','원고 및 출처 보완'],['image_pending','Images pending','이미지 작업 대기'],['ready','Ready for approval','최종 승인 대기'],['retries','Retries','재시도']].map(([key,en,ko])=><div key={key}><dt>{t(en,ko)}</dt><dd>{Number(metrics[key]||0)}</dd></div>)}</dl>
 </section>;
}
