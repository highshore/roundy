'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Play, RotateCw, Square, UserCheck, UserX } from 'lucide-react';
import { tr, type Locale } from '@/lib/locale';
import type { Event } from '@/lib/data';

type Attendee={user_id:string;full_name:string;gender:string;photo:string|null;checked_in_at:string|null;created_at:string};
type AdminNightState={
 state:'waiting'|'ready'|'live'|'final_choices'|'finished';
 total_rounds:number;
 current_round:number;
 round_duration_seconds:number;
 round_started_at:string|null;
 attendees:Attendee[];
 checked_men:number;
 checked_women:number;
 matches:number;
};

async function request(eventId:string,body?:unknown){
 const r=await fetch('/api/admin/events/'+eventId+'/event-night',{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const d=await r.json();
 if(!r.ok)throw new Error(d.error||'Meetup control failed.');
 return d;
}

export function AdminEventNight({event,locale}:{event:Event;locale:Locale}){
 const [state,setState]=useState<AdminNightState|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');

 async function load(){
  const d=await request(event.id);
  setState(d.state as AdminNightState);
 }
 useEffect(()=>{void load().catch(e=>setError(e.message));const poll=window.setInterval(()=>void load().catch(()=>{}),5000);return()=>window.clearInterval(poll);},[event.id]); // eslint-disable-line react-hooks/exhaustive-deps

 async function act(action:string,extra?:Record<string,unknown>){
  setBusy(true);setError('');setNotice('');
  try{
   await request(event.id,{action,...extra});
   await load();
   setNotice(action==='check-in'?tr(locale,'Check-in updated.','체크인이 업데이트되었습니다.'):tr(locale,'Meetup state updated.','밋업 상태가 업데이트되었습니다.'));
  }catch(e){setError(e instanceof Error?e.message:'Meetup control failed.');}
  finally{setBusy(false);}
 }

 const balanced=useMemo(()=>!!state&&state.checked_men>0&&state.checked_men===state.checked_women,[state]);
 if(!state)return <p className="note">{error||tr(locale,'Loading meetup control…','밋업 컨트롤을 불러오는 중…')}</p>;

 const checkedTotal=state.checked_men+state.checked_women;
 return <div className="admin-night">
  <section className="admin-night-summary">
   <div><p className="admin-kicker">{tr(locale,'MEETUP CONTROL','밋업 컨트롤')}</p><h3>{event.title}</h3></div>
   <span className={'admin-night-state '+state.state}>{state.state.replace('_',' ')}</span>
  </section>

  <div className="admin-night-stats">
   <span><b>{checkedTotal}</b>{tr(locale,'checked in','체크인')}</span>
   <span><b>{state.checked_women}</b>{tr(locale,'women','여성')}</span>
   <span><b>{state.checked_men}</b>{tr(locale,'men','남성')}</span>
   <span><b>{state.total_rounds||'—'}</b>{tr(locale,'rounds','라운드')}</span>
  </div>

  <section className="admin-checkin-list">
   <div className="admin-night-section-head"><h4>{tr(locale,'Attendee check-in','참가자 체크인')}</h4><span>{tr(locale,'Lock after preparation','준비 후 잠금')}</span></div>
   {state.attendees.map(person=><div className="admin-checkin-row" key={person.user_id}>
    <span className="admin-checkin-avatar" style={person.photo?{backgroundImage:`url("${person.photo}")`}:undefined}>{!person.photo&&(person.full_name?.[0]||'?')}</span>
    <div><b>{person.full_name}</b><span>{person.gender==='female'?tr(locale,'Woman','여성'):person.gender==='male'?tr(locale,'Man','남성'):tr(locale,'Not set','미설정')}</span></div>
    <button type="button" className={person.checked_in_at?'checked':''} disabled={busy||state.state!=='waiting'} onClick={()=>void act('check-in',{userId:person.user_id,checked:!person.checked_in_at})}>{person.checked_in_at?<><UserX size={16}/>{tr(locale,'Undo','취소')}</>:<><UserCheck size={16}/>{tr(locale,'Check in','체크인')}</>}</button>
   </div>)}
   {!state.attendees.length&&<p className="note">{tr(locale,'No confirmed attendees yet.','확정된 참가자가 아직 없습니다.')}</p>}
  </section>

  <section className="admin-night-actions">
   {state.state==='waiting'&&<><p>{balanced?tr(locale,'Check-in is balanced. Prepare the rotation to assign starting tables.','체크인 인원이 균형을 이뤘습니다. 로테이션을 준비해 시작 테이블을 배정하세요.'):tr(locale,'Check in an equal number of women and men before preparing the meetup.','밋업 준비 전 여성과 남성의 체크인 인원을 같게 맞춰 주세요.')}</p><button className="admin-primary" disabled={busy||!balanced} onClick={()=>void act('prepare')}><RotateCw size={17}/>{tr(locale,'Prepare Meetup','밋업 준비')}</button></>}
   {state.state==='ready'&&<><p>{tr(locale,'Starting tables are assigned. Participants can see their table now.','시작 테이블이 배정되었습니다. 참가자 화면에 테이블이 표시됩니다.')}</p><button className="admin-primary" disabled={busy} onClick={()=>void act('start')}><Play size={17}/>{tr(locale,'Start Meetup','밋업 시작')}</button></>}
   {state.state==='live'&&<><p>{tr(locale,'Round ','라운드 ')}{state.current_round} / {state.total_rounds}</p><button className="admin-primary" disabled={busy} onClick={()=>void act('advance')}><RotateCw size={17}/>{state.current_round<state.total_rounds?tr(locale,'Start Next Round','다음 라운드 시작'):tr(locale,'Open Final Choices','최종 선택 열기')}</button></>}
   {state.state==='final_choices'&&<><p>{tr(locale,'Participants are reviewing their choices. Finish the meetup when you are ready to publish mutual matches.','참가자들이 선택을 검토 중입니다. 준비가 되면 밋업을 종료해 서로 선택한 매칭을 공개하세요.')}</p><button className="admin-primary" disabled={busy} onClick={()=>void act('finish')}><Square size={17}/>{tr(locale,'Finish Meetup','밋업 종료')}</button></>}
   {state.state==='finished'&&<div className="admin-night-finished"><Check size={20}/><b>{tr(locale,'Meetup finished','밋업 종료')}</b><span>{state.matches} {tr(locale,'mutual matches','서로 선택한 매칭')}</span></div>}
  </section>

  {error&&<p role="alert" className="admin-error">{error}</p>}
  {notice&&<p role="status" className="note">{notice}</p>}
 </div>;
}
