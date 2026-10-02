'use client';
import { Heading } from '@/components/heading';
import { EventStatusStrip } from './event-status-strip';
import { headingText as headline } from '@/lib/heading';
import { EventCategoryBadges, NationalityBadges, NationalityFact, VenueFact } from './event-detail-meta';
import { isRoundyEvent } from '@/lib/event-scope';
import { lockdownNotice } from '@/lib/event-requirements';
import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useState, type ReactNode, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, ArrowRight, ArrowLeft, CalendarDays, Clock3, MapPin, Compass, Heart, UserRound, UsersRound, Ticket, ShieldCheck, Check, CircleCheck, Plus, X, ChevronRight, Search, LockKeyhole, Copy, LogOut, Trash2, Share2, MessageCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/client';
import { AccountConsent } from '@/components/legal-consent';
import { AccountSecurity } from '@/components/account-security';
import { SignIn } from '@/components/sign-in';
import { ResetPassword } from '@/components/reset-password';
import { VenueMap } from '@/components/venue-map';
import { MatchesScreen } from '@/components/matches-screen';
import { CopyrightPolicy, PrivacyPolicy, RefundPolicy, TermsOfUse } from '@/components/legal';
import { SiteFooter } from '@/components/site-footer';
import { FeedbackPage, FeedbackPrompt } from '@/components/feedback';
import { AboutUs } from '@/components/about-us';
import { RoundyBrand } from '@/components/roundy-brand';
import { DiscoveryHero } from '@/components/discovery-hero';
import { LocaleToggle } from '@/components/locale-toggle';
import { LoadingScreen } from '@/components/loading-screen';
import { useToast } from '@/components/toast';
import { AdminQrCheckIn } from '@/components/admin-qr-checkin';
import { EventNight } from '@/components/event-night';
import { NationalitySelect, InterestPicker } from '@/components/profile-options';
import { VerificationFields } from '@/components/verification-fields';
import { NotoAnimatedEmoji } from '@/components/noto-animated-emoji';
import { compressProfilePhoto, fileToDataUrl } from '@/lib/uploads';
import { authConfigured } from '@/lib/auth-routing';
import { mbtiTypes, demoMode, eventCategory, events as sampleEvents, interests, emptyProfile, sampleProfile, formatKoreanPhone, profileComplete, type Event, type Profile, type Choice } from '@/lib/data';
import { dateLabelForLocale, localizeEvent, timeLabelForLocale, localizeInterest, tr, ui, type Locale } from '@/lib/locale';
import { MINIMUM_AGE, isAtLeastAge } from '@/lib/age';

