'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Clock3,ExternalLink,Image as ImageIcon,RefreshCw,Search,ShieldCheck,ShieldX} from 'lucide-react';
import {tr,type Locale} from '@/lib/locale';

type Asset=Record<string,any>;
type Filter='all'|'approved'|'pending'|'rejected';
type PhotoResponse={assets:Asset[];counts:Record<string,number>;limit:number};
const BASE='/api/admin/marketing';
const statusText:Record<Filter,[string,string]>={
 all:['All photos','전체'],approved:['Approved','승인 완료'],
 pending:['Needs review','검수 대기'],rejected:['Rejected','거절됨']
};
export function AdminMarketingAssets({locale,onOpenDraft}:{
 locale:Locale;onOpenDraft?:(id:string)=>void
}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const [assets,setAssets]=useState<Asset[]>([]),[counts,setCounts]=useState<Record<string,number>>({}),[attempts,setAttempts]=useState<Asset[]>([]);
 const [filter,setFilter]=useState<Filter>('all'),[query,setQuery]=useState('');
 const [loading,setLoading]=useState(true),[busyId,setBusyId]=useState('');
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  const response=await fetch(BASE+'/photos/assets',{cache:'no-store'});
  const result=await response.json().catch(()=>({error:'PHOTO_LIBRARY_UNAVAILABLE'}));
  if(!response.ok)throw new Error(result.error||'PHOTO_LIBRARY_UNAVAILABLE');
  const data=result as PhotoResponse;
  setAssets(Array.isArray(data.assets)?data.assets:[]);
  setCounts(data.counts||{});
  const log=await fetch(BASE+'/photos/attempts',{cache:'no-store'});
  if(log.ok){const payload=await log.json();setAttempts(Array.isArray(payload.attempts)?payload.attempts:[]);}
 },[]);
 useEffect(()=>{let active=true;load().catch(e=>{if(active)setError(e instanceof Error?e.message:'PHOTO_LIBRARY_UNAVAILABLE');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[load]);
 const visible=useMemo(()=>assets.filter(asset=>{
  if(filter!=='all'&&asset.review_status!==filter)return false;
  const keyword=query.toLowerCase().trim();
  if(!keyword)return true;
  return [asset.photographer,asset.topic_key,asset.provider_photo_id,
   asset.review_note,asset.review_status].some(value=>String(value||'').toLowerCase().includes(keyword));
 }),[assets,filter,query]);
 async function review(asset:Asset,status:'approved'|'rejected'){
  const question=status==='approved'
   ?t('Have you personally checked the original source, license, people, trademarks and brand endorsement risks for this image? Approval archives the actual image.','해당 사진의 원본 출처, 상업적 수정 권한, 라이선스, 인물, 상표 및 브랜드 오인 위험를 직접 확인했습니까? 승인하면 원본을 보관합니다.')
   :t('Reject this image? Approved photos already used in scheduled or published posts cannot be revoked.','이 사진을 거절할까요? 예약되었거나 발행된 게시물에 사용된 승인 사진은 철회할 수 없습니다.');
  if(!window.confirm(question))return;
  const note=window.prompt(t('Review note (optional)','검수 메모 (선택)'),'');
  if(note===null)return;
  setBusyId(asset.id);setError('');setNotice('');
  try{
   const response=await fetch(BASE+'/photos/'+asset.id+'/review',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status,confirm_rights_reviewed:true,note:note.trim().slice(0,500)})
   });
   const result=await response.json().catch(()=>({error:'PHOTO_REVIEW_FAILED'}));
   if(!response.ok)throw new Error(result.error||'PHOTO_REVIEW_FAILED');
   await load();
   setNotice(status==='approved'
    ?t('Photo approved and archived for reuse.','사진이 승인되어 재사용 자산으로 보관됐습니다.')
    :t('Photo marked rejected.','사진을 거절 상태로 변경했습니다.'));
  }catch(e){setError(e instanceof Error?e.message:'PHOTO_REVIEW_FAILED');}
  finally{setBusyId('');}
 }
 return <section className="marketing-workspace-section" aria-label={t('Photo asset library','사진 자산 라이브러리')}>
  <div className="marketing-workspace-section-head">
   <div><p className="admin-kicker">ASSET LIBRARY</p>
    <h2>{t('Photo library','사진 자산 라이브러리')}</h2>
    <p>{t('One licensed photo library. Review source, commercial editing rights and talent / trademark risks before reusing an approved asset.',
     'Pexels, Unsplash, Pixabay, Commons, Openverse에서 찾은 사진을 검수하며 승인 자산만 재사용합니다.')}</p>
   </div>
   <button type="button" className="admin-secondary" disabled={loading||!!busyId}
    onClick={()=>{setError('');void load().catch(e=>setError(String(e)));}}>
    <RefreshCw size={15}/>{t('Refresh','새로고침')}
   </button>
  </div>
  <div className="marketing-workspace-panel marketing-assets-workspace">
   <div className="marketing-assets-toolbar">
    <div className="marketing-asset-filters" role="group" aria-label={t('Filter photo review status','사진 검수 상태 필터')}>
     {(['all','approved','pending','rejected'] as const).map(s=>
      <button type="button" key={s} aria-pressed={filter===s} onClick={()=>setFilter(s)}>
       {t(...statusText[s])}<small>{counts[s]??0}</small>
      </button>)}
    </div>
    <label className="marketing-asset-search"><Search size={16} aria-hidden="true"/>
     <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
      placeholder={t('Search topics or photographers','주제 또는 사진가 검색')}
      aria-label={t('Search photo assets','사진 자산 검색')}/>
    </label>
   </div>
   {error&&<p role="alert" className="admin-error">{error==='PHOTO_USED_BY_SCHEDULED_OR_PUBLISHED_POST'
    ?t('This photo is in an approved/scheduled/published post and cannot be revoked.','이 사진은 이미 승인, 예약 또는 발행한 게시물에 사용돼 철회할 수 없습니다.'):error}</p>}
   {notice&&<p role="status" className="marketing-workspace-feedback">{notice}</p>}
   {loading?<p className="marketing-workspace-muted" role="status">{t('Loading photo assets…','사진 자산 불러오는 중…')}</p>
    :visible.length===0?<div className="marketing-asset-empty"><ImageIcon size={28}/>
      <strong>{filter==='approved'?t('No approved photos yet','아직 승인된 사진이 없습니다')
       :t('No matching photos','일치하는 사진이 없습니다')}</strong>
      <p>{t('Generate a licensed-photo draft to discover assets across providers. No new photo can be used before approval.',
       '콘텐츠 생성 시 여러 제공자의 사진을 가져옵니다. 신규 자산은 관리자 승인 전 사용하지 않습니다.')}</p>
     </div>:
    <div className="marketing-asset-grid">{visible.map(asset=><article key={asset.id} className="marketing-asset-card">
      <div className="marketing-asset-photo">
       {asset.preview_url?<img loading="lazy" src={asset.preview_url} alt={String(asset.provider||'Photo')+' photo by '+asset.photographer}/>:<ImageIcon/>}
       <span className={'marketing-workspace-pill marketing-workspace-pill-'+asset.review_status}>
        {asset.review_status==='approved'?<CheckCircle2 size={13}/>:asset.review_status==='pending'?<Clock3 size={13}/>:<ShieldX size={13}/>}
        {t(...(statusText[asset.review_status as Filter]||statusText.pending))}
       </span>
      </div>
      <div className="marketing-asset-info">
       <strong>{asset.photographer||asset.provider||'Unknown'} <span className="marketing-workspace-muted">#{asset.provider_photo_id}</span></strong>
       <p>{String(asset.provider||'').toUpperCase()} · {String(asset.topic_key||'').replaceAll('_',' ')} · {t('Used in','연결 초안')} {Number(asset.used_by_count)||0}</p>
       <p><strong>{asset.license_name||t('License not verified','라이선스 확인 불가')}</strong> · {asset.commercial_use_allowed?t('Commercial use permitted','상업 이용 허용'):t('Commercial use blocked','상업 이용 차단')} · {asset.modifications_allowed?t('Editing permitted','편집 허용'):t('Editing blocked','편집 차단')} · {asset.attribution_required?t('Credit required','출처 표기 필수'):t('Credit not required','출처 표기 의무 없음')}</p>
       <p className="marketing-workspace-muted">{t('Person / trademark / endorsement review required','인물 초상권, 상표 및 홍보 오인 위험은 별도 검수 필요')}</p>
       <div className="marketing-asset-links">
        {asset.source_url&&<a href={asset.source_url} target="_blank" rel="noopener noreferrer">
          {t('Original','원본')}<ExternalLink size={13}/></a>}
        {asset.license_url&&<a href={asset.license_url} target="_blank" rel="noopener noreferrer">
          {t('License','라이선스')}<ExternalLink size={13}/></a>}
        {asset.license_evidence_url&&<a href={asset.license_evidence_url} target="_blank" rel="noopener noreferrer">
          {t('Source evidence','출처 검증')}<ExternalLink size={13}/></a>}
       </div>
       {asset.reviewed_at&&<p className="marketing-asset-reviewer">
        <ShieldCheck size={14}/>{t('Reviewed','검수')} {new Date(asset.reviewed_at).toLocaleDateString(locale,{timeZone:'Asia/Seoul'})} KST
       </p>}
       {asset.review_note&&<p className="marketing-asset-note">{asset.review_note}</p>}
       {(asset.used_by_drafts||[]).length>0&&<details className="marketing-asset-usage">
        <summary>{t('Linked drafts','연결된 초안')} ({asset.used_by_drafts.length})</summary>
        <div>{asset.used_by_drafts.slice(0,6).map((entry:Asset)=>
         <button type="button" key={entry.draft_id} disabled={!onOpenDraft}
          onClick={()=>onOpenDraft?.(entry.draft_id)}>
          {String(entry.draft_id).slice(0,8)}… / {t('Card','카드')} {Number(entry.slot)+1}
         </button>)}</div>
       </details>}
       <div className="marketing-asset-actions">
        {asset.review_status==='pending'&&<>
         <button className="admin-primary" disabled={!!busyId} onClick={()=>void review(asset,'approved')}>{t('Approve photo','사진 승인')}</button>
         <button className="admin-secondary" disabled={!!busyId} onClick={()=>void review(asset,'rejected')}>{t('Reject','거절')}</button>
        </>}
        {asset.review_status==='approved'&&<button className="admin-secondary" disabled={!!busyId}
         onClick={()=>void review(asset,'rejected')}>{t('Revoke approval','승인 철회')}</button>}
        {asset.review_status==='rejected'&&<p className="marketing-workspace-muted">
         {t('Rejected images cannot be used in new cards.','거절된 사진은 신규 카드에 사용되지 않습니다.')}</p>}
       </div>
      </div>
     </article>)}</div>}
   <details className="marketing-asset-usage">
    <summary>{t('Photo search diagnostics','이미지 검색 제공자별 기록')} ({attempts.length})</summary>
    <div>{attempts.length===0?<p className="marketing-workspace-muted">{t('No provider attempts recorded','검색 기록 없음')}</p>:attempts.slice(0,40).map(entry=>
      <p key={entry.id}>{new Date(entry.created_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} · <strong>{entry.provider}</strong> · {entry.status} · {entry.error_code||t('No error','오류 없음')} · {entry.result_count} {t('candidates','건')} — {entry.search_query}</p>
    )}</div>
   </details>
   <p className="marketing-workspace-footnote">{t('Showing the latest 200 library records. Reuse rules and the existing approval safeguards are unchanged.',
    '최근 사진 자산 최대 200개를 표시합니다. 기존 재사용 제한 및 승인 안전 규칙은 그대로 적용됩니다.')}</p>
  </div>
 </section>;
}
