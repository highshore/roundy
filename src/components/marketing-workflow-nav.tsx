'use client';
import {useEffect,useState} from 'react';
import {tr,type Locale} from '@/lib/locale';
import {EDITORIAL_STATE_LABELS} from '@/lib/marketing-workflow';
import {workflowNavigation,carouselCounts,focusWorkflowTarget} from '@/lib/marketing-workflow-navigation';
import './marketing-workflow-nav.css';
type Row=Record<string,any>;
const groups=[
 {id:'content',en:'Content',ko:'콘텐츠',tabs:['contents','draft','reels','stories','trend','assets','generation']},
 {id:'calendar',en:'Calendar',ko:'캘린더',tabs:['queue','publishing']},
 {id:'performance',en:'Performance',ko:'성과',tabs:['growth','overview']},
 {id:'settings',en:'Settings',ko:'설정',tabs:['automation','connection']}
];
export function MarketingWorkflowNav({locale,activeTab,items,onNavigate}:{locale:Locale;activeTab:string;items:readonly(readonly[string,string,any])[];onNavigate:(id:any)=>void}){
 const t=(en:string,ko:string)=>tr(locale,en,ko),current=groups.find(g=>g.tabs.includes(activeTab))||groups[0];
 return <nav className="marketing-workflow-nav" aria-label={t('Instagram workspace','인스타그램 작업 메뉴')}>
  <div className="marketing-workflow-groups">{groups.map(g=><button type="button" key={g.id} aria-pressed={current.id===g.id} onClick={()=>onNavigate(g.tabs.find(id=>items.some(item=>item[0]===id))||g.tabs[0])}>{t(g.en,g.ko)}</button>)}</div>
  <div className="marketing-workflow-tools" aria-label={t(current.en,current.ko)}>{current.tabs.map(id=>{
   const item=items.find(x=>x[0]===id);if(!item)return null;const Icon=item[2];
   return <button type="button" key={id} aria-current={activeTab===id?'page':undefined} onClick={()=>onNavigate(id)}><Icon size={15} aria-hidden="true"/>{item[1]}</button>;
  })}</div>
 </nav>;
}
export function MarketingWorkflowSteps({draft,locale}:{draft:Row;locale:Locale}){
 const t=(en:string,ko:string)=>tr(locale,en,ko),next=workflowNavigation(draft),counts=carouselCounts(draft);
 const [navigationIssue,setNavigationIssue]=useState('');
 useEffect(()=>setNavigationIssue(''),[draft.id,draft.revision,next.state]);
 const finished=next.state==='published'||next.state==='scheduled';
 return <section className="marketing-workflow-steps" aria-label={t('Content to publication','콘텐츠 제작 및 게시 순서')}>
  <ol>{[['Create content','콘텐츠 만들기'],['Finish images','이미지 완성'],['Review and publish','검토 후 게시']].map(([en,ko],index)=><li key={en} aria-current={!finished&&next.phase===index?'step':undefined} data-complete={finished||next.phase!==null&&index<next.phase}><span>{index+1}</span>{t(en,ko)}</li>)}</ol>
  <div><p><strong>{t(...EDITORIAL_STATE_LABELS[next.state])}</strong>
   {counts.total>0&&<small>{counts.stories} {t('story cards','장 스토리')}{counts.brand?' + 1 '+t('Roundy card','장 라운디 소개'):''} / {t('Total','총')} {counts.total}{t(' cards','장')}</small>}
   {next.state==='running'&&<small>{t('The current request is still running. Do not start the same operation again.','현재 작업이 진행 중입니다. 같은 작업을 다시 시작하지 마세요.')}</small>}
   {next.state==='system_error'&&<small>{t('Check the latest generation log before retrying. No automatic retry or publication.','재시도 전에 생성 기록의 마지막 결과를 확인하세요. 자동 재시도나 게시는 하지 않습니다.')}</small>}
  </p>
   {next.action&&<button type="button" className="admin-secondary" onClick={()=>setNavigationIssue(focusWorkflowTarget(next.targets)?'':t('The editing section is not available for this draft. Open the draft from the content list.','이 초안의 작업 구역을 찾지 못했습니다. 콘텐츠 목록에서 초안을 다시 열어주세요.'))}>{t(...next.action)}</button>}
  </div>
  {navigationIssue&&<p role="status" className="admin-help">{navigationIssue}</p>}
 </section>;
}
export function MarketingProductionMetrics({metrics,locale}:{metrics:Row|null;locale:Locale}){
 if(!metrics)return null;const t=(en:string,ko:string)=>tr(locale,en,ko);
 return <section className="marketing-production-metrics"><h3>{t('Production health','콘텐츠 제작 상태')}</h3>
  <p>{t('Latest 100 recorded steps, grouped by content workflow. Reserved amounts are not provider invoices.','최근 작업 기록 최대 100건을 콘텐츠별로 묶었습니다. 예약액은 실제 API 청구액이 아닙니다.')}</p>
  <dl>{[['system_errors','System issues','시스템 오류'],['editorial_reviews','Copy / source review','원고 및 출처 보완'],['image_pending','Images pending','이미지 작업 대기'],['ready','Ready for approval','최종 승인 대기'],['retries','Retries','재시도']].map(([key,en,ko])=><div key={key}><dt>{t(en,ko)}</dt><dd>{Number(metrics[key]||0)}</dd></div>)}</dl>
 </section>;
}
