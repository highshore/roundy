'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Copy, Globe, Heart, Info, Phone, Ruler, UserRound, X } from 'lucide-react';
import { LoadingScreen } from './loading-screen';
import { useToast } from './toast';
import { countries, normalizeNationality } from '@/lib/profile-options';
import { dateLabelForLocale, localizeInterest, tr, type Locale } from '@/lib/locale';

export type MatchCard = {
 id:string;full_name:string;age:number|null;nationality:string;height_cm:number|null;
 public_job:string;public_workplace:string;photos:string[];interests:string[];contact_available:boolean;
 event_id:string;event_title:string;event_starts_at:string;round_number:number|null;table_number:number|null;
};
type Contact={full_name:string;phone:string};
async function request<T>(path:string,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/'+path,{cache:'no-store',signal});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load matches.');return data;
}
function Photo({src,alt,dark=false}:{src?:string;alt:string;dark?:boolean}){
 const [failed,setFailed]=useState(false);
 return <span className={'match-photo'+(dark?' dark':'')}>{src&&!failed?<Image src={src} alt={alt} fill sizes="180px" unoptimized onError={()=>setFailed(true)}/>:<UserRound size={32} strokeWidth={1.5} aria-label={alt}/>}</span>;
}
function Encounter({match,locale}:{match:MatchCard;locale:Locale}){
 return <div className="match-encounter"><CalendarDays size={20}/><div><strong>{tr(locale,'You met on ','만난 날: ')}{dateLabelForLocale(match.event_starts_at,locale)}</strong><p>{match.event_title}{match.round_number!=null&&` | ${tr(locale,'Round','라운드')} ${match.round_number}`}{match.table_number!=null&&` | ${tr(locale,'Table','테이블')} ${String(match.table_number).padStart(2,'0')}`}</p></div></div>;
}
export function MatchesScreen({locale,ownPhoto,matchId}:{locale:Locale;ownPhoto?:string;matchId?:string}){
 const [matches,setMatches]=useState<MatchCard[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setMatches([]);
 void request<{matches:MatchCard[]}>('matches'+(matchId?'/'+encodeURIComponent(matchId):''),controller.signal).then(data=>setMatches(data.matches)).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[matchId,retry]);
 if(loading)return <LoadingScreen/>;
 if(error)return <section className="matches-empty"><Heart size={36}/><h1>{tr(locale,'Could not load your matches','매칭을 불러오지 못했어요')}</h1><p role="alert">{error}</p><button className="button" onClick={()=>setRetry(n=>n+1)}>{tr(locale,'Try again','다시 시도')}</button></section>;
 if(!matches.length)return <section className="matches-empty"><Heart size={36} strokeWidth={1.5}/><h1>{tr(locale,'No mutual matches yet','아직 서로 선택한 매칭이 없어요')}</h1><p>{tr(locale,'Your results appear when your event closes.','이벤트가 종료되면 결과를 확인할 수 있어요.')}</p></section>;
 return <MatchExperience key={matchId??'all'} matches={matches} locale={locale} ownPhoto={ownPhoto} initialProfile={Boolean(matchId)}/>;
}
export function MatchExperience({matches,locale,ownPhoto,initialProfile=false}:{matches:MatchCard[];locale:Locale;ownPhoto?:string;initialProfile?:boolean}){
 const [index,setIndex]=useState(0),[phase,setPhase]=useState<'reveal'|'profile'>(initialProfile?'profile':'reveal');
 const [photoIndex,setPhotoIndex]=useState(0),[showInfo,setShowInfo]=useState(false),[contact,setContact]=useState<Contact|null>(null),[revealing,setRevealing]=useState(false),[contactError,setContactError]=useState('');
 const {showToast}=useToast(),heading=useRef<HTMLHeadingElement>(null),contactRequest=useRef<AbortController|null>(null);
 useEffect(()=>()=>contactRequest.current?.abort(),[]);
 const match=matches[index];
 if(!match)return null;
 const name=match.full_name?.trim()||tr(locale,'Your match','매칭 상대'),shortName=name.split(/\s+/)[0];
 const nationality=normalizeNationality(match.nationality),country=nationality==='KR'?tr(locale,'Korea','한국'):countries(locale).find(c=>c.code===nationality)?.name||match.nationality;
 const work=[match.public_job,match.public_workplace].filter(Boolean).join(locale==='ko'?' / ':' at ');
 function changeMatch(next:number){contactRequest.current?.abort();setIndex(next);setPhase('reveal');setPhotoIndex(0);setShowInfo(false);setContact(null);setContactError('');setRevealing(false);heading.current?.focus();}
 function openProfile(){setPhase('profile');setShowInfo(false);requestAnimationFrame(()=>heading.current?.focus());}
 async function revealContact(){if(revealing||contact)return;const controller=new AbortController();contactRequest.current=controller;setRevealing(true);setContactError('');try{const data=await request<{contact:Contact}>('matches/'+match.id+'/contact',controller.signal);if(!controller.signal.aborted)setContact(data.contact);}catch(e){if(!controller.signal.aborted)setContactError(e instanceof Error?e.message:tr(locale,'Please try again.','다시 시도해 주세요.'));}finally{if(!controller.signal.aborted)setRevealing(false);}}
 async function copyPhone(){if(!contact)return;try{await navigator.clipboard.writeText(contact.phone);showToast(tr(locale,'Phone number copied.','전화번호를 복사했어요.'),'success');}catch{showToast(tr(locale,'Could not copy. Select the number to copy it manually.','복사하지 못했어요. 전화번호를 직접 선택해 복사해 주세요.'),'error');}}
 const reportContext=`Match ${match.id} | ${match.event_title}`.slice(0,500);
 return <section className="match-experience">
 {matches.length>1&&<nav className="match-pagination" aria-label={tr(locale,'Browse mutual matches','매칭 둘러보기')}><button className="icon-button" disabled={index===0} aria-label={tr(locale,'Previous match','이전 매칭')} onClick={()=>changeMatch(index-1)}><ArrowLeft size={20}/></button><span aria-live="polite">{tr(locale,'Mutual match','서로 선택한 매칭')} {index+1} / {matches.length}</span><button className="icon-button" disabled={index===matches.length-1} aria-label={tr(locale,'Next match','다음 매칭')} onClick={()=>changeMatch(index+1)}><ArrowRight size={20}/></button></nav>}
 {phase==='reveal'?<article className="match-reveal"><div className="match-reveal-top"><span className="match-reveal-brand">ROUNDY</span><Link href="/me/events" className="icon-button" aria-label={tr(locale,'Close match reveal','매칭 화면 닫기')}><X size={22}/></Link></div><div className="match-pair"><Photo key={ownPhoto||'you'} src={ownPhoto} alt={tr(locale,'You','나')}/><Photo key={match.id} src={match.photos?.[0]} alt={name} dark/></div><h1 ref={heading} tabIndex={-1}>{tr(locale,'You + ','나 + ')}{shortName}</h1><p className="match-reveal-message">{tr(locale,'Two yes choices.','서로의 Yes.')}<br/>{tr(locale,'One reason to keep talking.','대화를 이어 갈 이유가 생겼어요.')}</p><div className="match-reveal-bottom"><button className="button" onClick={openProfile}>{tr(locale,`See ${shortName}’s profile`,`${shortName}님의 프로필 보기`)}</button><Encounter match={match} locale={locale}/></div></article>:<article className="matched-profile"><div className="matched-profile-hero"><div className="matched-profile-actions"><button className="icon-button" aria-label={tr(locale,'Back to match reveal','매칭 화면으로 돌아가기')} onClick={()=>{setPhase('reveal');requestAnimationFrame(()=>heading.current?.focus());}}><ArrowLeft size={22}/></button><button className="icon-button" aria-label={tr(locale,'About mutual matches','매칭 안내')} aria-expanded={showInfo} onClick={()=>setShowInfo(v=>!v)}><Info size={22}/></button></div>{showInfo&&<p className="match-privacy-note">{tr(locale,'Only people who both chose Yes can see each other’s profiles and contact details after the event.','이벤트가 끝난 후 서로 Yes를 선택한 두 사람만 프로필과 연락처를 볼 수 있어요.')}</p>}<div className="matched-profile-photo"><Photo key={match.photos?.[photoIndex]||match.id} src={match.photos?.[photoIndex]} alt={name}/></div>{match.photos?.length>1&&<div className="match-photo-picker" aria-label={tr(locale,'Profile photos','프로필 사진')}>{match.photos.map((src,i)=><button key={src} onClick={()=>setPhotoIndex(i)} aria-label={tr(locale,`Show photo ${i+1}`,`사진 ${i+1} 보기`)} aria-pressed={i===photoIndex}><Photo src={src} alt=""/></button>)}</div>}<h1 ref={heading} tabIndex={-1}>{name}{match.age!=null?`, ${match.age}`:''}</h1><p className="eyebrow">{tr(locale,'MUTUAL MATCH','서로 선택한 매칭')}</p></div><div className="matched-profile-body">{work&&<h2>{work}</h2>}<div className="matched-profile-facts">{country&&<span><Globe size={20}/>{country}</span>}{match.height_cm!=null&&<span><Ruler size={20}/>{match.height_cm} cm</span>}</div>{Boolean(match.interests?.length)&&<section className="match-interests"><h3>{tr(locale,`A few things ${shortName} is into`,`${shortName}님의 관심사`)}</h3><div>{match.interests.map(interest=><span key={interest}>{localizeInterest(interest,locale)}</span>)}</div></section>}<Encounter match={match} locale={locale}/>{contact?<section className="match-contact" aria-live="polite"><p className="eyebrow"><Check size={16}/>{tr(locale,'CONTACT DETAILS','연락처')}</p><strong>{contact.full_name}</strong><a href={'tel:'+contact.phone.replace(/[^+0-9]/g,'')}><Phone size={18}/>{contact.phone}</a><button className="button" onClick={()=>void copyPhone()}><Copy size={18}/>{tr(locale,'Copy phone number','전화번호 복사')}</button></section>:<button className="button" disabled={revealing||!match.contact_available} onClick={()=>void revealContact()}>{revealing?tr(locale,'Revealing…','불러오는 중…'):match.contact_available?tr(locale,'Reveal contact details','연락처 보기'):tr(locale,'Contact details unavailable','연락처를 확인할 수 없어요')}</button>}{contactError&&<p role="alert" className="match-contact-error">{contactError}</p>}<Link className="match-report" href={'/me/safety?context='+encodeURIComponent(reportContext)}>{tr(locale,'Report a concern','문제 신고하기')}</Link></div></article>}
 </section>;
}
