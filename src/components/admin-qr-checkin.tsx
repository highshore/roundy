'use client';

import { useEffect,useState } from 'react';
import Link from 'next/link';
import { CheckCircle2,UserCheck } from 'lucide-react';
import { LoadingScreen } from '@/components/loading-screen';
import { useToast } from '@/components/toast';
import { tr,type Locale } from '@/lib/locale';

type Result={event_id:string;event_slug:string;event_title:string;full_name:string;gender:string;checked_in_at:string;already_checked_in:boolean};

export function AdminQrCheckIn({token,locale}:{token:string;locale:Locale}){
 const [result,setResult]=useState<Result|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const {showToast}=useToast();

 useEffect(()=>{
  let active=true;
  void fetch('/api/admin/check-in',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({token})
  }).then(async r=>{
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||'Check-in failed.');
   if(!active)return;
   setResult(d.checkIn as Result);
   showToast(d.checkIn?.already_checked_in?tr(locale,'Already checked in.','이미 체크인된 참가자입니다.'):tr(locale,'QR check-in complete.','QR 체크인이 완료되었습니다.'),'success');
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Check-in failed.');}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[token,locale,showToast]);

 if(loading)return <LoadingScreen/>;

 if(error)return <section className="qr-checkin-result"><UserCheck size={34}/><p className="eyebrow">{tr(locale,'CHECK-IN','체크인')}</p><h1>{tr(locale,'Could not check in','체크인할 수 없어요')}</h1><p>{error}</p><Link className="button secondary" href="/admin">{tr(locale,'Back to Event Management','이벤트 관리로 돌아가기')}</Link></section>;

 if(!result)return null;

 return <section className="qr-checkin-result success">
  <CheckCircle2 size={46}/>
  <p className="eyebrow">{result.already_checked_in?tr(locale,'ALREADY CHECKED IN','이미 체크인됨'):tr(locale,'CHECK-IN COMPLETE','체크인 완료')}</p>
  <h1>{result.full_name}</h1>
  <p>{result.event_title}</p>
  <span>{result.gender==='female'?tr(locale,'Woman','여성'):result.gender==='male'?tr(locale,'Man','남성'):''}</span>
  <Link className="button" href={'/admin/events/'+encodeURIComponent(result.event_id)}>{tr(locale,'Back to Meetup Control','밋업 컨트롤로 돌아가기')}</Link>
 </section>;
}
