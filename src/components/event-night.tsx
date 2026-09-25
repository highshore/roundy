'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Clock3, MapPin, UsersRound } from 'lucide-react';
import { LoadingScreen } from '@/components/loading-screen';
import { dateLabelForLocale, timeLabelForLocale, tr, type Locale } from '@/lib/locale';
import type { Event } from '@/lib/data';

type Choice='no'|'maybe'|'yes';
type Encounter={id:string;round:number;table:number;choice:Choice|null;photo:string|null;next_table?:number|null};
type NightState={
 event_id:string;
 checked_in_at:string|null;
 state:'waiting'|'ready'|'live'|'final_choices'|'finished';
 total_rounds:number;
 current_round:number;
 round_duration_seconds:number;
 round_started_at:string|null;
 starting_table:number|null;
 current:Encounter|null;
 encounters:Encounter[];
 yes_count:number;
 maybe_count:number;
 no_count:number;
 submitted:boolean;
 matches:number;
};

async function request(eventId:string,body?:unknown){
 const r=await fetch('/api/event-night/'+eventId,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const d=await r.json();
 if(!r.ok)throw new Error(d.error||'Could not load meetup mode.');
 return d;
}
function clock(value:number){const seconds=Math.max(0,value);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
function ChoiceButtons({value,disabled,onChange,locale}:{value:Choice|null;disabled:boolean;onChange:(choice:Choice)=>void;locale:Locale}){
 return <div className="event-night-choices">{(['no','maybe','yes'] as Choice[]).map(choice=><button type="button" key={choice} className={value===choice?'selected':''} aria-pressed={value===choice} disabled={disabled} onClick={()=>onChange(choice)}>{choice==='no'?tr(locale,'NO','아니요'):choice==='maybe'?tr(locale,'MAYBE','고민 중'):tr(locale,'YES','좋아요')}</button>)}</div>;
}

export function EventNight({event,locale}:{event:Event;locale:Locale}){
 const [state,setState]=useState<NightState|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [now,setNow]=useState(Date.now());

 async function load(silent=false){
  if(!silent)setLoading(true);
  try{const d=await request(event.id);setState(d.state as NightState);setError('');}
  catch(e){setError(e instanceof Error?e.message:'Could not load meetup mode.');}
  finally{if(!silent)setLoading(false);}
 }

 useEffect(()=>{void load();const poll=window.setInterval(()=>void load(true),5000);return()=>window.clearInterval(poll);},[event.id]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);

 const secondsLeft=useMemo(()=>{
  if(!state?.round_started_at)return state?.round_duration_seconds??900;
  return Math.max(0,(state.round_duration_seconds??900)-Math.floor((now-Date.parse(state.round_started_at))/1000));
 },[state?.round_started_at,state?.round_duration_seconds,now]);

 async function choose(encounterId:string,choice:Choice){
  if(!state||busy||state.submitted)return;
  setBusy(true);setError('');
  try{
   await request(event.id,{action:'choice',encounterId,choice});
   setState(prev=>prev?{
    ...prev,
    current:prev.current?.id===encounterId?{...prev.current,choice}:prev.current,
    encounters:prev.encounters.map(item=>item.id===encounterId?{...item,choice}:item),
    yes_count:prev.encounters.filter(item=>(item.id===encounterId?choice:item.choice)==='yes').length,
    maybe_count:prev.encounters.filter(item=>(item.id===encounterId?choice:item.choice)==='maybe').length,
    no_count:prev.encounters.filter(item=>(item.id===encounterId?choice:item.choice)==='no').length
   }:prev);
  }catch(e){setError(e instanceof Error?e.message:'Could not save your choice.');}
  finally{setBusy(false);}
 }

 async function submit(){
  setBusy(true);setError('');
  try{await request(event.id,{action:'submit'});await load(true);}
  catch(e){setError(e instanceof Error?e.message:'Could not submit your choices.');}
  finally{setBusy(false);}
 }

 if(loading)return <LoadingScreen/>;
 if(error&&!state)return <section className="event-night-shell"><p role="alert" className="admin-error">{error}</p><Link className="button secondary" href="/me/events">{tr(locale,'Back to My Events','내 이벤트로 돌아가기')}</Link></section>;
 if(!state)return null;

 const mapUrl='https://map.naver.com/v5/search/'+encodeURIComponent(event.venue||event.address);

 if(!state.checked_in_at){
  return <section className="event-night-shell">
   <div className="event-night-heading"><p className="eyebrow">{tr(locale,'MEETUP MODE','밋업 모드')}</p><h1>{tr(locale,'Check-in pending','체크인 대기 중')}</h1><p>{tr(locale,'Show your photo ID to the host when you arrive. Your meetup screen will unlock after the host checks you in.','도착하면 호스트에게 사진이 있는 신분증을 보여 주세요. 호스트가 체크인을 완료하면 밋업 화면이 열립니다.')}</p></div>
   <div className="event-night-info-card"><UsersRound/><div><b>{event.title}</b><span>{dateLabelForLocale(event.starts_at,locale)} · {timeLabelForLocale(event.starts_at,locale)} KST</span><span>{event.venue}</span></div></div>
   <a className="button secondary" href={mapUrl} target="_blank" rel="noopener noreferrer"><MapPin size={18}/>{tr(locale,'View venue map','장소 지도 보기')}</a>
   <Link className="button secondary" href="/me/events">{tr(locale,'Back to My Events','내 이벤트로 돌아가기')}</Link>
  </section>;
 }

 if(state.state==='waiting'){
  return <section className="event-night-shell">
   <div className="event-night-heading"><p className="eyebrow">{tr(locale,'CHECKED IN','체크인 완료')}</p><h1>{tr(locale,'You’re checked in.','체크인이 완료됐어요.')}</h1><p>{tr(locale,'The host is preparing the table rotation. Your starting table will appear here shortly.','호스트가 테이블 로테이션을 준비하고 있어요. 시작 테이블이 곧 표시됩니다.')}</p></div>
   <div className="event-night-wait-card"><Check size={24}/><b>{tr(locale,'Check-in confirmed','체크인 확인')}</b><span>{tr(locale,'Keep this screen open while the room is being prepared.','밋업 준비가 끝날 때까지 이 화면을 열어 두세요.')}</span></div>
   <a className="button secondary" href={mapUrl} target="_blank" rel="noopener noreferrer"><MapPin size={18}/>{tr(locale,'View venue map','장소 지도 보기')}</a>
  </section>;
 }

 if(state.state==='ready'){
  return <section className="event-night-shell">
   <div className="event-night-heading"><p className="eyebrow">{tr(locale,'CHECKED IN','체크인 완료')}</p><h1>{tr(locale,'Checked in.','체크인 완료.')}</h1><p>{event.title}</p></div>
   <section className="starting-table-card">
    <p className="eyebrow">{tr(locale,'STARTING TABLE','시작 테이블')}</p>
    <strong>{state.starting_table?String(state.starting_table).padStart(2,'0'):'—'}</strong>
    <div><b>{tr(locale,'Head to your starting table before the first round.','첫 라운드 전에 시작 테이블로 이동하세요.')}</b><span>{tr(locale,'Event mode unlocks when the host starts the room.','호스트가 밋업을 시작하면 이벤트 모드가 열립니다.')}</span></div>
   </section>
   <a className="button" href={mapUrl} target="_blank" rel="noopener noreferrer"><MapPin size={18}/>{tr(locale,'View venue map','장소 지도 보기')}</a>
   <button type="button" className="button secondary" disabled>{tr(locale,'Waiting for host to start','호스트 시작 대기 중')}</button>
  </section>;
 }

 if(state.state==='live'){
  const current=state.current;
  return <section className="event-night-shell">
   <div className="event-night-heading"><p className="eyebrow live-kicker">{tr(locale,'LIVE','진행 중')} · {event.title}</p><h1>{tr(locale,'Round','라운드')} {state.current_round} / {state.total_rounds}</h1><p>{current?tr(locale,'Stay at your current table until the timer ends.','타이머가 끝날 때까지 현재 테이블에 머물러 주세요.'):tr(locale,'This is a rest round for you.','이번 라운드는 휴식 라운드예요.')}</p></div>
   <section className="live-round-card">
    <div><p>{current?tr(locale,'CURRENT TABLE','현재 테이블'):tr(locale,'REST ROUND','휴식 라운드')}</p><strong>{current?String(current.table).padStart(2,'0'):'—'}</strong></div>
    <div className="live-timer"><strong>{clock(secondsLeft)}</strong><span>{secondsLeft?tr(locale,'remaining','남음'):tr(locale,'waiting for host','호스트 대기')}</span></div>
    <div className="live-next">{current?.next_table?tr(locale,'Next → Table ','다음 → 테이블 ')+String(current.next_table).padStart(2,'0'):state.current_round<state.total_rounds?tr(locale,'Next → Rest round','다음 → 휴식 라운드'):tr(locale,'Final choices next','다음은 최종 선택')}</div>
   </section>
   {current&&<section className="round-choice-section"><p className="eyebrow">{tr(locale,'YOUR CHOICE · EDITABLE UNTIL FINAL SUBMISSION','내 선택 · 최종 제출 전까지 수정 가능')}</p><h2>{tr(locale,'Would you want to see this tablemate again?','이 상대를 다시 만나고 싶나요?')}</h2><p>{tr(locale,'Choose after every round. You can select Yes for up to 3 people.','매 라운드가 끝날 때 선택하세요. Yes는 최대 3명까지 선택할 수 있어요.')}</p><ChoiceButtons value={current.choice} disabled={busy||state.submitted} onChange={choice=>void choose(current.id,choice)} locale={locale}/></section>}
   {error&&<p role="alert" className="event-night-error">{error}</p>}
   <div className="event-night-help"><b>{tr(locale,'Need staff help?','도움이 필요한가요?')}</b><span>{tr(locale,'Show this screen at the host desk.','호스트 데스크에서 이 화면을 보여 주세요.')}</span></div>
  </section>;
 }

 if(state.state==='final_choices'){
  return <section className="event-night-shell">
   <div className="event-night-heading"><p className="eyebrow">{tr(locale,'FINAL CHOICES','최종 선택')}</p><h1>{state.submitted?tr(locale,'Choices submitted.','선택을 제출했어요.'):tr(locale,'Review your choices.','선택을 검토하세요.')}</h1><p>{state.submitted?tr(locale,'Your choices are locked. Results will appear after the host finishes the meetup.','선택이 확정되었습니다. 호스트가 밋업을 종료하면 결과가 표시됩니다.'):tr(locale,'Review every tablemate, then submit. Maximum 3 Yes.','모든 상대에 대한 선택을 검토한 뒤 제출하세요. Yes는 최대 3명입니다.')}</p></div>
   <div className="final-choice-list">{state.encounters.map((item,index)=><article className="final-choice-card" key={item.id}><span className="final-choice-avatar" style={item.photo?{backgroundImage:`url("${item.photo}")`}:undefined}>{!item.photo&&<UsersRound size={22}/>}</span><div className="final-choice-copy"><b>{tr(locale,'Tablemate ','상대 ')}{index+1}</b><span>{tr(locale,'Round','라운드')} {item.round} · {tr(locale,'Table','테이블')} {String(item.table).padStart(2,'0')}</span></div><ChoiceButtons value={item.choice} disabled={busy||state.submitted} onChange={choice=>void choose(item.id,choice)} locale={locale}/></article>)}</div>
   <p className="choice-summary">{state.yes_count} Yes · {state.maybe_count} Maybe · {state.no_count} No</p>
   {error&&<p role="alert" className="event-night-error">{error}</p>}
   {!state.submitted&&<button type="button" className="button" disabled={busy} onClick={()=>void submit()}>{busy?tr(locale,'Submitting…','제출 중…'):tr(locale,'Submit final choices','최종 선택 제출')}</button>}
  </section>;
 }

 return <section className="event-night-shell">
  <div className="event-night-heading"><p className="eyebrow">{tr(locale,'MEETUP COMPLETE','밋업 종료')}</p><h1>{tr(locale,'Thanks for showing up.','참여해 주셔서 감사합니다.')}</h1><p>{state.matches>0?tr(locale,`You have ${state.matches} mutual match${state.matches===1?'':'es'}.`,`서로 선택한 매칭이 ${state.matches}개 있어요.`):tr(locale,'No mutual matches yet. Your choices stay private.','아직 서로 선택한 매칭은 없어요. 선택 내용은 비공개로 유지됩니다.')}</p></div>
  <div className="event-night-complete-card"><Check size={28}/><strong>{state.matches}</strong><span>{tr(locale,'mutual matches','서로 선택한 매칭')}</span></div>
  <Link className="button" href="/matches">{tr(locale,'View matches','매칭 보기')}<ArrowRight size={18}/></Link>
  <Link className="button secondary" href="/events">{tr(locale,'Find the next event','다음 이벤트 찾기')}</Link>
 </section>;
}
