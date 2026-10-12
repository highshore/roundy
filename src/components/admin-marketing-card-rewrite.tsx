'use client';
import {useEffect,useRef,useState} from 'react';
import {tr,type Locale} from '@/lib/locale';
type Row=Record<string,any>;
type Props={draft:Row;index:number;locale:Locale;disabled:boolean;onCreated:(draft:Row)=>void;onWorkingChange?:(working:boolean)=>void};
// One-card entry to the existing immutable version API; no selection grids,
// automatic generation, photo approval or publishing side effects.
export function AdminMarketingCardRewrite({draft,index,locale,disabled,onCreated,onWorkingChange}:Props){
 const t=(en:string,ko:string)=>tr(locale,en,ko),[instruction,setInstruction]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false),lock=useRef(false);
 useEffect(()=>{onWorkingChange?.(working);return()=>onWorkingChange?.(false);},[working,onWorkingChange]);
 const slide=draft.carousel_slides?.[index];
 async function submit(){
  if(lock.current||disabled||!slide||slide.role==='brand_outro')return;
  if(!instruction.trim()){setError(t('Describe the change for this card.','이 카드에서 바꿀 내용을 입력하세요.'));return;}
  if(!window.confirm(t('Rewrite only this card? AI reservation: $0.02. The original stays intact and nothing is published.','이 카드만 AI로 재작성할까요? AI 예약액은 $0.02입니다. 원본은 보존하며 게시하지 않습니다.')))return;
  lock.current=true;setWorking(true);setError('');
  try{
   const response=await fetch('/api/admin/marketing/draft/'+draft.id+'/versions',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_key:'rework:'+crypto.randomUUID(),revision:draft.revision,mode:'text',scope:'slides',slide_indices:[index],instruction:instruction.trim(),image_source:'online',confirm_cost:true})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||result.error||!result.draft?.id)throw new Error(String(result.error||'REWRITE_FAILED'));
   onCreated(result.draft);
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{lock.current=false;setWorking(false);}
 }
 return <div className="marketing-inline-rewrite"><label>{t('What should change on this card?','이 카드에서 바꿀 점')}<textarea rows={4} maxLength={500} value={instruction} disabled={disabled||working} placeholder={t('For example: replace the abstract advice with a short dialogue.','예: 추상적인 조언 대신 짧은 대화 예시로 바꿔줘.')} onChange={e=>setInstruction(e.target.value)}/></label><small>{t('This card only · text rewrite · $0.02 AI reservation','이 카드만 변경 · 텍스트 재작성 · AI 예약액 $0.02')}</small>{error&&<p role="alert" className="admin-error">{error}</p>}<button type="button" className="admin-primary" disabled={disabled||working||!instruction.trim()} onClick={()=>void submit()}>{working?t('Rewriting…','재작성 중…'):t('Rewrite this card','이 카드 재작성')}</button></div>;
}
