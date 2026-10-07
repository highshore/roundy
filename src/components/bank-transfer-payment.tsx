'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { tr, type Locale } from '@/lib/locale';
export type BankPayment = {orderNumber:string;amount:number;status:string;completed:boolean;bankName:string;account_number:string;account_holder:string;match_code:string;expires_at:string;receipt_kind:string;identity_hint:string;receipt:{status:string;confirm_num:string|null;trade_date:string|null}|null};
export function BankTransferPayment({orderNumber,locale}:{orderNumber:string;locale:Locale}) {
 const [payment,setPayment]=useState<BankPayment|null>(null), [error,setError]=useState(''), [copied,setCopied]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  setBusy(true);
  try {const r=await fetch('/api/bank-transfer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'status',orderNumber})});const data=await r.json();if(!r.ok)throw new Error(data.error);setPayment(data);setError('');}
  catch(e){setError(e instanceof Error?e.message:'Could not check payment');}finally{setBusy(false);}
 },[orderNumber]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{
  if(!payment || payment.status!=='charging')return;
  let remaining=40;
  const timer=window.setInterval(()=>{if(--remaining<0){window.clearInterval(timer);return;}if(document.visibilityState==='visible')void refresh();},15000);
  return()=>window.clearInterval(timer);
 },[payment?.status,refresh]);
 async function copy(value:string){try{await navigator.clipboard.writeText(value);setCopied(value);}catch{setError(tr(locale,'Please copy the value manually.','직접 복사해 주세요.'));}}
 return <section className="info-card bank-payment">
  <h2>{payment?.completed?tr(locale,'Participation confirmed','참가가 확정되었어요'):tr(locale,'Pay by bank transfer','국민은행 계좌이체')}</h2>
  {error&&<p role="alert">{error}</p>}
  {!payment&&!error&&<p>{tr(locale,'Loading payment…','결제 정보를 불러오고 있어요…')}</p>}
  {payment&&<>
   <p style={{overflowWrap:'anywhere'}}>{tr(locale,'Order reference','주문번호')}: {payment.orderNumber}</p>
   {payment.completed?<><p>{tr(locale,'Your deposit has been confirmed.','입금이 확인되었습니다.')}</p><Link className="button" href="/me/events">{tr(locale,'My events','내 모임')}</Link></>:
    payment.status==='charging'?<>
     <p>{tr(locale,'Send the exact amount and use the code below as the recipient account memo. Confirmation can take around 5–10 minutes or longer during bank maintenance.','아래 금액을 입금하고, 받는 통장 표시내용을 입금코드로 변경해 주세요. 확인에 약 5~10분이 걸리며 은행 점검 중에는 더 늦어질 수 있어요.')}</p>
     <dl><dt>{payment.bankName} / {payment.account_holder}</dt><dd><strong>{payment.account_number}</strong> <button type="button" onClick={()=>void copy(payment.account_number)}>{copied===payment.account_number?tr(locale,'Copied','복사됨'):tr(locale,'Copy','복사')}</button></dd>
     <dt>{tr(locale,'Amount','입금액')}</dt><dd><strong>₩{payment.amount.toLocaleString()}</strong></dd>
     <dt>{tr(locale,'Recipient account memo','받는 통장 표시내용')}</dt><dd><strong>{payment.match_code}</strong> <button type="button" onClick={()=>void copy(payment.match_code)}>{copied===payment.match_code?tr(locale,'Copied','복사됨'):tr(locale,'Copy','복사')}</button></dd>
     <dt>{tr(locale,'Transfer deadline (KST)','입금기한 (한국 시간)')}</dt><dd>{new Date(payment.expires_at).toLocaleString(locale==='ko'?'ko-KR':'en-GB',{timeZone:'Asia/Seoul'})}</dd></dl>
     {Date.now()>Date.parse(payment.expires_at)&&<p role="alert">{tr(locale,'The transfer deadline has passed. Do not send another transfer; contact support if you have already paid.','입금기한이 지났습니다. 추가 입금하지 마세요. 이미 입금했다면 고객지원에 문의해 주세요.')}</p>}
     <p>{tr(locale,'Already transferred? Wait for confirmation instead of paying again. A wrong memo or amount needs support review.','이미 입금했다면 다시 보내지 말고 확인을 기다려 주세요. 입금코드나 금액이 다르면 고객지원에서 확인합니다.')}</p>
    </>:<p>{tr(locale,'This payment request is closed. If you already transferred, contact support before trying again.','종료된 입금 요청입니다. 이미 입금했다면 다시 결제하기 전에 고객지원에 문의해 주세요.')}</p>}
   <p>{tr(locale,'Cash receipt','현금영수증')}: {payment.identity_hint} — {payment.amount===0?tr(locale,'No receipt for a free reservation','무료 예약은 발급 대상이 아닙니다'):payment.receipt?.status==='reported'?tr(locale,'Reported to NTS','국세청 전송 완료'):payment.receipt?.status==='issued'?tr(locale,'Issued, NTS processing','발급 완료, 국세청 처리 중'):payment.receipt?.status==='review'?tr(locale,'Support review needed','관리자 확인 중'):payment.completed?tr(locale,'Preparing receipt','발급 준비 중'):tr(locale,'Issued after deposit confirmation','입금 확인 후 발급')}</p>
   {payment.receipt?.confirm_num&&<p>{tr(locale,'Approval number','승인번호')}: {payment.receipt.confirm_num}</p>}
   <button className="button secondary" disabled={busy} onClick={()=>void refresh()}>{tr(locale,'Refresh payment status','입금 상태 새로고침')}</button>
  </>}
 </section>;
}
