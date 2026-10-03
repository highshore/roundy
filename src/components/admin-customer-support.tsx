'use client';

import { Heading } from '@/components/heading';
import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Send } from 'lucide-react';
import { Instagram } from './social-icons';
import { AdminReports } from './admin-reports';
import { tr, type Locale } from '@/lib/locale';

type InboxItem={
 id:string;
 kind:'comment'|'dm';
 sender_id:string;
 sender_username:string;
 text:string;
 status:string;
 decision_reason:string;
 suggested_reply:string;
 reply_text:string;
 received_at:string;
 replied_at:string|null;
};
type Summary={instagram:number;reports:number;total:number};

async function readJson(path:string){
 const response=await fetch(path,{cache:'no-store'});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||'Could not load customer support');
 return data;
}
async function writeJson(path:string,body:unknown){
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||'Customer support action failed');
 return data;
}

export function AdminCustomerSupport({locale}:{locale:Locale}){
 const [summary,setSummary]=useState<Summary>({instagram:0,reports:0,total:0});
 const [inbox,setInbox]=useState<InboxItem[]>([]);
 const [replies,setReplies]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');

 async function load(){
  setLoading(true);setError('');
  try{
   const [summaryData,inboxData]=await Promise.all([
    readJson('/api/admin/support/summary'),
    readJson('/api/admin/support/instagram')
   ]);
   setSummary(summaryData);
   setInbox(inboxData.inbox??[]);
   setReplies(current=>{
    const next={...current};
    for(const item of inboxData.inbox??[])if(!(item.id in next))next[item.id]=item.suggested_reply||'';
    return next;
   });
  }catch(e){setError(e instanceof Error?e.message:'Could not load customer support');}
  finally{setLoading(false);}
 }

 useEffect(()=>{void load();},[]);

 async function act(fn:()=>Promise<void>){
  setBusy(true);setError('');
  try{await fn();window.dispatchEvent(new Event('roundy:admin-support-updated'));await load();}
  catch(e){setError(e instanceof Error?e.message:'Customer support action failed');}
  finally{setBusy(false);}
 }

 async function reply(item:InboxItem){
  const message=(replies[item.id]??'').trim();
  if(!message){setError(tr(locale,'Write a reply first.','답변을 먼저 입력하세요.'));return;}
  await act(async()=>{await writeJson('/api/admin/marketing/inbox/reply',{inbox_id:item.id,reply:message});});
 }
 async function dismiss(item:InboxItem){
  await act(async()=>{await writeJson('/api/admin/marketing/inbox/ignore',{inbox_id:item.id});});
 }

 return <section className="admin-panel admin-support">
  <div className="admin-heading">
   <p className="admin-kicker">Roundy Admin</p>
   <Heading level={1}>{tr(locale,'Customer Support','고객지원')}</Heading>
   <p>{tr(locale,'One place for customer messages, reports and feedback that need a human decision.','사람이 직접 확인해야 하는 고객 문의, 신고, 피드백을 한곳에서 처리하세요.')}</p>
  </div>

  <div className="admin-metrics admin-support-metrics">
   <div className="admin-metric"><span>{tr(locale,'Instagram needs review','Instagram 확인 필요')}</span><strong>{summary.instagram}</strong><Instagram size={18}/></div>
   <div className="admin-metric"><span>{tr(locale,'New reports & feedback','새 신고 및 피드백')}</span><strong>{summary.reports}</strong><CheckCircle2 size={18}/></div>
  </div>

  {error&&<p className="admin-error" role="alert">{error}</p>}

  <div className="admin-section-title">
   <Heading level={2}>{tr(locale,'Instagram inquiries','Instagram 문의')}</Heading>
   <button type="button" className="admin-secondary" disabled={busy||loading} onClick={()=>void load()}><RefreshCw size={15}/>{tr(locale,'Refresh','새로고침')}</button>
  </div>

  {loading?<p className="admin-empty">{tr(locale,'Loading customer support…','고객지원 내역을 불러오는 중입니다…')}</p>:
   <div className="support-inbox">
    {!inbox.length?<p className="admin-empty">{tr(locale,'No Instagram conversations need a human reply.','사람이 직접 답변해야 할 Instagram 문의가 없습니다.')}</p>:
     inbox.map(item=><article className="support-inbox-item" key={item.id}>
      <div className="support-inbox-head">
       <div><span className="support-channel"><Instagram size={16}/>{item.kind==='dm'?'DM':tr(locale,'Comment','댓글')}</span><strong>{item.sender_username?'@'+item.sender_username:tr(locale,'Instagram user','Instagram 사용자')}</strong></div>
       <span className="admin-status needs_review">{tr(locale,'Needs review','확인 필요')}</span>
      </div>
      <small>{new Date(item.received_at).toLocaleString(locale,{timeZone:'Asia/Seoul'})} KST · {item.decision_reason}</small>
      <p className="support-message">{item.text}</p>
      {item.reply_text&&<p className="admin-help"><strong>{tr(locale,'Automatic acknowledgement','자동 안내')}:</strong> {item.reply_text}</p>}
      <label><span>{tr(locale,'Reply','답변')}</span><textarea rows={4} maxLength={2000} value={replies[item.id]??''} onChange={e=>setReplies(current=>({...current,[item.id]:e.target.value}))} placeholder={tr(locale,'Write the response that should be sent on Instagram…','Instagram으로 보낼 답변을 입력하세요…')}/></label>
      <div className="admin-form-actions">
       <button type="button" className="admin-primary" disabled={busy||!(replies[item.id]??'').trim()} onClick={()=>void reply(item)}><Send size={16}/>{tr(locale,'Reply on Instagram','Instagram 답변')}</button>
       <button type="button" className="admin-secondary" disabled={busy} onClick={()=>void dismiss(item)}><CheckCircle2 size={16}/>{tr(locale,'Mark handled','처리 완료')}</button>
      </div>
     </article>)}
   </div>}

  <div className="admin-section-title admin-support-reports-title">
   <Heading level={2}>{tr(locale,'Reports & feedback','신고 및 피드백')}</Heading>
  </div>
  <AdminReports locale={locale} embedded/>
 </section>;
}
