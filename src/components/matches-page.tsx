'use client';

import { Check,Copy,UserRound } from 'lucide-react';
import { tr,type Locale } from '@/lib/locale';
import { useToast } from '@/components/toast';

export type MatchProfile={
 id:string;
 event_id:string;
 event_title:string;
 event_slug:string;
 created_at:string;
 full_name:string;
 age:number;
 nationality:string;
 height_cm:number|null;
 job_title:string;
 workplace:string;
 phone:string;
 interests:string[];
 photos:string[];
 verified:boolean;
 met_table:number|null;
 met_round:number|null;
};

export function MatchesPage({matches,locale}:{matches:MatchProfile[];locale:Locale}){
 const {showToast}=useToast();

 async function copyPhone(phone:string){
  try{
   await navigator.clipboard.writeText(phone);
   showToast(tr(locale,'Phone number copied.','전화번호를 복사했어요.'),'success');
  }catch{
   showToast(tr(locale,'Could not copy the phone number.','전화번호를 복사하지 못했어요.'),'error');
  }
 }

 return <div className="matches-page">
  <header className="subpage-heading">
   <p className="eyebrow">{tr(locale,'MATCHES','매칭')}</p>
   <h1>{tr(locale,'People who chose you too','서로 선택한 사람들')}</h1>
   <p>{tr(locale,'Full profiles and contact details are visible only after a mutual Yes.','서로 Yes를 선택한 뒤에만 전체 프로필과 연락처가 공개됩니다.')}</p>
  </header>
  {!matches.length?<section className="empty"><UserRound size={32}/><h2>{tr(locale,'No mutual matches yet.','아직 서로 선택한 매칭이 없어요.')}</h2><p>{tr(locale,'Your results appear after the meetup is finished.','밋업이 종료되면 결과가 여기에 표시됩니다.')}</p></section>:<div className="match-profile-list">
   {matches.map(match=>{
    const photos=Array.isArray(match.photos)?match.photos:[];
    const interests=Array.isArray(match.interests)?match.interests:[];
    return <article className="match-profile-card" key={match.id}>
     <div className="match-profile-hero">
      <span className="match-profile-photo" style={photos[0]?{backgroundImage:`url("${photos[0]}")`}:undefined}>{!photos[0]&&<UserRound size={44}/>}</span>
      {match.met_table&&<span className="match-met-pill">{tr(locale,'MET AT TABLE ','테이블에서 만남 ')}{String(match.met_table).padStart(2,'0')}</span>}
     </div>
     <div className="match-profile-body">
      <div className="match-profile-title">
       <div>
        <h2>{match.full_name||tr(locale,'A new connection','새로운 인연')}{match.age?`, ${match.age}`:''}</h2>
        {(match.job_title||match.workplace)&&<p>{[match.job_title,match.workplace].filter(Boolean).join(' · ')}</p>}
       </div>
       {match.verified&&<span className="verification-tag verified"><Check size={13}/>{tr(locale,'Verified','인증 완료')}</span>}
      </div>
      {interests.length>0&&<div className="match-interest-chips">{interests.slice(0,8).map((interest,index)=><span key={interest+index}>{interest}</span>)}</div>}
      <section className="match-profile-details">
       <p className="eyebrow">{tr(locale,'PROFILE DETAILS','프로필 상세')}</p>
       <strong>{[match.height_cm?match.height_cm+' cm':'',match.nationality].filter(Boolean).join(' · ')}</strong>
       {interests.length>0&&<span>{interests.join(' · ')}</span>}
      </section>
      <section className="match-contact-card">
       <div>
        <p className="eyebrow">{tr(locale,'CONTACT UNLOCKED','연락처 공개')}</p>
        <b>{tr(locale,'Visible because you matched.','서로 매칭되어 공개된 연락처입니다.')}</b>
        <span>{match.event_title}</span>
       </div>
       {match.phone&&<button type="button" onClick={()=>void copyPhone(match.phone)}><Copy size={20}/><span>{match.phone}</span></button>}
      </section>
     </div>
    </article>;
   })}
  </div>}
 </div>;
}
