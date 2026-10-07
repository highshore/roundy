'use client';
import { useCallback, useEffect, useState } from 'react';
import { tr,type Locale } from '@/lib/locale';
type Transaction={tid:string;occurred_at:string;amount:number;memo:string;state:string;review_reason:string|null};
type Receipt={order_number:string;status:string;confirm_num:string|null;last_error:string|null;nts_code:string|null};
type Data={enabled:boolean;transactionCount:number;receiptCount:number;transactions:Transaction[];receipts:Receipt[];sync:{last_success_at:string|null;last_error:string|null};orders:{order_number:string;amount:number}[]};
export function AdminPayments({locale}:{locale:Locale}) {
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[page,setPage]=useState(0),[selected,setSelected]=useState<Record<string,string>>({});
 const load=useCallback(async()=>{const r=await fetch('/api/admin/payments?page='+page);const result=await r.json();if(!r.ok)throw new Error(result.error);setData(result);},[page]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 async function action(body:Record<string,unknown>){setBusy(true);setError('');try{const r=await fetch('/api/admin/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw new Error(result.error);await load();}catch(e){setError(e instanceof Error?e.message:'Failed');}finally{setBusy(false);}}
 return <section className="admin-panel"><h1>{tr(locale,'Bank payments','입금 및 현금영수증')}</h1>
  {error&&<p className="admin-error" role="alert">{error}</p>}
  {data&&<><p>{data.enabled?tr(locale,'Automatic collection enabled','자동 조회 활성화'):tr(locale,'Setup required. Automatic payments are disabled.','설정 필요: 자동 결제가 비활성화되어 있습니다.')}</p><p>{tr(locale,'Last completed collection','마지막 조회 완료')}: {data.sync.last_success_at?new Date(data.sync.last_success_at).toLocaleString(locale==='ko'?'ko-KR':'en-GB',{timeZone:'Asia/Seoul'}):'—'}</p>{data.sync.last_error&&<p role="alert">{data.sync.last_error}</p>}
   <button className="button secondary" disabled={busy} onClick={()=>load().catch(e=>setError(e.message))}>{tr(locale,'Refresh','새로고침')}</button>
   <h2>{tr(locale,'Deposits needing review','확인 필요한 입금')} ({data.transactionCount})</h2>
   <p>{tr(locale,'Assign only after verifying the sender and reservation. Amount, bank account and deadline are still enforced. Late payments and refunds need manual support.','입금자와 예약을 확인한 뒤 연결하세요. 금액, 계좌, 입금기한 검증은 유지됩니다. 기한 경과 입금과 환불은 별도 고객지원 처리가 필요합니다.')}</p>
   {data.transactions.map(t=><article className="info-card" key={t.tid}><p><strong>₩{t.amount.toLocaleString()}</strong> / {t.memo}</p><p>{new Date(t.occurred_at).toLocaleString(locale==='ko'?'ko-KR':'en-GB',{timeZone:'Asia/Seoul'})} / {t.state}</p>{t.review_reason&&<p>{t.review_reason}</p>}
    <label className="field"><span>{tr(locale,'Reservation to confirm','확정할 예약')}</span><select value={selected[t.tid]??''} onChange={e=>setSelected({...selected,[t.tid]:e.target.value})}><option value="">{tr(locale,'Choose verified order','확인한 주문 선택')}</option>{data.orders.filter(o=>o.amount===t.amount).map(o=><option key={o.order_number} value={o.order_number}>{o.order_number}</option>)}</select></label>
    <button className="button" disabled={busy||!selected[t.tid]} onClick={()=>void action({action:'match',tid:t.tid,orderNumber:selected[t.tid]})}>{tr(locale,'Confirm this reservation','이 예약 입금 확정')}</button>{' '}
    <button className="button secondary" disabled={busy} onClick={()=>void action({action:'ignore',tid:t.tid})}>{tr(locale,'Unrelated deposit','관련 없는 입금')}</button>
   </article>)}
   <h2>{tr(locale,'Cash receipts','현금영수증')} ({data.receiptCount})</h2>
   {data.receipts.map(r=><article className="info-card" key={r.order_number}><p style={{overflowWrap:'anywhere'}}>{r.order_number}</p><p>{r.status} / {r.confirm_num??'—'} / {r.nts_code??'—'}</p>{r.last_error&&<p>{r.last_error}</p>}{r.status==='review'&&<button className="button secondary" disabled={busy} onClick={()=>void action({action:'retry-receipt',orderNumber:r.order_number})}>{tr(locale,'Recheck same receipt','기존 영수증 재확인')}</button>}</article>)}
   <button className="button secondary" disabled={page===0} onClick={()=>setPage(page-1)}>{tr(locale,'Previous','이전')}</button>{' '}<span>{page+1}</span>{' '}<button className="button secondary" disabled={(page+1)*30>=Math.max(data.transactionCount,data.receiptCount)} onClick={()=>setPage(page+1)}>{tr(locale,'Next','다음')}</button>
  </>}
 </section>;
}
