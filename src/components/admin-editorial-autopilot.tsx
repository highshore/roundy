'use client';
import {useState} from 'react';
import {Clock3,ChevronDown,Search,Sparkles,ShieldCheck} from 'lucide-react';
import {tr,type Locale} from '@/lib/locale';
import './admin-editorial-autopilot.css';
export type AutopilotControl={enabled:boolean;scan_hour_kst:number;reserved_per_scan_usd:number;max_sources_per_scan:number;min_editorial_priority:number};
export type AutopilotScan={id:string;status:'running'|'completed'|'failed'|'uncertain';stage:string;candidate_count:number;created_at:string;error_code:string|null;error_message:string|null};
export function AdminEditorialAutopilot({locale,control,scans,busy,onControl,onScan}:{
 locale:Locale;control:AutopilotControl|undefined;scans:AutopilotScan[]|undefined;busy:boolean;
 onControl:(enabled:boolean,hour?:number)=>void;onScan:()=>void;
}){
 const t=(en:string,ko:string)=>tr(locale,en,ko),[history,setHistory]=useState(false),latest=scans?.[0];
 return <section className="editorial-autopilot" aria-label={t('Editorial automation','에디토리얼 자동화')}>
  <div className="editorial-autopilot-main"><div className="editorial-autopilot-intro">
   <span className="editorial-autopilot-eyebrow"><Sparkles size={15}/>{t('AUTOMATED SOURCE-TO-STORY','소재부터 기획까지 자동화')}</span>
   <h2>{t('Discover the next great story. Automatically.','독자가 반응할 소재를 자동으로 찾습니다.')}</h2>
   <p>{t('Daily research finds public dating discussions and Seoul guides, checks sources and duplicates, and drafts original hooks plus a carousel storyboard. An editor approves the story before production.','매일 공개 연애 의견과 서울 데이트 정보를 검색하고 출처와 중복을 검증한 후 후크와 캐러셀 기획안을 만듭니다. 사람이 스토리를 승인한 후에만 제작합니다.')}</p>
  </div><div className="editorial-autopilot-actions">
   <label className="editorial-autopilot-toggle"><input type="checkbox" checked={Boolean(control?.enabled)} disabled={busy||!control} onChange={e=>onControl(e.target.checked)}/>{control?.enabled?t('Automation on','자동 수집 켜짐'):t('Paused','자동 수집 중지')}</label>
   <button type="button" className="editorial-autopilot-scan" disabled={busy||!control} onClick={onScan}><Search size={16}/>{busy?t('Working…','실행 중…'):t('Discover now','지금 소재 찾기')}</button>
  </div></div>
  <div className="editorial-autopilot-bottom">
   <label className="editorial-autopilot-hour"><Clock3 size={15}/>{t('Research time (KST)','자동 검색 시간 (KST)')}
    <select disabled={busy||!control} value={control?.scan_hour_kst??8} onChange={e=>onControl(Boolean(control?.enabled),Number(e.target.value))}>{Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')}:20</option>)}</select>
   </label>
   <span>{t('Reserved budget/scan: ','검색 1회 예산 예약: ')}{'$'+Number(control?.reserved_per_scan_usd??0.12).toFixed(2)}</span>
   <button type="button" className="editorial-autopilot-history-toggle" aria-expanded={history} onClick={()=>setHistory(v=>!v)}>{latest?t('Last scan: ','최근 검색: ')+latest.status:t('No scans yet','검색 이력 없음')}<ChevronDown size={15}/></button>
  </div>
  {history&&<div className="editorial-autopilot-history">{(scans||[]).map(s=><div key={s.id}>
   <span>{new Date(s.created_at).toLocaleString(locale==='ko'?'ko-KR':'en-US',{timeZone:'Asia/Seoul'})}</span>
   <strong>{s.status==='completed'?t('Completed','완료'):s.status==='running'?t('Running','진행 중'):s.status==='uncertain'?t('Reconciliation needed','결과 확인 필요'):t('Failed','실패')}</strong>
   <span>{s.status==='completed'?t('Ideas: ','기획안: ')+String(s.candidate_count):s.error_code||s.stage}</span>
  </div>)}{!scans?.length&&<p>{t('No research runs recorded.','저장된 검색 이력이 없습니다.')}</p>}</div>}
  <p className="editorial-autopilot-disclaimer"><ShieldCheck size={15}/>{t('Only discovery is scheduled; posting frequency is entirely up to you. Creator media is not reused, and unobserved engagement metrics are never invented.','검색만 정해진 시간에 실행됩니다. 게시 일정은 직접 관리하며 외부 이미지를 무단 재사용하거나 확인되지 않은 반응 수치를 만들어내지 않습니다.')}</p>
 </section>;
}