type State={profile:Profile;applications:Record<string,string>;booked:Record<string,boolean>;checked:Record<string,boolean>;choices:Record<string,Choice>;finished:boolean;verification:string};
type PriceQuote={event_id:string;gender:'male'|'female';original_amount:number;code:string|null;code_kind:'none'|'referral'|'promo';code_valid:boolean;code_reason:string;code_discount_percent:number;referral_discount_amount:number;promo_discount_amount:number;gender_balance_discount_amount:number;gender_balance_applied:boolean;time_discount_amount:number;time_discount_kind:'none'|'early_bird'|'last_minute';boomerang_discount_amount:number;boomerang_applied:boolean;total_discount_amount:number;total_discount_percent:number;final_amount:number;male_count:number;female_count:number;hours_to_start:number;payment_pending?:boolean;payment_status?:string|null;payment_order_number?:string|null;locked?:boolean};
type PendingPayment={order_number:string;status:string;amount:number};
type AttendeePreview={photo:string|null};
type EventAttendees={women:AttendeePreview[];men:AttendeePreview[];women_count:number;men_count:number;total:number};
type PublicRosterEntry={age_band:string;job_group:string};
type PublicRoster={women:PublicRosterEntry[];men:PublicRosterEntry[];women_count:number;men_count:number;total:number;updated_at:string|null};
const initial:State={profile:emptyProfile,applications:{},booked:{},checked:{},choices:{},finished:false,verification:'Not started'};
const RoundyLocaleContext=createContext<Locale>('en');
function localizeNode(node:ReactNode,locale:Locale):ReactNode{
 if(typeof node==='string')return ui(locale,node);
 if(Array.isArray(node))return Children.map(node,child=>localizeNode(child,locale));
 if(isValidElement<{children?:ReactNode;placeholder?:string;'aria-label'?:string;alt?:string}>(node)){
  const props:Record<string,string>={};
  for(const key of ['placeholder','aria-label','alt'] as const){const value=node.props[key];if(value)props[key]=ui(locale,value);}
  return node.props.children===undefined?cloneElement(node,props):cloneElement(node,props,localizeNode(node.props.children,locale));
 }
 return node;
}
function Localized({children}:{children:ReactNode}){const locale=useContext(RoundyLocaleContext);return <>{localizeNode(children,locale)}</>;}
async function api(path:string,body?:unknown,method?:string){const r=await fetch('/api/'+path,{method:method??(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error??'Something went wrong. Please try again.');return data;}

function Button({children,href,onClick,secondary=false,disabled=false,type='button'}:{children:ReactNode;href?:string;onClick?:()=>void;secondary?:boolean;disabled?:boolean;type?:'button'|'submit'}){const cls='button'+(secondary?' secondary':'');return href?<Link className={cls} href={href}><Localized>{children}</Localized><ArrowRight size={18}/></Link>:<button className={cls} type={type} onClick={onClick} disabled={disabled}><Localized>{children}</Localized></button>;}
function Card({label,title,children}:{label?:string;title?:string;children?:ReactNode}){const locale=useContext(RoundyLocaleContext);return <section className="info-card">{label&&<p className="eyebrow">{ui(locale,label)}</p>}{title&&<Heading level={3}>{headline(ui(locale,title))}</Heading>}{children&&<div className="card-copy"><Localized>{children}</Localized></div>}</section>;}
function Poster({title,label='SEOUL / AFTER HOURS'}:{title:string;label?:string}){const locale=useContext(RoundyLocaleContext);return <div className="poster"><span className="eyebrow">{ui(locale,label)}</span><strong>{ui(locale,title)}</strong><span><Localized>A real room. A fresh start. </Localized><ArrowUpRight size={18}/></span></div>;}
function Note({children}:{children:ReactNode}){return <p className="note"><Localized>{children}</Localized></p>;}
function Field({label,children}:{label:string;children:ReactNode}){const locale=useContext(RoundyLocaleContext);return <label className="field"><span>{ui(locale,label)}</span>{children}</label>;}
function Empty({title,body,href,label='Explore events'}:{title:string;body:string;href?:string;label?:string}){const locale=useContext(RoundyLocaleContext);return <div className="empty"><NotoAnimatedEmoji codepoint="1f440" fallback="👀" size={58}/><Heading level={2}>{headline(ui(locale,title))}</Heading><p>{ui(locale,body)}</p>{href&&<Button href={href}>{ui(locale,label)}</Button>}</div>;}

function categoryLabel(event:Event,locale:Locale){return isRoundyEvent(event)?tr(locale,'1:1 Mingle','1:1 밍글'):tr(locale,'Archived event','보관된 모임');}
function AttendeeStack({count,kind,locale,attendees=[]}:{count:number;kind:string;locale:Locale;attendees?:AttendeePreview[]}){const shown=Math.min(5,Math.max(0,count));const visible=attendees.slice(0,shown);return <div className="attendee-stack" aria-label={count+' '+ui(locale,kind)}>{Array.from({length:shown},(_,i)=>{const attendee=visible[i];return <span className={'attendee-avatar avatar-'+i} key={i} aria-hidden="true" style={attendee?.photo?{backgroundImage:`url("${attendee.photo}")`}:undefined}>{!attendee?.photo&&<UserRound size={13}/>}</span>;})}{count>shown&&<span className="attendee-avatar more" aria-hidden="true">+{count-shown}</span>}</div>;}
function ageBandLabel(value:string,locale:Locale){
 const match=value.match(/^(\d{2})_(early|mid|late)$/);
 if(!match)return tr(locale,'Age undisclosed','연령대 비공개');
 const [,decade,band]=match;
 const en=band==='early'?'Early':band==='mid'?'Mid':'Late';
 const ko=band==='early'?'초반':band==='mid'?'중반':'후반';
 return locale==='ko'?decade+ko:en+' '+decade+'s';
}
function jobGroupLabel(value:string,locale:Locale){
 const labels:Record<string,[string,string]>={
  developer:['Developer / tech','개발자'],
  medical:['Medical','의료계'],
  finance:['Finance','금융계'],
  public:['Public sector','공공기관'],
  large_company:['Large company','대기업'],
  professional:['Professional','전문직'],
  education:['Education','교육계'],
  creative:['Creative','크리에이티브'],
  student:['Student','학생'],
  self_employed:['Self-employed','자영업·프리랜서'],
  business:['Business','비즈니스'],
  office:['Office worker','회사원']
 };
 const label=labels[value]??labels.office;
 return tr(locale,label[0],label[1]);
}
function rosterUpdatedLabel(value:string|null,locale:Locale){
 if(!value)return '';
 const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
 return new Intl.DateTimeFormat(locale==='ko'?'ko-KR':'en-US',{timeZone:'Asia/Seoul',month:'short',day:'numeric',weekday:'short',hour:'numeric',minute:'2-digit'}).format(date);
}
export function EventCard({e,locale,href,attendees,past=false}:{e:Event;locale:Locale;href?:string;attendees?:EventAttendees;past?:boolean}){const item=localizeEvent(e,locale);const confirmed=attendees?.total??0;const preview=attendees?[...attendees.women,...attendees.men]:[];return <Link href={href??'/events/'+e.slug} className={'event-card'+(past?' past-event':'')}><div className="event-photo"><Image src={e.image||'/images/yeouido.webp'} alt={e.title} fill sizes="(max-width: 640px) 100vw, 500px"/><span className="photo-arrow"><ArrowUpRight size={24}/></span></div><div className="event-copy"><div className="event-tags"><span>{categoryLabel(e,locale)}</span><span>{e.age_min}–{e.age_max}{tr(locale,' years','세')}</span><div className="nationality-chip-group"><NationalityBadges requirements={e.nationality_requirements} locale={locale}/></div></div><Heading level={2}>{headline(item.title)}</Heading><p className="event-time"><CalendarDays size={16}/>{dateLabelForLocale(e.starts_at,locale)} · {timeLabelForLocale(e.starts_at,locale)} KST</p><p className="event-location"><MapPin size={16}/>{item.venue}</p><div className="event-attendance">{past?<><div><span className="past-event-status">{tr(locale,'Ended','종료')}</span></div><span>{confirmed}/{e.capacity} {tr(locale,'attended','참여')}</span></>:<><div><AttendeeStack count={confirmed} kind={tr(locale,'Attendees','참가자')} locale={locale} attendees={preview}/></div></>}</div>{!past&&<EventStatusStrip event={e} attendees={attendees} locale={locale}/>}</div></Link>;}

function landingRosterProfiles(roster:PublicRoster|undefined,locale:Locale){
 const profiles:string[]=[];
 for(const entry of roster?.women??[])profiles.push(tr(locale,'Woman','여성')+' · '+ageBandLabel(entry.age_band,locale)+' · '+jobGroupLabel(entry.job_group,locale));
 for(const entry of roster?.men??[])profiles.push(tr(locale,'Man','남성')+' · '+ageBandLabel(entry.age_band,locale)+' · '+jobGroupLabel(entry.job_group,locale));
 return profiles.slice(0,8);
}
function LandingParticipantTicker({roster,locale}:{roster?:PublicRoster;locale:Locale}){
 const profiles=landingRosterProfiles(roster,locale);
 const items=profiles.length?profiles:[tr(locale,'Profiles update as seats fill','참가자 정보는 예약에 따라 업데이트돼요')];
 const rolling=items.length>2;
 const rendered=rolling?[...items,...items]:items;
 return <div className="landing-profile-ticker" aria-label={tr(locale,'Participant profile preview','참가자 프로필 미리보기')}>
  <div className={'landing-profile-track'+(rolling?' rolling':'')}>{rendered.map((label,index)=><span key={label+'-'+index} aria-hidden={rolling&&index>=items.length?true:undefined}>{label}</span>)}</div>
 </div>;
}
function LandingMingleCard({e,locale,attendees,roster}:{e:Event;locale:Locale;attendees?:EventAttendees;roster?:PublicRoster}){
 const item=localizeEvent(e,locale);
 return <Link href={'/events/'+e.slug} className="landing-mingle-card">
  <div className="landing-mingle-media">
   <Image src={e.image||'/images/yeouido.webp'} alt={item.title} fill sizes="(max-width: 430px) calc(100vw - 48px), 382px"/>
   <span className="landing-mingle-tag">{tr(locale,'1:1 Mingle','1:1 밍글')}</span>
  </div>
  <Heading level={3}>{headline(item.title)}</Heading>
  <p className="landing-mingle-date">{dateLabelForLocale(e.starts_at,locale)} · {timeLabelForLocale(e.starts_at,locale)} KST</p>
  <p className="landing-mingle-venue">{item.venue}</p>
  <LandingParticipantTicker roster={roster} locale={locale}/>
  <EventStatusStrip event={e} attendees={attendees} locale={locale}/>
 </Link>;
}
function LandingSafetyIcon({kind}:{kind:'profile'|'id'|'match'}){
 if(kind==='profile')return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M4 18c.6-3.1 2.2-5 5-5s4.4 1.9 5 5"/><path d="m15.5 11.5 2 2 3-4"/></svg>;
 if(kind==='id')return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8" cy="10" r="2"/><path d="M5.5 16c.4-1.8 1.3-2.8 2.7-2.8 1.4 0 2.3 1 2.7 2.8"/><path d="m14 10 1.7 1.7L19 8"/></svg>;
 return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="8" r="2.4"/><circle cx="17" cy="8" r="2.4"/><path d="M3.5 17c.5-2.8 1.7-4.4 3.5-4.4s3 1.6 3.5 4.4M13.5 17c.5-2.8 1.7-4.4 3.5-4.4s3 1.6 3.5 4.4"/><path d="M12 13s-2.4-1.5-2.4-3a1.5 1.5 0 0 1 2.4-1 1.5 1.5 0 0 1 2.4 1c0 1.5-2.4 3-2.4 3Z"/></svg>;
}
function LandingPage({events,locale,attendeesByEvent,publicRosters}:{events:Event[];locale:Locale;attendeesByEvent:Record<string,EventAttendees>;publicRosters:Record<string,PublicRoster>}){
 const upcoming=[...events].sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).slice(0,4);
 const [eventSlide,setEventSlide]=useState(0);
 const activeIndex=upcoming.length?eventSlide%upcoming.length:0;
 const activeEvent=upcoming[activeIndex];
 const moveEvent=(direction:number)=>{if(upcoming.length>1)setEventSlide(current=>(current+direction+upcoming.length)%upcoming.length);};
 return <div className="landing landing-v1">
  <section className="landing-v1-hero">
   <DiscoveryHero locale={locale}/>
  </section>

  <section className="landing-v1-meetups">
   <Heading level={2}>{tr(locale,'Meet someone, in real life','서울에서 직접 만나보세요')}</Heading>
   {activeEvent?<div className="landing-mingle-carousel">
    <LandingMingleCard e={activeEvent} locale={locale} attendees={attendeesByEvent[activeEvent.id]} roster={publicRosters[activeEvent.id]}/>
    {upcoming.length>1&&<div className="landing-mingle-controls" aria-label={tr(locale,'Upcoming Mingle carousel','예정 밍글 캐러셀')}>
     <button type="button" onClick={()=>moveEvent(-1)} aria-label={tr(locale,'Previous Mingle','이전 밍글')}><ArrowLeft size={17}/></button>
     <div className="landing-mingle-position">{upcoming.map((_,index)=><span key={index} className={index===activeIndex?'active':''}/>)}
      <small>{activeIndex+1} / {upcoming.length}</small>
     </div>
     <button type="button" onClick={()=>moveEvent(1)} aria-label={tr(locale,'Next Mingle','다음 밍글')}><ArrowRight size={17}/></button>
    </div>}
   </div>:<p className="landing-v1-empty">{tr(locale,'New events are being prepared.','다음 모임을 준비하고 있어요.')}</p>}
   <Link className="landing-v1-all-events-button" href="/events">{tr(locale,'See all events','모든 모임 보기')}</Link>
  </section>

  <section className="landing-v1-reviews">
   <Heading level={2}>{tr(locale,'What people say','참가자 후기')}</Heading>
   <p>{tr(locale,'Verified attendee reviews from past Mingles.','지난 밍글 참가자의 후기를 소개하는 공간입니다.')}</p>
   <div className="landing-review-viewport">
    <div className="landing-review-track">
     <article className="landing-review-card">
      <span>{tr(locale,'Verified attendee','참가자 인증')}</span>
      <p>{tr(locale,'Public attendee reviews will appear here when available.','공개 가능한 참가자 후기가 준비되면 여기에 소개할게요.')}</p>
      <small>{tr(locale,'Roundy Mingle','Roundy 밍글')}</small>
     </article>
     <article className="landing-review-card">
      <span>{tr(locale,'Verified attendee','참가자 인증')}</span>
      <p>{tr(locale,'Reviews are displayed only with attendee permission.','참가자가 공개에 동의한 후기만 소개합니다.')}</p>
      <small>{tr(locale,'Roundy Mingle','Roundy 밍글')}</small>
     </article>
    </div>
   </div>
   <div className="landing-review-position" aria-hidden="true"><span className="active"/><span/></div>
  </section>

  <section className="landing-v1-safety">
   <div className="landing-safety-visual"><Image src="/images/discovery-safety.png" alt="" fill sizes="(max-width: 430px) calc(100vw - 48px), 382px"/></div>
   <Heading level={2}>{tr(locale,'Safety first, always.','안전을 가장 먼저 생각합니다.')}</Heading>
   <p>{tr(locale,'Three safeguards before and after you meet.','만남 전후를 지키는 세 가지 안전장치')}</p>
   <div className="landing-safety-features">
    <article><span className="landing-safety-icon"><LandingSafetyIcon kind="profile"/></span><strong>{tr(locale,'Profile validation','프로필 검증')}</strong></article>
    <article><span className="landing-safety-icon"><LandingSafetyIcon kind="id"/></span><strong>{tr(locale,'ID verification','신분증 확인')}</strong></article>
    <article className="contact"><span className="landing-safety-icon"><LandingSafetyIcon kind="match"/></span><strong>{tr(locale,'Name & contact after match','매칭 후 이름·연락처 공개')}</strong></article>
   </div>
  </section>

  <section className="landing-hosting-proof">
   <span className="eyebrow">{tr(locale,'HOSTING EXPERIENCE','운영 경험')}</span>
   <div><strong>80+</strong><span>{tr(locale,'offline English meetups hosted in Seoul','서울에서 진행한 오프라인 영어 밋업')}</span></div>
   <p>{tr(locale,'That hosting experience shapes how every Roundy Mingle is run.','80회 이상의 오프라인 밋업 운영 경험을 모든 Roundy 밍글에 반영합니다.')}</p>
  </section>
 </div>;
}
export function App({path}:{path:string}){
 const router=useRouter();const {showToast}=useToast();const searchParams=useSearchParams();const [state,setState]=useState<State>(initial);const [ready,setReady]=useState(false);const [events,setEvents]=useState<Event[]>(demoMode?sampleEvents:[]);const [authed,setAuthed]=useState(demoMode);const [isAdmin,setIsAdmin]=useState(false);const [busy,setBusy]=useState(false);const [routeLoading,setRouteLoading]=useState(false);const [eventsLoading,setEventsLoading]=useState(!demoMode);const [message,setMessage]=useState('');const [error,setError]=useState('');const [query,setQuery]=useState('');const [qr,setQr]=useState('');const [locale,setLocale]=useState<Locale>('en');const [consentEvent,setConsentEvent]=useState<Event|null>(null);const [consentCancellation,setConsentCancellation]=useState(false);const [consentTerms,setConsentTerms]=useState(false);const [deleteAccountOpen,setDeleteAccountOpen]=useState(false);const [deleteAccountConfirm,setDeleteAccountConfirm]=useState('');const [myReferralCode,setMyReferralCode]=useState('');const [checkoutCode,setCheckoutCode]=useState('');const [priceQuote,setPriceQuote]=useState<PriceQuote|null>(null);const [checkoutTermsAccepted,setCheckoutTermsAccepted]=useState(false);const [attendeesByEvent,setAttendeesByEvent]=useState<Record<string,EventAttendees>>({});const [publicRosters,setPublicRosters]=useState<Record<string,PublicRoster>>({});const [pendingPayments,setPendingPayments]=useState<Record<string,PendingPayment>>({});const [ticketBalance,setTicketBalance]=useState(0);
 const p=state.profile;const parts=path.split('/');const route=parts[0]||'home';const referralParam=(searchParams.get('ref')??searchParams.get('code')??'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24);const requestedSlug=route==='onboarding'?parts[2]:route==='profile'&&parts[1]==='review-submitted'?parts[2]:parts[1];const slug=requestedSlug||(route==='onboarding'||route==='profile'||route==='events'||route==='discover'||route==='home'||route==='payment'?'':'saturday-social');const event=slug?(events.find(e=>e.slug===slug)??events.find(e=>e.previous_slugs?.includes(slug))):undefined;const appStatus=state.applications[slug];const publishedEvents=events.filter(e=>isRoundyEvent(e)&&(e.status==='live'||e.status==='published'));const publicEvents=publishedEvents.filter(e=>Date.parse(e.starts_at)>Date.now()&&e.seats_remaining>0);
 function patchProfile(values:Partial<Profile>){setState(s=>({...s,profile:{...s.profile,...values}}));}
 function flash(text:string){setMessage(text);setError('');}
 function setLanguage(next:Locale){setLocale(next);try{localStorage.setItem('roundy-locale',next);}catch{/* A blocked storage setting should not block language choice. */}}
 async function work(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
 useEffect(()=>{if(!authConfigured()){setReady(true);return;}if(demoMode){try{const saved=sessionStorage.getItem('roundy-demo-v1');if(saved)setState({...initial,...JSON.parse(saved)});}catch{/* A corrupt preview does not block browsing. */}setReady(true);}else{Promise.allSettled([api('profile').then(d=>{const loaded={...emptyProfile,...d.profile};setState(s=>({...s,profile:loaded,verification:d.verification??'Not started'}));setAuthed(true);void api('admin/role').then(result=>setIsAdmin(Boolean(result.isAdmin))).catch(()=>setIsAdmin(false));}).catch(()=>{setAuthed(false);setIsAdmin(false);})]).finally(()=>setReady(true));}},[]);
 useEffect(()=>{if(demoMode||!authConfigured()){setEventsLoading(false);return;}let active=true;let controller:AbortController|null=null;
  async function refresh(){controller?.abort();const request=new AbortController();controller=request;setEventsLoading(true);try{const response=await fetch('/api/events',{cache:'no-store',signal:request.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load events.');if(active&&!request.signal.aborted)setEvents(Array.isArray(data.events)?data.events.filter(isRoundyEvent):[]);}catch(e){if(active&&!request.signal.aborted)setError(e instanceof Error?e.message:'Could not load events.');}finally{if(active&&!request.signal.aborted)setEventsLoading(false);}}
  const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};void refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',onVisible);return()=>{active=false;controller?.abort();window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',onVisible);};
 },[path,authed]);
 useEffect(()=>{if(!demoMode&&authed){void api('referral').then(d=>setMyReferralCode(String(d.referralCode??''))).catch(()=>setMyReferralCode(''));}},[authed]);
 useEffect(()=>{if(demoMode){setTicketBalance(0);return;}if(!authed)return;void api('credits').then(d=>setTicketBalance(Math.max(0,Number(d.balance)||0))).catch(()=>setTicketBalance(0));},[authed,route]);
 useEffect(()=>{
  let active=true;
  if(demoMode||events.length===0)return;
  void Promise.all(events.filter(e=>e.status==='live').map(async e=>{
   try{
    const data=await api('events/'+e.id+(authed?'/attendees':'/roster'));
    const counts:EventAttendees=authed?data.attendees:{women:[],men:[],women_count:data.roster.women_count,men_count:data.roster.men_count,total:data.roster.total};
    let roster:PublicRoster|null=authed?null:(data.roster as PublicRoster);
    if(authed){try{const publicData=await api('events/'+e.id+'/roster');roster=(publicData.roster??null) as PublicRoster|null;}catch{/* Public roster preview remains optional. */}}
    return {id:e.id,counts,roster};
   }catch{return null;}
  })).then(rows=>{
   if(!active)return;
   const valid=rows.filter((row):row is {id:string;counts:EventAttendees;roster:PublicRoster|null}=>row!==null);
   setAttendeesByEvent(Object.fromEntries(valid.map(row=>[row.id,row.counts])));
   const rosters=valid.flatMap(row=>row.roster?[[row.id,row.roster] as const]:[]);
   if(rosters.length)setPublicRosters(previous=>({...previous,...Object.fromEntries(rosters)}));
  });
  return()=>{active=false;};
 },[authed,events]);
 useEffect(()=>{if(route!=='events'||!event||event.status!=='live')return;let active=true;void fetch('/api/events/'+event.id+'/roster',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load participant list.');if(active&&data.roster)setPublicRosters(prev=>({...prev,[event.id]:data.roster as PublicRoster}));}).catch(()=>{/* The event page remains usable if the public roster is unavailable. */});return()=>{active=false;};},[route,event?.id,event?.status]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{try{const valid=/^[A-Z0-9_-]{4,24}$/;if(valid.test(referralParam)){sessionStorage.setItem('roundy-referral-prefill',referralParam);if(route==='checkout'){setCheckoutCode(referralParam);setPriceQuote(null);setCheckoutTermsAccepted(false);}}else if(route==='checkout'&&!checkoutCode){const stored=sessionStorage.getItem('roundy-referral-prefill')??'';if(valid.test(stored))setCheckoutCode(stored);}}catch{/* Discount-code prefill remains optional if storage is unavailable. */}},[referralParam,route]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(route!=='checkout'||!event||!authed||!['male','female'].includes(p.gender))return;let active=true;let code=checkoutCode.trim().toUpperCase();try{if(!code){const stored=sessionStorage.getItem('roundy-referral-prefill')??'';if(/^[A-Z0-9_-]{4,24}$/.test(stored)){code=stored;setCheckoutCode(stored);}}}catch{/* Discount prefill is optional. */}void (async()=>{try{const quote:PriceQuote=demoMode?demoPriceQuote(event!,code):(await api('checkout/quote',{eventId:event!.id,code})).quote;if(active){setPriceQuote(quote);if(quote.locked)setCheckoutCode(String(quote.code??''));}}catch(e){if(active)setError(e instanceof Error?e.message:'Could not calculate this event price.');}})();return()=>{active=false;};},[route,event?.id,event?.seats_remaining,authed,p.gender]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(route!=='payment'||parts[1]!=='result'||!authed||demoMode)return;const orderNumber=(searchParams.get('order')??'').trim();if(!/^RNDY-A-\d{14}-[A-F0-9]{10}$/.test(orderNumber)){setError(tr(locale,'Payment confirmation information is missing. Please contact Roundy support if you were charged.','결제 확인 정보가 없습니다. 결제되었다면 Roundy 고객지원에 문의해 주세요.'));return;}let active=true;let timer:number|undefined;let attempts=0;const check=async()=>{try{const result=await api('checkout',{action:'status',orderNumber});if(!active)return;if(result.completed){const paidEvent=events.find(item=>item.id===result.eventId);if(paidEvent)setState(s=>({...s,booked:{...s.booked,[paidEvent.slug]:true}}));await Promise.all([refreshEvents(),refreshCredits()]);if(active)router.replace('/me/events');return;}if(result.failed||['refunded','refunded_pending_reconcile'].includes(String(result.status))){setError(String(result.error||tr(locale,'The payment was cancelled or could not be completed. Do not pay again until you review the result.','결제가 취소되었거나 완료되지 않았습니다. 결과를 확인하기 전까지 다시 결제하지 마세요.')));return;}attempts+=1;if(attempts>=30){setError(tr(locale,'We are still waiting for PayApp confirmation. Do not pay again; check My Events shortly or contact Roundy support.','PayApp 결제 확인을 기다리고 있어요. 다시 결제하지 말고 잠시 후 내 모임을 확인하거나 Roundy 고객지원에 문의해 주세요.'));return;}timer=window.setTimeout(()=>void check(),1500);}catch(e){if(active)setError(e instanceof Error?e.message:tr(locale,'Could not confirm your payment yet. Please try again shortly.','아직 결제를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.'));}};void check();return()=>{active=false;if(timer!==undefined)window.clearTimeout(timer);};},[route,authed,searchParams,events,locale]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(ready&&demoMode){try{sessionStorage.setItem('roundy-demo-v1',JSON.stringify(state));}catch{setError('Photo is too large for this preview. Please choose a smaller photo.');}}},[state,ready]);
 useEffect(()=>{let active=true;setError('');setMessage('');setQuery('');if(!demoMode&&authed){setRouteLoading(true);const tasks=[api('applications').then(d=>{if(active)setState(s=>({...s,applications:Object.fromEntries(d.applications.map((a:{event_slug:string;status:string})=>[a.event_slug,a.status]))}));}),api('bookings').then(d=>{if(active){setState(s=>({...s,booked:Object.fromEntries((d.bookings??[]).filter((b:{event_slug?:string})=>b.event_slug).map((b:{event_slug:string})=>[b.event_slug,true]))}));setPendingPayments(Object.fromEntries((d.pending_payments??[]).filter((o:{event_slug?:string})=>o.event_slug).map((o:{event_slug:string;order_number:string;status:string;amount:number})=>[o.event_slug,{order_number:o.order_number,status:o.status,amount:Number(o.amount||0)}])));}})];void Promise.all(tasks).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setRouteLoading(false);});}return()=>{active=false;};},[path,authed]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(message){showToast(ui(locale,message),'success');setMessage('');}},[message,locale,showToast]);
 useEffect(()=>{if(error){showToast(ui(locale,error),'error');setError('');}},[error,locale,showToast]);
 useEffect(()=>{if(route==='ticket'&&demoMode)QRCode.toDataURL('ROUNDY-DEMO-NOT-A-VALID-TICKET',{width:280,margin:2,color:{dark:'#20211f',light:'#fffefa'}}).then(setQr);},[route]);
 useEffect(()=>{
  const detectBrowserLocale=():Locale=>{
   const preferred=(navigator.languages?.[0]??navigator.language??'en').toLowerCase();
   return preferred==='ko'||preferred.startsWith('ko-')?'ko':'en';
  };
  const applyPreferredLocale=()=>{
   try{
    const saved=localStorage.getItem('roundy-locale');
    if(saved==='en'||saved==='ko'){setLocale(saved);return;}
   }catch{/* Browser locale remains available if storage is blocked. */}
   setLocale(detectBrowserLocale());
  };
  applyPreferredLocale();
  window.addEventListener('languagechange',applyPreferredLocale);
  return()=>window.removeEventListener('languagechange',applyPreferredLocale);
 },[]);
 useEffect(()=>{document.documentElement.lang=locale;},[locale]);
 const verified=demoMode||['verified','approved'].includes(state.verification.toLowerCase());
 const reviewPending=!verified&&state.verification.toLowerCase()==='reviewing';
 const eligibleToApply=profileComplete(p)&&verified;
 function goApply(e:Event){if(!authed){router.push('/signin/'+e.slug);return;}if(!profileComplete(p)){router.push('/onboarding/basics/'+e.slug);return;}if(!verified){router.push('/onboarding/verification/'+e.slug);return;}setCheckoutTermsAccepted(false);setPriceQuote(null);router.push('/checkout/'+e.slug);}
 async function confirmRegistration(){const e=consentEvent;if(!e||!consentCancellation||!consentTerms)return;await work(async()=>{if(demoMode){setState(s=>({...s,booked:{...s.booked,[e.slug]:true}}));setConsentEvent(null);router.push('/me/events');return;}try{await api('bookings',{eventId:e.id,termsAccepted:true});setState(s=>({...s,booked:{...s.booked,[e.slug]:true}}));setConsentEvent(null);await Promise.all([refreshEvents(),refreshCredits()]);router.push('/me/events');}catch(err){if(err instanceof Error&&err.message==='No valid ticket available'){setConsentEvent(null);router.push('/checkout/'+e.slug);return;}throw err;}});}
 async function deleteAccount(){if(deleteAccountConfirm!=='delete account')return;await work(async()=>{if(demoMode){setDeleteAccountOpen(false);setDeleteAccountConfirm('');setState(initial);router.push('/');return;}await api('account',{confirmation:deleteAccountConfirm},'DELETE');try{await createClient().auth.signOut({scope:'local'});}catch{/* The Auth user has already been removed server-side. */}setDeleteAccountOpen(false);setDeleteAccountConfirm('');setState(initial);setAuthed(false);setIsAdmin(false);router.push('/');router.refresh();});}
 async function refreshEvents(){if(!demoMode){const d=await api('events');setEvents(Array.isArray(d.events)?d.events.filter(isRoundyEvent):[]);}}
 async function refreshCredits(){if(demoMode){setTicketBalance(0);return;}const d=await api('credits');setTicketBalance(Math.max(0,Number(d.balance)||0));}
 async function refreshEventAttendees(e:Event){if(demoMode)return;try{const d=await api('events/'+e.id+'/attendees');setAttendeesByEvent(prev=>({...prev,[e.id]:d.attendees as EventAttendees}));}catch{/* Event counts remain available even if attendee previews cannot load. */}}
 async function cancelBooking(e:Event){if(!window.confirm(tr(locale,'Cancel your registration for this event? Applied discounts and promo/referral benefits are not reissued after cancellation.','이 이벤트 등록을 취소할까요? 적용된 할인과 프로모션/추천 혜택은 취소 후 다시 지급되지 않습니다.')))return;await work(async()=>{if(demoMode){setState(prev=>{const booked={...prev.booked};delete booked[e.slug];return {...prev,booked};});flash(tr(locale,'Registration cancelled.','등록이 취소되었습니다.'));return;}await api('bookings',{eventId:e.id},'DELETE');setState(prev=>{const booked={...prev.booked};delete booked[e.slug];return {...prev,booked};});await Promise.all([refreshEvents(),refreshEventAttendees(e),refreshCredits()]);flash(tr(locale,'Registration cancelled.','등록이 취소되었습니다.'));});}
 async function saveProfile(){if(!demoMode){const result=await api('profile',p,'PUT');if(typeof result.verification==='string')setState(s=>({...s,verification:result.verification}));}}
 async function persistPhotos(photos:string[]){if(!demoMode)await api('profile',{...p,photos},'PUT');patchProfile({photos});}
 function discountCodeMessage(reason:string){if(reason==='self')return tr(locale,"You can't use your own referral code.","본인의 추천 코드는 사용할 수 없어요.");if(reason==='already_redeemed')return tr(locale,'This account has already used its referral discount.','이 계정에서는 이미 추천 할인을 사용했어요.');return tr(locale,'Invalid, expired or unavailable discount code.','유효하지 않거나 만료되었거나 사용할 수 없는 할인 코드예요.');}
 async function generateReferralCode(){await work(async()=>{if(demoMode){setMyReferralCode('RNDY26');flash(tr(locale,'Preview referral code created.','미리보기 추천 코드가 생성되었어요.'));return;}const d=await api('referral',{},'POST');const code=String(d.referralCode??'');if(!code)throw new Error(tr(locale,'Could not create a referral code.','추천 코드를 만들 수 없어요.'));setMyReferralCode(code);flash(tr(locale,'Referral code created.','추천 코드가 생성되었어요.'));});}
 async function shareReferralCode(){if(!myReferralCode)return;const url=`https://roundy.team/payment?ref=${encodeURIComponent(myReferralCode)}`;const text=`Roundy Referral Code: ${url}`;if(typeof navigator.share==='function'){try{await navigator.share({title:'Roundy Referral Code',text});return;}catch(e){if(e instanceof DOMException&&e.name==='AbortError')return;}}try{await navigator.clipboard.writeText(text);flash(tr(locale,'Referral link copied.','추천 링크가 복사되었어요.'));}catch{setError(tr(locale,'Could not share the referral code.','추천 코드를 공유하지 못했어요.'));}}
 function demoPriceQuote(e:Event,code:string):PriceQuote{const gender=p.gender==='female'?'female':'male';const original=gender==='female'?29000:49000;const counts=attendeesByEvent[e.id];const male=counts?.men_count??0;const female=counts?.women_count??0;const same=gender==='male'?male:female;const opposite=gender==='male'?female:male;const balance=same+2<=opposite?Math.round(original*.10):0;const hours=(Date.parse(e.starts_at)-Date.now())/3600000;const timeKind:PriceQuote['time_discount_kind']=hours>=240?'early_bird':hours>0&&hours<=72?'last_minute':'none';const time=timeKind==='none'?0:Math.round(original*.05);const normalized=code.trim().toUpperCase();const referral=normalized==='FRIEND'?Math.round(original*.10):0;const promo=normalized==='PROMO20'?Math.round(original*.20):0;const codeValid=referral>0||promo>0;const total=balance+time+referral+promo;return {event_id:e.id,gender,original_amount:original,code:normalized||null,code_kind:referral?'referral':promo?'promo':'none',code_valid:codeValid,code_reason:normalized&&!codeValid?'invalid':codeValid?'valid':'none',code_discount_percent:referral?10:promo?20:0,referral_discount_amount:referral,promo_discount_amount:promo,gender_balance_discount_amount:balance,gender_balance_applied:balance>0,time_discount_amount:time,time_discount_kind:timeKind,boomerang_discount_amount:0,boomerang_applied:false,total_discount_amount:total,total_discount_percent:Math.round(total*100/original),final_amount:original-total,male_count:male,female_count:female,hours_to_start:hours};}
 async function loadPriceQuote(e:Event,code:string){const normalized=code.trim().toUpperCase();const quote:PriceQuote=demoMode?demoPriceQuote(e,normalized):(await api('checkout/quote',{eventId:e.id,code:normalized})).quote;setPriceQuote(quote);if(quote.locked)setCheckoutCode(String(quote.code??''));return quote;}
 async function applyDiscountCode(){if(!event||priceQuote?.locked)return;await work(async()=>{const quote=await loadPriceQuote(event,checkoutCode);if(checkoutCode.trim()&&quote.code_valid)flash(quote.code_kind==='promo'?tr(locale,'Promo discount applied.','프로모션 할인이 적용되었어요.'):tr(locale,'Referral discount applied.','추천 할인이 적용되었어요.'));});}
 async function abandonPayment(e:Event){await work(async()=>{if(demoMode){setPriceQuote(null);return;}await api('checkout',{action:'abandon',eventId:e.id});setPendingPayments(prev=>{const next={...prev};delete next[e.slug];return next;});setPriceQuote(null);setCheckoutTermsAccepted(false);await Promise.all([refreshEvents(),refreshEventAttendees(e)]);await loadPriceQuote(e,checkoutCode);flash(tr(locale,'The unpaid payment request was cancelled. Your seat is no longer held.','미결제 결제 요청을 취소했어요. 이제 좌석은 보류되지 않습니다.'));});}
 async function payForEvent(e:Event){await work(async()=>{if(demoMode){setState(s=>({...s,booked:{...s.booked,[e.slug]:true}}));router.push('/me/events');return;}const entered=checkoutCode.trim().toUpperCase();const effectiveCode=priceQuote?.locked?String(priceQuote.code??''):entered;if(!priceQuote?.locked&&entered&&priceQuote&&priceQuote.code!==entered)throw new Error(tr(locale,'Apply the discount code before paying.','결제 전에 할인 코드를 적용해 주세요.'));if(!priceQuote?.locked&&entered&&priceQuote&&priceQuote.code_valid!==true)throw new Error(discountCodeMessage(priceQuote.code_reason));const payment=await api('checkout',{action:'create',eventId:e.id,code:effectiveCode||undefined,termsAccepted:checkoutTermsAccepted});if(payment.completed===true){setState(s=>({...s,booked:{...s.booked,[e.slug]:true}}));setPendingPayments(prev=>{const next={...prev};delete next[e.slug];return next;});setPriceQuote(null);setCheckoutTermsAccepted(false);await Promise.all([refreshEvents(),refreshEventAttendees(e)]);router.push('/me/events');flash(tr(locale,'Registration confirmed.','참가가 확정되었어요.'));return;}const paymentUrl=String(payment.paymentUrl??'');if(!/^https:\/\/(?:[a-z0-9-]+\.)?payapp\.kr(?:\/|$)/i.test(paymentUrl))throw new Error(tr(locale,'Could not open the secure PayApp payment page. Please try again.','안전한 PayApp 결제 페이지를 열지 못했어요. 다시 시도해 주세요.'));window.location.assign(paymentUrl);});}
 const nav=[{href:'/discover',text:tr(locale,'Discover','둘러보기'),icon:Compass,on:['home','discover'].includes(route)},{href:'/events',text:tr(locale,'Events','모임'),icon:CalendarDays,on:route==='events'},{href:'/matches',text:tr(locale,'Matches','매칭'),icon:MessageCircle,on:route==='matches'},{href:'/me',text:tr(locale,'Profile','프로필'),icon:UserRound,on:route==='me'&&path!=='me/events'}];

 let content:ReactNode;
 let wizardHeader:ReactNode=null;
 if(route==='home'||route==='discover')content=<LandingPage events={publicEvents} locale={locale} attendeesByEvent={attendeesByEvent} publicRosters={publicRosters}/>;
 else if(route==='payment'&&parts[1]==='result')content=<><Card label={tr(locale,'SECURE PAYMENT','안전한 결제')} title={tr(locale,'Finishing your payment','결제를 확인하고 있어요')}>{tr(locale,'Roundy is waiting for PayApp’s server confirmation before it confirms your seat.','Roundy가 PayApp의 서버 확인을 받은 뒤에만 자리를 확정합니다.')}</Card><Note>{tr(locale,'If this page does not finish after a payment attempt, do not pay again. Check My Events first or contact Roundy support.','결제 시도 후 이 화면에서 진행되지 않더라도 다시 결제하지 마세요. 먼저 내 모임을 확인하거나 Roundy 고객지원에 문의해 주세요.')}</Note></>;
 else if(route==='payment')content=<><section className="intro payment-referral-intro"><p className="eyebrow">{tr(locale,'EVENT CHECKOUT','모임 결제')}</p><Heading level={1}>{tr(locale,'Choose an event','모임을 선택하세요')}</Heading><p>{/^[A-Z0-9_-]{4,24}$/.test(referralParam)?tr(locale,`Referral code ${referralParam} is ready and will be filled in automatically at checkout.`,`추천 코드 ${referralParam}가 준비되었습니다. 결제 화면에 자동으로 입력됩니다.`):tr(locale,'Choose an event, then review your live price and optional discount code at checkout.','모임을 고른 뒤 결제 화면에서 실시간 가격과 선택 할인 코드를 확인하세요.')}</p></section><div className="event-grid">{publicEvents.map(e=><EventCard key={e.id} e={e} locale={locale} attendees={attendeesByEvent[e.id]} href={'/events/'+e.slug+(/^[A-Z0-9_-]{4,24}$/.test(referralParam)?'?ref='+encodeURIComponent(referralParam):'')}/>)}</div>{publicEvents.length===0&&<Empty title={tr(locale,'New events are on their way.','다음 모임을 준비하고 있어요.')} body={tr(locale,'Check back soon for an event where you can use your referral code.','추천 코드를 사용할 수 있는 모임이 열리면 여기에서 확인할 수 있어요.')}/>}</>;
 else if(route==='events'&&!event){
  const now=Date.now();
  const nativeCategoryEvents=publishedEvents;
  const nativeUpcoming=nativeCategoryEvents.filter(e=>Date.parse(e.starts_at)>=now&&e.seats_remaining>0).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
  const nativePast=nativeCategoryEvents.filter(e=>Date.parse(e.starts_at)<now).sort((a,b)=>Date.parse(b.starts_at)-Date.parse(a.starts_at));
  const upcomingCards=nativeUpcoming.map(e=><EventCard key={e.id} e={e} locale={locale} attendees={attendeesByEvent[e.id]}/>);
  const pastCards=nativePast.map(e=><EventCard key={e.id} e={e} locale={locale} attendees={attendeesByEvent[e.id]} past/>);
  const hasUpcoming=upcomingCards.length>0;
  const hasPast=pastCards.length>0;
  content=<>
   {hasUpcoming&&<section className="event-history-section"><Heading level={2} className="event-history-title">{tr(locale,'Upcoming events','예정된 모임')}</Heading><div className="event-grid">{upcomingCards}</div></section>}
   {hasPast&&<section className="event-history-section past-events-section"><Heading level={2} className="event-history-title">{tr(locale,'Past events','지난 모임')}</Heading><p className="event-history-caption">{tr(locale,'A look back at rooms we have already hosted.','지금까지 라운디에서 열렸던 모임들을 둘러보세요.')}</p><div className="event-grid">{pastCards}</div></section>}
   {!hasUpcoming&&!hasPast&&<Empty title={tr(locale,'New events are on their way.','다음 모임을 준비하고 있어요.')} body={tr(locale,'Check back soon for newly published events.','새로운 모임을 준비하고 있어요. 곧 다시 확인해 주세요.')}/>}
  </>;
 } else if(route==='events'&&event){
  const item=localizeEvent(event,locale);
  const duration=event.duration_minutes??Math.round((Date.parse(event.ends_at)-Date.parse(event.starts_at))/60000);
  const registrationClosed=Date.parse(event.starts_at)<=Date.now()||event.seats_remaining<1;
  const cancellationLocked=Date.now()>=Date.parse(event.starts_at)-((event.lockdown_minutes??0)*60000);
  const alreadyBooked=Boolean(state.booked[event.slug]);
  const rosterInfo=publicRosters[event.id]??{women:[],men:[],women_count:0,men_count:0,total:0,updated_at:null};
  const genderCapacity=Math.floor(event.capacity/2);
  const rosterGroups=[
   {key:'women',label:tr(locale,'Ladies','여성'),entries:rosterInfo.women,count:rosterInfo.women_count,tone:'women'},
   {key:'men',label:tr(locale,'Gents','남성'),entries:rosterInfo.men,count:rosterInfo.men_count,tone:'men'}
  ] as const;
  content=<>
   <div className="detail-photo"><Image src={event.image||'/images/yeouido.webp'} alt={event.title} fill sizes="(max-width: 640px) 100vw, 800px" priority/></div>
   {(event.images?.length??0)>1&&<div className="event-gallery">{event.images?.slice(1).map(src=><Image key={src} src={src} alt={event.title} width={360} height={240} unoptimized/>)}</div>}
   <section className="event-detail-copy"><EventCategoryBadges category={categoryLabel(event,locale)} requirements={event.nationality_requirements} locale={locale}/><Heading level={1}>{headline(item.title)}</Heading></section>
   <div className="detail-facts">
    <div className="event-fact"><span className="fact-icon"><UsersRound size={20}/></span><span className="fact-copy"><b>{tr(locale,'Age range','연령')}</b><span>{event.age_min}–{event.age_max}</span></span></div>
    <NationalityFact requirements={event.nationality_requirements} locale={locale}/>
    <div className="event-fact"><span className="fact-icon"><CalendarDays size={20}/></span><span className="fact-copy"><b>{tr(locale,'Time','시간')}</b><span>{dateLabelForLocale(event.starts_at,locale)} · {timeLabelForLocale(event.starts_at,locale)} – {timeLabelForLocale(event.ends_at,locale)} KST</span></span></div>
    <div className="event-fact"><span className="fact-icon"><Clock3 size={20}/></span><span className="fact-copy"><b>{tr(locale,'Duration','진행 시간')}</b><span>{duration}{tr(locale,' minutes','분')}</span></span></div>
    <VenueFact venue={item.venue} address={item.address} description={event.venue_description} locale={locale}/>
   </div>
   <VenueMap venue={item.venue} address={item.address} latitude={event.latitude} longitude={event.longitude} locale={locale}/>
   <Card label={tr(locale,'BEFORE YOU APPLY','참여 전 확인')}><ul className="before-apply"><li className="lockdown-notice">{lockdownNotice(event.lockdown_minutes??0,locale)} <Link href="/refund-policy">{tr(locale,'Refund Policy','환불 규정')}</Link></li><li>{tr(locale,'Comfortable with short conversations in Korean or English','한국어 또는 영어로 짧은 대화를 편하게 나눌 수 있어야 해요')}</li><li>{tr(locale,'Bring photo ID and arrive 15 minutes early','사진이 있는 신분증을 지참하고 15분 일찍 도착해 주세요')}</li><li>{tr(locale,'Only mutual choices become a match','서로 선택해야 매칭돼요')}</li></ul></Card>
   {item.description?.trim()&&<p className="event-description">{item.description}</p>}
   <section className="public-roster">
    <header className="public-roster-heading">
     <Heading level={2}>{tr(locale,'Participants','참가자')}</Heading>
    </header>
    <div className="public-roster-groups">
     {rosterGroups.map(group=><section className={'public-roster-group '+group.tone} key={group.key}>
      <div className="public-roster-group-head"><Heading level={3}>{group.label}</Heading><span className="public-roster-seat-tab">{group.count}/{genderCapacity} {tr(locale,'Seats Taken','좌석 확정')}</span></div>
      {group.entries.length?<div className="public-roster-grid">{group.entries.map((entry,index)=><div className="public-roster-chip" key={group.key+'-'+index}><span className="public-roster-dot" aria-hidden="true"/><span>{ageBandLabel(entry.age_band,locale)}</span><i aria-hidden="true"/><span>{jobGroupLabel(entry.job_group,locale)}</span></div>)}</div>:<p className="public-roster-empty">{tr(locale,'No confirmed participants yet.','아직 확정된 참가자가 없어요.')}</p>}
     </section>)}
    </div>
    <div className="public-roster-privacy"><ShieldCheck size={18}/><span>{tr(locale,'Names, exact ages, workplaces, photos and contact information are never included in this public list.','이 공개 명단에는 이름, 정확한 나이, 직장명, 사진, 연락처를 표시하지 않습니다.')}</span></div>
    {rosterInfo.updated_at&&<p className="public-roster-updated">{tr(locale,'Last updated','최근 업데이트')} · {rosterUpdatedLabel(rosterInfo.updated_at,locale)}</p>}
   </section>
   <div className="sticky-action">{alreadyBooked?<Button secondary disabled={busy||cancellationLocked} onClick={()=>void cancelBooking(event)}>{cancellationLocked?tr(locale,'Cancellation locked','취소 마감'):tr(locale,'Cancel registration','등록 취소')}</Button>:<Button disabled={registrationClosed} onClick={()=>goApply(event)}>{registrationClosed?tr(locale,'Event closed','신청 마감'):!eligibleToApply?tr(locale,'Complete Profile to Join','프로필을 완성하고 참여하기'):tr(locale,'Apply for this event','이 모임 신청하기')}</Button>}</div>
  </>;
 } else if(route==='reset-password')content=<ResetPassword locale={locale}/>;
 else if(route==='signin')content=<SignIn eventSlug={parts[1]} locale={locale}/>;
 else if(route==='profile'&&parts[1]==='review-submitted'){
  const approved=verified;
  content=<section className={'profile-review-screen '+(approved?'approved':'reviewing')}>
   <NotoAnimatedEmoji codepoint={approved?'1f389':'23f3'} fallback={approved?'🎉':'⏳'} size={112}/>
   <p className="eyebrow">{approved?tr(locale,'PROFILE APPROVED','프로필 승인 완료'):tr(locale,'PROFILE REVIEW','프로필 검토')}</p>
   <Heading level={1}>{approved?tr(locale,'You’re approved','프로필이 승인됐어요'):tr(locale,'Profile submitted for review','프로필 검토를 요청했어요')}</Heading>
   <p className="profile-review-lead">{approved?tr(locale,'Your profile is ready. You can now join eligible Roundy events.','프로필 준비가 끝났어요. 이제 참여 가능한 Roundy 모임에 바로 참여할 수 있어요.'):tr(locale,'We’ll review your profile and verification details. You can browse events while you wait, and event joining unlocks after approval.','Roundy 팀이 프로필과 인증 정보를 확인합니다. 기다리는 동안 이벤트를 둘러볼 수 있고, 승인 후 이벤트 참여가 열려요.')}</p>
   <div className="profile-review-progress" aria-label={tr(locale,'Profile review progress','프로필 검토 진행 상태')}>
    <div className="done"><CircleCheck size={18}/><span><b>{tr(locale,'Submitted','제출 완료')}</b><small>{tr(locale,'Profile received','프로필 접수')}</small></span></div>
    <div className={approved?'done':'current'}>{approved?<CircleCheck size={18}/>:<Clock3 size={18}/>}<span><b>{tr(locale,'Reviewing','검토 중')}</b><small>{tr(locale,'Profile + verification','프로필 + 본인 확인')}</small></span></div>
    <div className={approved?'done':''}>{approved?<CircleCheck size={18}/>:<ShieldCheck size={18}/>}<span><b>{tr(locale,'Approved','승인')}</b><small>{tr(locale,'Ready to join','참여 가능')}</small></span></div>
   </div>
   {!approved&&<p className="profile-review-note">{tr(locale,'No action is needed right now. Your latest review status will appear in My Profile.','지금은 따로 할 일이 없어요. 최신 검토 상태는 내 프로필에서 확인할 수 있어요.')}</p>}
   <div className="profile-review-actions"><Button href="/onboarding/basics">{tr(locale,'Edit profile','프로필 수정하기')}</Button><Button secondary href="/events">{tr(locale,'Browse events','모임 둘러보기')}</Button></div>
  </section>;
 }
 else if(route==='onboarding'){
 const steps=['basics','photos','work','interests','contact','verification','lifestyle'];const step=steps.indexOf(parts[1]);
 const onboardingStepPath=(stepName:string)=>'/onboarding/'+stepName+(slug?'/'+slug:'');
 const onboardingMoments=[
  {codepoint:'1f44b',fallback:'👋',title:tr(locale,'A few basics','기본 정보'),body:tr(locale,'Your legal name stays private until a mutual match.','실명은 상호 매칭이 되기 전까지 다른 참가자에게 공개되지 않아요.')},
  {codepoint:'1f4f8',fallback:'📸',title:tr(locale,'Show the real you','나를 잘 보여주는 사진'),body:tr(locale,'Add 1–3 recent photos that look clearly and honestly like you.','최근 사진을 1~3장 추가해 주세요. 자연스럽고 알아보기 쉬운 사진이면 좋아요.')},
  {codepoint:'1f4bc',fallback:'💼',title:tr(locale,'A little context','나를 조금 더 알려주세요'),body:tr(locale,'We show only a general description of your work. Exact details stay private.','직업은 대략적인 정보만 보여주며 구체적인 정보는 비공개로 유지돼요.')},
  {codepoint:'2728',fallback:'✨',title:tr(locale,'What are you into?','요즘 무엇에 관심 있나요?'),body:tr(locale,'Pick at least 3 interests, up to 10. Small details make introductions easier.','관심사를 3개 이상 골라 주세요. 공통 관심사가 있으면 첫 대화도 한결 편해져요.')},
  {codepoint:'1f510',fallback:'🔐',title:tr(locale,'Private by default','연락처는 기본 비공개'),body:tr(locale,'Only mutual matches receive your name and phone number.','이름과 전화번호는 서로 매칭된 상대에게만 공개돼요.')},
  {codepoint:'2705',fallback:'✅',title:tr(locale,'Verify your profile','프로필 인증'),body:tr(locale,'Choose one way to verify your identity. We review it before your profile is approved.','본인 확인 방법을 하나 선택해 주세요. 프로필 승인 전에 Roundy가 직접 확인해요.')},
  {codepoint:'1f331',fallback:'🌱',title:tr(locale,'Lifestyle & values','라이프스타일과 가치관'),body:tr(locale,'These final questions are optional. Share only what you are comfortable with.','마지막 질문은 모두 선택 사항이에요. 편한 만큼만 알려주세요.')}
 ];
 const onboardingMoment=onboardingMoments[Math.max(0,step)]??onboardingMoments[0];
 async function next(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=new FormData(e.currentTarget);await work(async()=>{if(step===0&&(!p.gender||!isAtLeastAge(p.birth_date)))throw new Error(tr(locale,`You must be ${MINIMUM_AGE} or older and select a gender.`,`만 ${MINIMUM_AGE}세 이상이어야 하며 성별을 선택해야 합니다.`));if(step===1&&p.photos.length<1)throw new Error(tr(locale,'Please add at least one photo.','사진을 최소 1장 추가해 주세요.'));if(step===3&&p.interests.length<3)throw new Error(tr(locale,'Choose at least 3 interests.','관심사를 최소 3개 선택해 주세요.'));await saveProfile();if(step===5){if(!demoMode)await api('verification',Object.fromEntries(form.entries()));setState(s=>({...s,verification:'Reviewing'}));router.push(onboardingStepPath(steps[step+1]));}else if(step===6)router.push('/profile/review-submitted'+(slug?'/'+slug:''));else router.push(onboardingStepPath(steps[step+1]));});}
 wizardHeader=<header className="wizard-header"><div className="wizard-header-inner"><button className="icon-button" aria-label={tr(locale,'Previous step','이전 단계')} onClick={()=>step>0?router.push(onboardingStepPath(steps[step-1])):router.push('/events')}><ArrowLeft size={20}/></button><span>{tr(locale,'PROFILE','프로필')} {step+1} / 7</span><button type="button" className="save-leave" disabled={busy} onClick={()=>void work(async()=>{await saveProfile();router.push('/me');})}>{tr(locale,'Save & leave','저장 후 나가기')}</button></div><progress max={7} value={step+1} aria-label={tr(locale,'Profile progress','프로필 작성 진행률')}/></header>;
 content=<><section className="onboarding-emoji-intro"><NotoAnimatedEmoji codepoint={onboardingMoment.codepoint} fallback={onboardingMoment.fallback} size={72}/><div><p className="eyebrow">{tr(locale,'PROFILE SETUP','프로필 설정')}</p><Heading level={1}>{onboardingMoment.title}</Heading><p>{onboardingMoment.body}</p></div></section><form onSubmit={next}>
 {step===0&&<><Field label={tr(locale,'FULL LEGAL NAME','실명')}><input autoComplete="name" required value={p.full_name} onChange={e=>patchProfile({full_name:e.target.value})} placeholder={tr(locale,'Your name as shown on ID','신분증에 기재된 이름')}/></Field><Field label={tr(locale,'DATE OF BIRTH','생년월일')}><input type="date" required value={p.birth_date} onChange={e=>patchProfile({birth_date:e.target.value})}/></Field><fieldset><legend>{tr(locale,'Gender','성별')}</legend><div className="chips">{[['female','Woman'],['male','Man']].map(([v,l])=><button type="button" className={'chip '+(p.gender===v?'selected':'')} aria-pressed={p.gender===v} onClick={()=>patchProfile({gender:v})} key={v}><span aria-hidden="true">{v==='female'?'👩':'👨'}</span><span>{v==='female'?tr(locale,'Woman','여성'):tr(locale,'Man','남성')}</span></button>)}</div></fieldset><Field label={tr(locale,'NATIONALITY','국적')}><NationalitySelect value={p.nationality} onChange={nationality=>patchProfile({nationality})} locale={locale}/></Field></>}
 {step===1&&<><div className="photo-grid">{p.photos.map((photo,i)=><div className={'profile-photo '+(i===0?'primary-photo':'')} key={photo}>{photo==='sample-avatar'?<UserRound size={64}/>:<Image src={photo} alt={tr(locale,'Your photo ','내 사진 ')+(i+1)} fill unoptimized sizes="200px"/>}<span>{i===0?tr(locale,'Main photo','대표 사진'):tr(locale,'Photo ','사진 ')+(i+1)}</span><button aria-label={tr(locale,'Remove photo ','사진 삭제 ')+(i+1)} className="photo-remove" type="button" onClick={()=>void work(()=>persistPhotos(p.photos.filter((_,j)=>j!==i)))}><X size={16}/></button>{i>0&&<button className="make-main" type="button" onClick={()=>void work(()=>persistPhotos([photo,...p.photos.filter((_,j)=>j!==i)]))}>{tr(locale,'Make main','대표 사진으로 설정')}</button>}</div>)}{p.photos.length<3&&<label className="photo-add"><Plus size={32}/><span>{p.photos.length<2?tr(locale,'Add photos','사진 추가하기'):tr(locale,'Add photo','사진 추가')}</span><input type="file" accept="image/*" multiple onChange={e=>{const originals=Array.from(e.target.files??[]).slice(0,3-p.photos.length);e.currentTarget.value='';if(!originals.length)return;void work(async()=>{const next=[...p.photos];for(const original of originals){const file=await compressProfilePhoto(original);if(demoMode){next.push(await fileToDataUrl(file));}else{const form=new FormData();form.set('photo',file);const r=await fetch('/api/photos',{method:'POST',body:form});const data=await r.json();if(!r.ok)throw new Error(data.error);next.push(data.url);}}if(demoMode)patchProfile({photos:next});else await persistPhotos(next);});}}/></label>}</div><Note>{tr(locale,'No group photos or heavy filters. Use a recent, recognizable picture. Large images are automatically resized and compressed before upload.','단체 사진이나 과도한 필터는 피하고, 최근의 알아보기 쉬운 사진을 사용해 주세요. 큰 이미지는 업로드 전에 자동으로 크기가 조정되고 압축됩니다.')}</Note></>}
 {step===2&&<><Field label={tr(locale,'HEIGHT (CM)','키 (CM)')}><input type="number" min={100} max={250} required value={p.height_cm} onChange={e=>patchProfile({height_cm:Number(e.target.value)})}/></Field><Field label={tr(locale,"MBTI (OPTIONAL)","MBTI (선택)")}><select value={p.mbti??''} onChange={e=>patchProfile({mbti:e.target.value})}><option value="">{tr(locale,"Not selected / Not sure","선택 안 함 / 잘 모르겠어요")}</option>{mbtiTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></Field><Field label={tr(locale,'JOB TITLE','직업')}><input required value={p.job_title} onChange={e=>patchProfile({job_title:e.target.value})} placeholder={tr(locale,'Product designer','프로덕트 디자이너')}/></Field><Field label={tr(locale,'WORKPLACE / SCHOOL','직장 또는 학교')}><input required value={p.workplace} onChange={e=>patchProfile({workplace:e.target.value})} placeholder={tr(locale,'Company or university','회사 또는 학교')}/></Field></>}
 {step===3&&<><Field label={tr(locale,'SEARCH INTERESTS','관심사 검색')}><span className="search-input"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr(locale,'What are you into?','어떤 것에 관심이 있나요?')}/></span></Field><InterestPicker selected={p.interests} onChange={interests=>patchProfile({interests})} query={query} locale={locale}/></>}
 {step===4&&<><Field label={tr(locale,'PRIVATE PHONE NUMBER','비공개 전화번호')}><input type="tel" inputMode="tel" required pattern="010-[0-9]{4}-[0-9]{4}" value={p.phone} onChange={e=>patchProfile({phone:formatKoreanPhone(e.target.value)})} placeholder="010-1234-5678"/></Field><label className="check-row"><input type="checkbox" required checked={p.contact_consent} onChange={e=>patchProfile({contact_consent:e.target.checked})}/><span>{tr(locale,'I agree to share my name and phone number with mutual matches after the event.','이벤트 후 서로 매칭된 상대에게 이름과 전화번호를 공유하는 데 동의합니다.')}</span></label><Card label={tr(locale,'ONLY WHEN IT’S MUTUAL','서로 매칭된 경우에만')} title={tr(locale,'Your contact details stay private.','연락처는 비공개로 유지돼요.')}>{tr(locale,'Sharing happens only after you both choose Yes. Once revealed, contact details cannot be revoked.','두 사람이 모두 Yes를 선택한 경우에만 공유돼요. 공개된 연락처는 회수할 수 없어요.')}</Card></>}
 {step===5&&<VerificationFields locale={locale}/>}
 {step===6&&<><Card label={tr(locale,'VOLUNTARY DISCLOSURE','선택 정보')} title={tr(locale,'Share only what you are comfortable with.','편한 만큼만 알려주세요.')}>{tr(locale,'Every answer on this page is optional. Skipping them does not affect profile completion or verification.','이 페이지의 모든 항목은 선택 사항이에요. 답하지 않아도 프로필 완성이나 인증에 영향을 주지 않아요.')}</Card><Field label={tr(locale,'SMOKING','흡연')}><select value={p.smoking_frequency} onChange={e=>patchProfile({smoking_frequency:e.target.value})}><option value="">{tr(locale,'Skip / Prefer not to say','건너뛰기 / 응답하지 않음')}</option>{[['never','Never','피우지 않음'],['socially','Socially / occasionally','가끔, 모임에서만'],['sometimes','Sometimes','종종 피움'],['daily','Daily','매일 피움']].map(([v,en,ko])=><option key={v} value={v}>{tr(locale,en,ko)}</option>)}</select></Field><Field label={tr(locale,'ALCOHOL','음주')}><select value={p.alcohol_frequency} onChange={e=>patchProfile({alcohol_frequency:e.target.value})}><option value="">{tr(locale,'Skip / Prefer not to say','건너뛰기 / 응답하지 않음')}</option>{[['never','Never','마시지 않음'],['rarely','Rarely','거의 마시지 않음'],['socially','Socially / occasionally','가끔, 모임에서'],['weekly','About once a week','주 1회 정도'],['frequently','Two or more times a week','주 2회 이상']].map(([v,en,ko])=><option key={v} value={v}>{tr(locale,en,ko)}</option>)}</select></Field><Field label={tr(locale,'RELIGION','종교')}><select value={p.religion} onChange={e=>patchProfile(e.target.value?{religion:e.target.value}:{religion:'',same_religion_importance:'',religion_consent:false})}><option value="">{tr(locale,'Skip / Prefer not to say','건너뛰기 / 응답하지 않음')}</option>{[['none','No religion','무교'],['christian_protestant','Protestant Christian','개신교'],['catholic','Catholic','천주교'],['buddhist','Buddhist','불교'],['muslim','Muslim','이슬람교'],['hindu','Hindu','힌두교'],['jewish','Jewish','유대교'],['other','Other','기타']].map(([v,en,ko])=><option key={v} value={v}>{tr(locale,en,ko)}</option>)}</select></Field><Field label={tr(locale,'SAME-RELIGION PARTNER PREFERENCE','상대방 동일 종교 선호 여부')}><select disabled={!p.religion} value={p.same_religion_importance} onChange={e=>patchProfile({same_religion_importance:e.target.value})}><option value="">{tr(locale,'Skip / Prefer not to say','건너뛰기 / 응답하지 않음')}</option>{[['not_important','Not important','중요하지 않음'],['nice_to_have','Nice to have','같으면 좋음'],['important','Important','중요함'],['essential','Must be the same','같아야 함']].map(([v,en,ko])=><option key={v} value={v}>{tr(locale,en,ko)}</option>)}</select></Field>{p.religion&&<label className="check-row"><input type="checkbox" required checked={p.religion_consent} onChange={e=>patchProfile({religion_consent:e.target.checked})}/><span>{tr(locale,'I agree that Roundy may process my religion for compatibility preferences. This optional answer is stored until I remove it or delete my account.','종교 정보를 상대 선호도 확인을 위해 처리하는 데 동의합니다. 선택 정보이며, 직접 삭제하거나 계정을 삭제할 때까지 보관됩니다.')}</span></label>}<Note>{tr(locale,'You can leave every field blank and continue.','모든 항목을 비워둔 채 계속해도 됩니다.')}</Note></>}
 <Button type="submit" disabled={busy}>{busy?tr(locale,'Saving…','저장 중…'):step===6?tr(locale,'Submit for review','검토 요청하기'):tr(locale,'Continue','계속')} {!busy&&<ArrowRight size={18}/>}</Button></form>{demoMode&&<button className="text-button" onClick={()=>{setState(s=>({...s,profile:sampleProfile}));flash(tr(locale,'Fictional sample profile loaded. You can edit it or continue.','가상 예시 프로필을 불러왔어요. 수정하거나 계속 진행하세요.'));}}>{tr(locale,'Fill with a fictional sample profile','가상 예시 프로필 불러오기')}</button>}</>;
 }
 else if(route==='applications'&&event){content=<><Card label={tr(locale,'DIRECT BOOKING','바로 예약')} title={localizeEvent(event,locale).title}>{tr(locale,'Applications are no longer required. Approved members continue to this event’s checkout and pay the live event price.','별도 참가 신청은 필요하지 않습니다. 승인된 회원은 해당 모임 결제로 이동해 실시간 모임 가격을 결제합니다.')}</Card><Button href={'/events/'+slug}>{tr(locale,'Back to event','모임으로 돌아가기')}</Button></>;}
 else if(route==='checkout'&&event){
  const quote=priceQuote;
  const enteredCode=checkoutCode.trim().toUpperCase();
  const quotedCode=String(quote?.code??'').trim().toUpperCase();
  const quoteMatchesCode=Boolean(quote)&&quotedCode===enteredCode;
  const item=localizeEvent(event,locale);
  const codeMessage=enteredCode?(quoteMatchesCode&&quote?(quote.code_valid?quote.code_kind==='promo'?tr(locale,'Promo code · '+quote.code_discount_percent+'% off','프로모션 코드 · '+quote.code_discount_percent+'% 할인'):tr(locale,'Referral code · 10% off','추천 코드 · 10% 할인'):discountCodeMessage(quote.code_reason)):tr(locale,'Tap Apply to update the price.','적용을 눌러 결제 금액을 업데이트해 주세요.')):'';
  const discounted=Boolean(quote&&quote.final_amount<quote.original_amount);
  const discountPercent=quote?Math.max(0,quote.total_discount_percent||Math.round((quote.original_amount-quote.final_amount)*100/Math.max(1,quote.original_amount))):0;
  const zeroCost=Boolean(quote&&quoteMatchesCode&&quote.final_amount===0);
  const submitDisabled=busy||!quote||!quoteMatchesCode||!checkoutTermsAccepted||Boolean(enteredCode&&!quote?.code_valid&&!quote?.locked);
  const amountRow=(label:string,amount:number)=><div className="checkout-amount-row discount"><span>{label}</span><strong>-₩{amount.toLocaleString()}</strong></div>;
  content=state.booked[slug]?<Empty title={tr(locale,'Your seat is already confirmed.','이미 자리가 확정됐어요.')} body={tr(locale,'This event is already saved in My Events.','이미 예약한 모임이에요.')} href="/me/events" label={tr(locale,'View My Events','내 모임 보기')}/>:!eligibleToApply?<><Card label={tr(locale,'PROFILE REQUIRED','프로필 필요')} title={tr(locale,'Complete your profile first.','먼저 프로필을 완성해 주세요.')}>{tr(locale,'Your profile and verification must be approved before you can reserve a seat.','좌석을 예약하려면 프로필과 본인 인증 승인이 필요해요.')}</Card><Button href={!profileComplete(p)?'/onboarding/basics/'+slug:'/onboarding/verification/'+slug}>{tr(locale,'Complete Profile','프로필 완성하기')}</Button></>:<div className="checkout-page">
   <section className="checkout-event-card">
    <div className="checkout-event-main">
     <div className="checkout-event-image"><Image src={event.image||'/images/yeouido.webp'} alt={item.title} fill sizes="104px"/></div>
     <div className="checkout-event-title"><span>{tr(locale,'EVENT','모임')}</span><Heading level={2}>{headline(item.title)}</Heading></div>
    </div>
    <div className="checkout-time-place">
     <Heading level={3}>{tr(locale,'Time & Place Reminder','시간 및 장소 안내')}</Heading>
     <div className="checkout-reminder-row"><span>{tr(locale,'Time','시간')}</span><strong>{dateLabelForLocale(event.starts_at,locale)} · {timeLabelForLocale(event.starts_at,locale)} KST</strong></div>
     <div className="checkout-reminder-row"><span>{tr(locale,'Location','장소')}</span><strong>{item.venue}</strong></div>
    </div>
   </section>

   <section className="checkout-section-card checkout-coupon-card">
    <Heading level={2}>{tr(locale,'Referral Code (Optional)','추천 코드 (선택)')}</Heading>
    <p className="checkout-referral-note">{tr(locale,'Referral and promo codes may have different usage limits. Standard referral discounts are single-use and are not restored after cancellation.','추천 코드와 프로모션 코드는 사용 조건이 다를 수 있습니다. 일반 추천 할인은 1회만 사용할 수 있으며 취소 후 복원되지 않습니다.')}</p>
    <div className="referral-entry"><input value={checkoutCode} maxLength={24} autoCapitalize="characters" autoCorrect="off" spellCheck={false} disabled={Boolean(quote?.locked)} placeholder={tr(locale,'Referral code','추천 코드')} onChange={e=>{setCheckoutCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24));setCheckoutTermsAccepted(false);}}/><button className="referral-apply" type="button" disabled={busy||Boolean(quote?.locked)||quoteMatchesCode} onClick={()=>void applyDiscountCode()}>{busy?tr(locale,'Applying…','적용 중…'):tr(locale,'Apply','적용')}</button></div>
    {quote?.locked&&<div className="checkout-payment-lock"><p className="referral-message pending">{tr(locale,'An unfinished PayApp request is locking this checkout. Cancel it before changing the discount code.','완료되지 않은 PayApp 결제 요청이 이 결제를 잠그고 있어요. 할인 코드를 변경하려면 먼저 미완료 결제 요청을 취소해 주세요.')}</p><Button secondary disabled={busy} onClick={()=>void abandonPayment(event)}>{tr(locale,'Cancel unfinished payment','미완료 결제 취소')}</Button></div>}
    {codeMessage&&<p className={'referral-message '+(quoteMatchesCode&&quote?.code_valid?'success':quoteMatchesCode?'error':'pending')}>{codeMessage}</p>}
   </section>

   <section className="checkout-section-card checkout-amount-card">
    <Heading level={2}>{tr(locale,'Payment Amount','결제 금액')}</Heading>
    {!quote?<div className="checkout-amount-loading">{tr(locale,'Calculating your event price…','모임 가격을 계산하고 있어요…')}</div>:<>
     <div className="checkout-amount-row"><span>{tr(locale,'Regular Price','정상가')}</span><strong>₩{quote.original_amount.toLocaleString()}</strong></div>
     <div className="checkout-discount-rows">
      {quote.referral_discount_amount>0&&amountRow(tr(locale,'Referral Discount (10%)','추천 할인 (10%)'),quote.referral_discount_amount)}
      {quote.promo_discount_amount>0&&amountRow(tr(locale,'Promo Discount ('+quote.code_discount_percent+'%)','프로모션 할인 ('+quote.code_discount_percent+'%)'),quote.promo_discount_amount)}
      {quote.gender_balance_discount_amount>0&&amountRow(tr(locale,'Gender Balance Discount (10%)','성비 균형 할인 (10%)'),quote.gender_balance_discount_amount)}
      {quote.time_discount_amount>0&&amountRow(quote.time_discount_kind==='early_bird'?tr(locale,'Early Bird (5%)','얼리버드 (5%)'):tr(locale,'Last-Minute Deal (5%)','마감 임박 할인 (5%)'),quote.time_discount_amount)}
      {quote.boomerang_discount_amount>0&&amountRow(tr(locale,'Boomerang Discount (5%)','재참여 할인 (5%)'),quote.boomerang_discount_amount)}
     </div>
     <div className="checkout-amount-row total"><span>{tr(locale,'Total','합계')}</span><div>{discounted&&discountPercent>0&&<span className="checkout-discount-badge">-{discountPercent}%</span>}<strong>₩{quote.final_amount.toLocaleString()}</strong></div></div>
    </>}
   </section>

   <section className="checkout-section-card checkout-method-card">
    <Heading level={2}>{tr(locale,'Payment Method','결제 수단')}</Heading>
    {zeroCost?<><div className="checkout-method-pill"><Check size={17}/><span>{tr(locale,'No payment required','결제 필요 없음')}</span></div><p>{tr(locale,'Your discount covers the full event price. Confirm below to reserve your seat.','할인이 모임 금액 전액에 적용되었습니다. 아래에서 확인하면 참가가 확정됩니다.')}</p></>:<><div className="checkout-method-pill"><LockKeyhole size={17}/><span>{tr(locale,'PayApp Secure Payment','PayApp 안전결제')}</span></div><p>{tr(locale,'Choose your supported card or payment method securely on PayApp in the next step.','다음 단계의 PayApp 화면에서 지원되는 카드 또는 결제수단을 선택합니다.')}</p></>}
   </section>

   <section className="checkout-consent-card">
    <Heading level={2}>{tr(locale,'Please Check','꼭 확인해 주세요')}</Heading>
    <div className="checkout-consent-body">
     <p>{tr(locale,'Please notify us as early as possible if you cannot attend.','참석이 어려워진 경우 가능한 한 빨리 알려주세요.')}</p>
     <Heading level={3}>{tr(locale,'Cancellation & Refund','취소 및 환불')}</Heading>
     <ul>
      <li>{lockdownNotice(event.lockdown_minutes??0,locale)}</li>
      <li>{tr(locale,'Cancel before lockdown and before check-in for a 100% refund of the amount actually paid. Refunds are unavailable after lockdown.','락다운 전에 참가를 취소하고 체크인 전이라면 실제 결제금액의 100%를 환불합니다. 락다운 이후에는 환불이 불가능합니다.')}</li>
      <li>{tr(locale,'Discounts and referral benefits are not restored after cancellation.','취소 후에는 할인이나 추천 혜택이 다시 지급되지 않습니다.')}</li>
     </ul>
    </div>
    <label className="checkout-consent-title"><input type="checkbox" checked={checkoutTermsAccepted} onChange={e=>setCheckoutTermsAccepted(e.target.checked)}/><span>{tr(locale,'I have fully read and acknowledge these terms.','위 내용을 모두 읽고 확인했으며 이에 동의합니다.')}</span></label>
   </section>

   {ticketBalance>0&&!quote?.locked&&<Button secondary disabled={busy||!checkoutTermsAccepted} onClick={()=>work(async()=>{await api('bookings',{eventId:event.id,termsAccepted:true});setState(s=>({...s,booked:{...s.booked,[slug]:true}}));await Promise.all([refreshEvents(),refreshCredits()]);router.push('/me/events');})}>{tr(locale,'Use legacy ticket credit ('+ticketBalance+')','기존 티켓 크레딧 사용 ('+ticketBalance+')')}</Button>}

   <div className="checkout-sticky-submit"><Button disabled={submitDisabled} onClick={()=>void payForEvent(event)}>{demoMode?tr(locale,'Preview event payment','모임 결제 미리보기'):zeroCost?<><span>{tr(locale,'Confirm participation','무료 참가 확정')}</span>{discounted&&discountPercent>0&&<span className="checkout-discount-badge">-{discountPercent}%</span>}</>:quote?locale==='ko'?<><span className="checkout-cta-korean"><strong>{quote.final_amount.toLocaleString()}원</strong>으로 참가하기</span>{discounted&&discountPercent>0&&<span className="checkout-discount-badge">-{discountPercent}%</span>}</>:<><span>Claim with</span><strong>₩{quote.final_amount.toLocaleString()}</strong>{discounted&&discountPercent>0&&<span className="checkout-discount-badge">-{discountPercent}%</span>}</>:tr(locale,'Continue to PayApp','PayApp으로 계속하기')}</Button></div>
  </div>;
 }
 else if(route==='ticket'&&event)content=!state.booked[slug]?<Empty title={tr(locale,'No confirmed booking yet.','아직 확정된 예약이 없어요.')} body={tr(locale,'Return to the event page to complete this event’s payment and confirm your seat.','이벤트 페이지에서 해당 모임 결제를 완료하고 좌석을 확정해 주세요.')} href={'/events/'+slug} label={tr(locale,'View event','모임 보기')}/>:<>{demoMode&&<div className="qr-card">{qr&&<Image src={qr} alt="Demo QR code, not a valid admission ticket" width={230} height={230}/>}<b>PREVIEW TICKET — NOT VALID FOR ENTRY</b></div>}<Card label={tr(locale,'BOOKING CONFIRMED','예약 확정')} title={dateLabelForLocale(event.starts_at,locale)+' · '+timeLabelForLocale(event.starts_at,locale)}>{localizeEvent(event,locale).venue}<br/>{tr(locale,'Arrive 15 minutes early and bring photo ID.','15분 일찍 도착하고 사진이 있는 신분증을 지참해 주세요.')}</Card><Note>{tr(locale,'Your booking is attached to your account. The host will verify your identity at check-in.','예약은 계정에 연결되어 있습니다. 체크인 시 호스트가 신원을 확인합니다.')}</Note>{demoMode&&<div className="demo-controls"><p>Event-night preview</p><Button onClick={()=>{setState(s=>({...s,checked:{...s.checked,[slug]:true}}));router.push('/event-night/'+slug);}}>Preview staff check-in</Button></div>}</>;
 else if(route==='event-night'&&event)content=<EventNight event={event} locale={locale}/>;
 else if(route==='matches')content=<MatchesScreen locale={locale}/>;
 else if(route==='me'){
 const sub=parts[1]??'';
 if(sub==='events'){const bookedEvents=events.filter(e=>state.booked[e.slug]);content=<div className="my-events-page"><FeedbackPrompt locale={locale}/><header className="subpage-heading"><p className="eyebrow">{tr(locale,'MY EVENTS','내 모임')}</p><Heading level={1}>{tr(locale,'Your confirmed plans','예정된 모임')}</Heading></header><div className="my-events-list">{bookedEvents.map(e=>{const item=localizeEvent(e,locale);return <section className="booking-ticket" key={e.id}><div className="booking-ticket-top"><span>{tr(locale,'BOOKING CONFIRMED','예약 확정')}</span><Check size={18}/></div><div className="booking-ticket-main"><Heading level={2}>{dateLabelForLocale(e.starts_at,locale)} · {timeLabelForLocale(e.starts_at,locale)}</Heading><p className="booking-ticket-venue"><MapPin size={17}/>{item.venue}</p></div><div className="booking-ticket-divider"/><div className="booking-ticket-notes"><p>{tr(locale,'Arrive 15 minutes early and bring photo ID.','15분 일찍 도착하고 사진이 있는 신분증을 지참해 주세요.')}</p><p>{tr(locale,'Your booking is attached to your account. The host will verify your identity at check-in.','예약은 계정에 연결되어 있습니다. 체크인 시 호스트가 신원을 확인합니다.')}</p></div>{eventCategory(e)==='1:1 Speed Mingle'&&<Link className="booking-ticket-action" href={'/event-night/'+e.slug}>{tr(locale,'Check-in QR & meetup mode','체크인 QR과 진행 화면')}<ArrowRight size={17}/></Link>}</section>;})}</div>{bookedEvents.length===0&&<Empty title={tr(locale,'No booked events yet.','아직 예약한 모임이 없어요.')} body={tr(locale,'Your confirmed bookings will appear here.','예약한 모임이 생기면 여기에 표시돼요.')} href="/events" label={tr(locale,'Find an event','모임 찾기')}/>}</div>;}
 else if(sub==='tickets'){content=<div className="ticket-balance-page">{ticketBalance>0&&<section className="ticket-balance-card"><div className="ticket-balance-ring"><div className="ticket-balance-inner"><strong>{ticketBalance}</strong><span>{tr(locale,ticketBalance===1?'legacy credit':'legacy credits','기존 크레딧')}</span></div></div><div className="ticket-balance-copy"><p className="eyebrow">{tr(locale,'LEGACY BALANCE','기존 잔액')}</p><Heading level={1}>{tr(locale,'Prepaid credits you already own','기존에 구매한 크레딧')}</Heading><p>{tr(locale,'Roundy no longer sells ticket packs. Existing prepaid credits remain available under their original terms.','Roundy는 더 이상 티켓 묶음을 판매하지 않습니다. 기존에 구매한 크레딧은 원래 조건에 따라 계속 사용할 수 있습니다.')}</p></div></section>}<Card label={tr(locale,'PAY PER EVENT','모임별 결제')} title={tr(locale,'No membership required','멤버십이 필요하지 않아요')}>{tr(locale,'New bookings are priced and paid separately for each event. The live price can include early-bird or last-minute timing, gender-balance, referral/promo and boomerang discounts.','새 예약은 모임별로 가격을 계산해 각각 결제합니다. 실시간 가격에는 얼리버드 또는 마감 임박, 성비 균형, 추천/프로모션, 재참여 할인이 적용될 수 있습니다.')}</Card><Button href="/events">{tr(locale,'Find an event','모임 찾기')}</Button></div>;}
 else if(sub==='verification')content=<><Card label={state.verification.toUpperCase()} title={state.verification==='Reviewing'?'We’re reviewing your account.':'Complete your verification'}>Social handles are never revealed to attendees. Changing your social account resets verification. Verification must clear before attending.</Card><Button href="/onboarding/verification/saturday-social">Update verification</Button></>;
 else if(sub==='safety')content=<><form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void work(async()=>{if(!demoMode)await api('reports',{reason:form.get('reason'),context:form.get('context'),kind:form.get('kind')});flash(demoMode?'Preview only. No report was sent.':'Your report was submitted for private review.');});}}><Field label={tr(locale,"SUBMISSION TYPE","접수 유형")}><select name="kind"><option value="report">{tr(locale,"Safety report","안전 신고")}</option><option value="feedback">{tr(locale,"Feedback / suggestion","피드백 / 제안")}</option></select></Field><Field label={tr(locale,"EVENT / CONTEXT","이벤트 / 관련 내용")}><input name="context" required maxLength={500} defaultValue={(searchParams.get("context")??"").slice(0,500)} placeholder="Event date and round or match"/></Field><Field label="WHAT HAPPENED?"><textarea name="reason" required minLength={10} placeholder="Describe your concern" rows={5}/></Field><Button type="submit" disabled={busy}>{tr(locale,"Submit privately","비공개로 제출하기")}</Button></form><Note>Harassment, intoxication, hate speech, unwanted contact, recording and sharing identities can lead to permanent removal. <Link href="/how-it-works">Read our safety principles.</Link></Note></>;
 else if(sub==='email'||sub==='password')content=<AccountSecurity locale={locale} mode={sub}/>;
 else if(sub==='settings')content=<><Button secondary href="/me/email">{tr(locale,'Email address','이메일 주소')}</Button><Button secondary href="/me/password">{tr(locale,'Change password','비밀번호 변경')}</Button><Button onClick={()=>work(async()=>{if(!demoMode){const {error}=await createClient().auth.signOut();if(error)throw error;}setState(initial);setAuthed(demoMode);router.push('/');router.refresh();})}><LogOut size={18}/>{demoMode?'Reset this preview':'Sign out'}</Button><section className="account-danger-zone"><p className="eyebrow">{tr(locale,'ACCOUNT','계정')}</p><Heading level={2}>{tr(locale,'Delete account','계정 삭제')}</Heading><p>{tr(locale,'Permanently remove your login and personal profile. Historical event, payment and safety records may be retained only in anonymized form.','로그인과 개인 프로필을 영구 삭제합니다. 과거 이벤트, 결제 및 안전 관련 기록은 익명화된 형태로만 보관될 수 있습니다.')}</p><button className="danger-button" type="button" onClick={()=>{setDeleteAccountConfirm('');setDeleteAccountOpen(true);}}><Trash2 size={18}/>{tr(locale,'Delete account','계정 삭제')}</button></section></>;
 else content=<><div className="profile-summary"><span className="avatar">{p.photos[0]?<Image className="avatar-image" src={p.photos[0]} alt={tr(locale,'Your profile photo','내 프로필 사진')} fill sizes="76px" unoptimized/>:<UserRound size={40}/>}</span><div className="profile-summary-copy"><Heading level={2}>{p.full_name||tr(locale,'My Profile','내 프로필')}</Heading><div className="profile-status-line"><span className={'verification-tag '+(verified?'verified':reviewPending?'reviewing':'unverified')}>{verified?<CircleCheck size={14}/>:reviewPending?<NotoAnimatedEmoji codepoint="23f3" fallback="⏳" size={18}/>:<ShieldCheck size={13}/>} {verified?tr(locale,'Verified','인증 완료'):reviewPending?tr(locale,'Under review','검토 중'):tr(locale,'Unverified','미인증')}</span></div></div></div>{reviewPending?<Button href="/profile/review-submitted">{tr(locale,'View review status','검토 상태 보기')}</Button>:<Button href={profileComplete(p)?'/onboarding/verification/saturday-social':'/onboarding/basics/saturday-social'}>{eligibleToApply?'Edit profile':'Complete profile'}</Button>}<Card label={tr(locale,'REFERRAL CODE','추천 코드')} title={tr(locale,'Invite someone to Roundy','친구를 Roundy에 초대해보세요')}>{myReferralCode?<><p className="referral-code-value">{myReferralCode}</p><p>{tr(locale,'Friends can use this code once at checkout for a discount. Your own code cannot be used on your account.','친구는 결제 화면에서 이 코드를 한 번 사용해 할인을 받을 수 있어요. 본인 계정에서는 자신의 코드를 사용할 수 없습니다.')}</p><Button secondary onClick={()=>void shareReferralCode()}><Share2 size={18}/>{tr(locale,'Share referral code','추천 코드 공유')}</Button></>:<><p>{tr(locale,'Generate a personal code to give a friend 10% off one Roundy event.','개인 추천 코드를 만들어 친구에게 Roundy 모임 1회 10% 할인을 공유해 보세요.')}</p><Button secondary disabled={busy} onClick={()=>void generateReferralCode()}>{tr(locale,'Generate referral code','추천 코드 생성')}</Button></>}</Card><div className="menu-list">{[...[['events','My Events',CalendarDays],['tickets','Payments',Ticket],['verification','Verification',ShieldCheck],['/feedback',tr(locale,'First meetup feedback','첫 모임 피드백'),MessageCircle],['safety','Safety & reporting',Heart],['settings','Settings',UserRound]],...(isAdmin?[['/admin','Admin',ShieldCheck] as [string,string,typeof ShieldCheck]]:[])].map(([url,title,Icon])=>{const I=Icon as typeof Heart;const href=String(url).startsWith('/')?String(url):'/me/'+String(url);const ko=String(title)==='Admin'?'관리자':String(title);return <Link key={String(url)} href={href}><I size={22}/><span>{tr(locale,String(title),ko)}</span><ChevronRight size={18}/></Link>;})}</div></>;
 }
 else if(route==='check-in'&&parts[1])content=<AdminQrCheckIn token={parts[1]} locale={locale}/>;
 else if(route==='how-it-works'){
  content=<div className="how-page">
   <header className="how-hero">
    <p className="eyebrow">{tr(locale,'1:1 MINGLE / MUTUAL MATCH','1:1 밍글 / 상호 매칭')}</p>
    <Heading level={1}>{tr(locale,'Meet first. Match later.','먼저 만나고, 매칭은 나중에')}</Heading>
    <p>{tr(locale,'A structured 1:1 rotation where you meet in person before deciding who you want to know better.','프로필보다 대화가 먼저예요. 짧게 1:1로 만나본 뒤, 더 이야기해보고 싶은 사람을 선택해요.')}</p>
   </header>
   <div className="how-step-list">
    {[
     [tr(locale,'01 / RESERVE','01 / 예약'),tr(locale,'Choose a 1:1 Mingle','참여할 1:1 밍글 고르기'),tr(locale,'Complete your profile and verification once, then pay for the Mingle you want to join.','프로필과 인증을 한 번 완료한 뒤, 참여할 1:1 밍글을 모임별로 결제합니다.')],
     [tr(locale,'02 / ROTATE','02 / 로테이션'),tr(locale,'Meet one person at a time','한 사람씩 마주 앉아 대화하기'),tr(locale,'Arrive early with photo ID. At the event, you move through short hosted 1:1 conversations instead of browsing profiles beforehand.','사진이 있는 신분증을 지참하고 일찍 도착하세요. 현장에서는 프로필을 미리 보는 대신 짧은 1:1 대화를 순서대로 진행합니다.')],
     [tr(locale,'03 / CHOOSE','03 / 선택'),tr(locale,'Pick up to 3 Yes choices','다시 만나고 싶은 사람 고르기'),tr(locale,'Your choices stay private. The other person cannot see whether you chose them unless the choice is mutual.','선택 결과는 비공개입니다. 서로 선택하기 전에는 상대방이 내가 누구를 선택했는지 알 수 없습니다.')],
     [tr(locale,'04 / MATCH','04 / 매칭'),tr(locale,'Only mutual choices unlock','서로 선택하면 매칭'),tr(locale,'When both people say Yes, the match appears after the event and you can see the profile and contact details needed to continue the conversation.','서로 Yes를 선택하면 이벤트 종료 후 매칭이 생성되고, 대화를 이어갈 수 있도록 프로필과 연락처가 공개됩니다.')]
    ].map(([label,title,body])=><Card key={label} label={label} title={title}>{body}</Card>)}
   </div>
   <Card label={tr(locale,'PRIVACY','개인정보')} title={tr(locale,'Private until it is mutual','서로 선택하기 전까지 비공개')}>{tr(locale,'Photos, verification handles, choices and contact details are not shown as a public attendee roster. Verification handles are never shared with other attendees.','사진, 인증 계정, 선택 결과, 연락처는 공개 참가자 명단처럼 노출되지 않습니다. 인증에 사용한 계정은 다른 참가자에게 공유되지 않습니다.')}</Card>
   <Card label={tr(locale,'SAFETY','안전')} title={tr(locale,'Respect is the entry requirement','존중이 참여의 기본 조건입니다')}>{tr(locale,'Harassment, hate speech, intoxication, recording or sharing another person’s identity can lead to removal and exclusion from future events.','괴롭힘, 혐오 표현, 과도한 음주 상태, 무단 촬영 또는 타인의 신원 공유는 현장 퇴장 및 향후 참여 제한 사유가 될 수 있습니다.')}</Card>
   <Button href="/events">{tr(locale,'See 1:1 Mingle events','1:1 밍글 모임 보기')}</Button>
   <Button secondary href="/me/safety">{tr(locale,'Report a concern','문제 신고하기')}</Button>
  </div>;
 }
 else if(route==='feedback')content=<FeedbackPage locale={locale}/>;
 else if(route==='about')content=<AboutUs locale={locale}/>;
 else if(route==='refund-policy')content=<RefundPolicy locale={locale}/>;
 else if(route==='terms')content=<TermsOfUse locale={locale}/>;
 else if(route==='privacy')content=<PrivacyPolicy locale={locale}/>;
 else if(route==='copyright')content=<CopyrightPolicy locale={locale}/>;
 else content=<Empty title={tr(locale,'This page isn’t here.','이 페이지를 찾을 수 없어요.')} body={tr(locale,'Let’s find your next evening instead.','대신 다음 모임를 찾아 볼까요?')} href="/discover" label={tr(locale,'Explore events','모임 둘러보기')}/>;
 const wide=['home','discover','payment'].includes(route)||(route==='events'&&!event);const privateRoute=['onboarding','profile','applications','checkout','ticket','event-night','matches','me','admin','check-in','feedback'].includes(route)||(route==='payment'&&parts[1]==='result');
 if(!demoMode&&ready&&!authed&&privateRoute)content=<Empty title={tr(locale,'Your evenings are personal.','내 모임은 로그인 후 확인할 수 있어요.')} body={tr(locale,'Sign in to manage your profile, event payments and matches.','로그인하면 프로필, 모임 결제, 매칭을 관리할 수 있어요.')} href={'/signin/'+slug} label={tr(locale,'Sign in','로그인')}/>;
 return <RoundyLocaleContext.Provider value={locale}><div className={"experience route-"+route}><a className="skip" href="#main">{tr(locale,'Skip to content','본문으로 건너뛰기')}</a>{wizardHeader??<header className="site-header"><Link className="wordmark" href="/"><RoundyBrand/></Link><nav aria-label={tr(locale,'Desktop navigation','데스크톱 내비게이션')}>{nav.map(n=><Link className={n.on?'active':''} key={n.href} href={n.href}>{n.text}</Link>)}</nav><div className="header-actions"><LocaleToggle locale={locale} onChange={setLanguage}/><Link className="header-signin" href={authed?"/me":"/signin"}>{authed&&p.photos[0]&&<span className="nav-avatar"><Image src={p.photos[0]} alt="" fill sizes="28px" unoptimized/></span>}{authed?tr(locale,'My Profile','내 프로필'):tr(locale,'Sign In','로그인')}</Link></div></header>}{demoMode&&<div className="preview-strip">{tr(locale,'Interactive preview','서비스 미리보기')} <span>{tr(locale,'· Sample events · No payments or messages sent','· 예시 이벤트 · 결제나 메시지는 전송되지 않아요')}</span></div>}<main id="main" className={'content '+(wide?'wide':'narrow')} aria-busy={!ready||busy||routeLoading||eventsLoading}>{ready&&<Localized>{content}</Localized>}</main>{consentEvent&&<div className="modal-backdrop registration-backdrop" onMouseDown={()=>{if(!busy)setConsentEvent(null);}}><section className="roundy-modal registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title" onMouseDown={e=>e.stopPropagation()}><header><div><p className="eyebrow">{tr(locale,'BEFORE YOU JOIN','참여 전 확인')}</p><Heading level={2} id="registration-title">{headline(localizeEvent(consentEvent,locale).title)}</Heading></div><button className="icon-button" type="button" aria-label={tr(locale,'Close','닫기')} onClick={()=>setConsentEvent(null)} disabled={busy}><X size={20}/></button></header><div className="registration-notes"><p><Check size={18}/><span>{tr(locale,'If you have a valid ticket, one ticket is redeemed and your seat is confirmed immediately.','유효한 티켓이 있으면 티켓 1장이 사용되고 좌석이 즉시 확정됩니다.')}</span></p>{eventCategory(consentEvent)==='1:1 Speed Mingle'&&<p><Check size={18}/><span>{tr(locale,'You are enrolled in the roster group that matches the gender on your approved profile.','승인된 프로필의 성별에 따라 해당 참가 그룹에 자동 등록됩니다.')}</span></p>}<p><Check size={18}/><span>{tr(locale,'Bring photo ID and arrive 15 minutes early.','사진이 있는 신분증을 지참하고 15분 일찍 도착해 주세요.')}</span></p></div><label className="check-row registration-check"><input type="checkbox" checked={consentCancellation} onChange={e=>setConsentCancellation(e.target.checked)}/><span>{tr(locale,'I have read the ','다음 내용을 확인했습니다: ')}<Link href="/refund-policy" target="_blank">{tr(locale,'Refund Policy','환불 규정')}</Link>.</span></label><label className="check-row registration-check"><input type="checkbox" checked={consentTerms} onChange={e=>setConsentTerms(e.target.checked)}/><span>{tr(locale,'I agree to the ','다음 내용에 동의합니다: ')}<Link href="/terms" target="_blank">{tr(locale,'Terms of Use','이용약관')}</Link>{tr(locale,' and ',' 및 ')}<Link href="/privacy" target="_blank">{tr(locale,'Privacy Policy','개인정보 처리방침')}</Link>.</span></label><Button disabled={busy||!consentCancellation||!consentTerms} onClick={()=>void confirmRegistration()}>{busy?tr(locale,'Registering…','등록 중…'):tr(locale,'Confirm event registration','모임 등록 확정')}</Button><p className="registration-footnote">{tr(locale,'No valid ticket yet? After confirmation, you will continue to checkout instead.','유효한 티켓이 아직 없다면 확인 후 결제 화면으로 이동합니다.')}</p></section></div>}{deleteAccountOpen&&<div className="modal-backdrop account-delete-backdrop" onMouseDown={()=>{if(!busy)setDeleteAccountOpen(false);}}><section className="roundy-modal account-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onMouseDown={e=>e.stopPropagation()}><header><div><p className="eyebrow">{tr(locale,'PERMANENT ACTION','영구 작업')}</p><Heading level={2} id="delete-account-title">{tr(locale,'Delete account?','계정을 삭제할까요?')}</Heading></div><button className="icon-button" type="button" aria-label={tr(locale,'Close','닫기')} onClick={()=>setDeleteAccountOpen(false)} disabled={busy}><X size={20}/></button></header><div className="account-delete-warning"><p>{tr(locale,'Your sign-in account, profile, verification data and uploaded identity media will be permanently removed.','로그인 계정, 프로필, 인증 정보 및 업로드한 신원 관련 파일이 영구 삭제됩니다.')}</p><p>{tr(locale,'Past event, payment and safety records are kept only as anonymized operational history. Future event registrations are cancelled. This cannot be undone.','과거 이벤트, 결제 및 안전 관련 기록은 익명화된 운영 기록으로만 보관됩니다. 향후 이벤트 예약은 취소됩니다. 이 작업은 되돌릴 수 없습니다.')}</p></div><label className="delete-confirm-field"><span>{tr(locale,'Type ','아래에 ')}<b>delete account</b>{tr(locale,' to confirm.','를 입력해 확인하세요.')}</span><input value={deleteAccountConfirm} onChange={e=>setDeleteAccountConfirm(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="delete account"/></label><div className="account-delete-actions"><button className="button secondary" type="button" onClick={()=>setDeleteAccountOpen(false)} disabled={busy}>{tr(locale,'Cancel','취소')}</button><button className="danger-button solid" type="button" onClick={()=>void deleteAccount()} disabled={busy||deleteAccountConfirm!=='delete account'}><Trash2 size={18}/>{busy?tr(locale,'Deleting…','삭제 중…'):tr(locale,'Delete account','계정 삭제')}</button></div></section></div>}{(!ready||busy||routeLoading||eventsLoading)&&<LoadingScreen/>}<SiteFooter locale={locale}/>{ready&&authed&&!demoMode&&route!=='reset-password'&&<AccountConsent locale={locale} path={path}/>}{!['onboarding','profile','admin','terms','refund-policy','privacy','copyright','checkout'].includes(route)&&<nav className="bottom-nav" aria-label={tr(locale,'Main navigation','주요 메뉴')}>{nav.map(n=><Link aria-current={n.on?'page':undefined} className={n.on?'active':''} href={n.href} key={n.href}><n.icon size={22} strokeWidth={n.on?2:1.5}/><span>{n.text}</span></Link>)}</nav>}</div></RoundyLocaleContext.Provider>;
}
