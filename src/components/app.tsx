'use client';
import { EventCategoryBadges, NationalityBadges, NationalityFact, VenueFact } from './event-detail-meta';
import { lockdownNotice } from '@/lib/event-requirements';
import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useState, type ReactNode, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, ArrowRight, ArrowLeft, CalendarDays, Clock3, MapPin, Compass, Heart, UserRound, UsersRound, Ticket, ShieldCheck, Check, Plus, X, ChevronRight, Search, LockKeyhole, Copy, LogOut, Trash2, Share2, MessageCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/client';
import { AccountConsent } from '@/components/legal-consent';
import { SignIn } from '@/components/sign-in';
import { VenueMap } from '@/components/venue-map';
import { MatchesScreen } from '@/components/matches-screen';
import { CopyrightPolicy, PrivacyPolicy, TermsOfUse } from '@/components/legal';
import { SiteFooter } from '@/components/site-footer';
import { FeedbackPage, FeedbackPrompt } from '@/components/feedback';
import { AboutUs } from '@/components/about-us';
import { RoundyBrand } from '@/components/roundy-brand';
import { LocaleToggle } from '@/components/locale-toggle';
import { LoadingScreen } from '@/components/loading-screen';
import { useToast } from '@/components/toast';
import { AdminQrCheckIn } from '@/components/admin-qr-checkin';
import { EventNight } from '@/components/event-night';
import { NationalitySelect, InterestPicker } from '@/components/profile-options';
import { VerificationFields } from '@/components/verification-fields';
import { compressProfilePhoto, fileToDataUrl } from '@/lib/uploads';
import { authConfigured } from '@/lib/auth-routing';
import { mbtiTypes, demoMode, eventCategories, eventCategory, events as sampleEvents, interests, emptyProfile, sampleProfile, formatKoreanPhone, profileComplete, type Event, type Profile, type Choice } from '@/lib/data';
import { dateLabelForLocale, localizeEvent, timeLabelForLocale, localizeInterest, tr, ui, type Locale } from '@/lib/locale';
import { MINIMUM_AGE, isAtLeastAge } from '@/lib/age';

type State={profile:Profile;applications:Record<string,string>;booked:Record<string,boolean>;checked:Record<string,boolean>;choices:Record<string,Choice>;finished:boolean;verification:string};
type ReferralQuote={valid:boolean;reason:string;code:string;discount_percent:number;subtotal_amount:number;discount_amount:number;final_amount:number};
type AttendeePreview={photo:string|null};
type EventAttendees={women:AttendeePreview[];men:AttendeePreview[];women_count:number;men_count:number;total:number};
type LegacyBusinessTalk={id:string;title:string;starts_at:string;ends_at:string;description:string;venue:string;address:string;capacity:number;participant_count:number;image:string;source_url:string};
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
function headline(value:string){const minor=new Set(['a','an','and','as','at','but','by','for','in','of','on','or','the','to','via','vs','with']);const parts=value.replace(/[.!?]+$/,'').replace(/[.!?]+\s+/g,', ').split(/(\s+)/);const words=parts.map((part,index)=>/[A-Za-z]/.test(part)?index:-1).filter(index=>index>=0);const first=words[0];const last=words.at(-1);return parts.map((part,index)=>{if(!/[A-Za-z]/.test(part))return part;const lower=part.toLowerCase();return index!==first&&index!==last&&minor.has(lower)?lower:lower.replace(/[a-z]/,letter=>letter.toUpperCase());}).join('');}
function Button({children,href,onClick,secondary=false,disabled=false,type='button'}:{children:ReactNode;href?:string;onClick?:()=>void;secondary?:boolean;disabled?:boolean;type?:'button'|'submit'}){const cls='button'+(secondary?' secondary':'');return href?<Link className={cls} href={href}><Localized>{children}</Localized><ArrowRight size={18}/></Link>:<button className={cls} type={type} onClick={onClick} disabled={disabled}><Localized>{children}</Localized></button>;}
function Card({label,title,children}:{label?:string;title?:string;children?:ReactNode}){const locale=useContext(RoundyLocaleContext);return <section className="info-card">{label&&<p className="eyebrow">{ui(locale,label)}</p>}{title&&<h3>{headline(ui(locale,title))}</h3>}{children&&<div className="card-copy"><Localized>{children}</Localized></div>}</section>;}
function Poster({title,label='SEOUL / AFTER HOURS'}:{title:string;label?:string}){const locale=useContext(RoundyLocaleContext);return <div className="poster"><span className="eyebrow">{ui(locale,label)}</span><strong>{ui(locale,title)}</strong><span><Localized>A real room. A fresh start. </Localized><ArrowUpRight size={18}/></span></div>;}
function Note({children}:{children:ReactNode}){return <p className="note"><Localized>{children}</Localized></p>;}
function Field({label,children}:{label:string;children:ReactNode}){const locale=useContext(RoundyLocaleContext);return <label className="field"><span>{ui(locale,label)}</span>{children}</label>;}
function Empty({title,body,href,label='Explore events'}:{title:string;body:string;href?:string;label?:string}){const locale=useContext(RoundyLocaleContext);return <div className="empty"><Heart size={40} strokeWidth={1.3}/><h2>{headline(ui(locale,title))}</h2><p>{ui(locale,body)}</p>{href&&<Button href={href}>{ui(locale,label)}</Button>}</div>;}

function categoryLabel(event:Event,locale:Locale){const category=eventCategory(event);return tr(locale,category,category==='1:1 Speed Mingle'?'1:1 스피드 밍글':'비즈니스 토크');}
function eventFilterLabel(category:string,locale:Locale){return category==='1:1 Speed Mingle'?tr(locale,'💞 1:1 Mingle','💞 1:1 밍글'):tr(locale,'🎙️ Business Talk','🎙️ 비즈니스 토크');}
function AttendeeStack({count,kind,locale,attendees=[]}:{count:number;kind:string;locale:Locale;attendees?:AttendeePreview[]}){const shown=Math.min(5,Math.max(0,count));const visible=attendees.slice(0,shown);return <div className="attendee-stack" aria-label={count+' '+ui(locale,kind)}>{Array.from({length:shown},(_,i)=>{const attendee=visible[i];return <span className={'attendee-avatar avatar-'+i} key={i} aria-hidden="true" style={attendee?.photo?{backgroundImage:`url("${attendee.photo}")`}:undefined}>{!attendee?.photo&&<UserRound size={13}/>}</span>;})}{count>shown&&<span className="attendee-avatar more" aria-hidden="true">+{count-shown}</span>}</div>;}
export function EventCard({e,locale,href,attendees,past=false}:{e:Event;locale:Locale;href?:string;attendees?:EventAttendees;past?:boolean}){const item=localizeEvent(e,locale);const attending=Math.max(0,e.capacity-e.seats_remaining);const preview=attendees?[...attendees.women,...attendees.men]:[];return <Link href={href??'/events/'+e.slug} className={'event-card'+(past?' past-event':'')}><div className="event-photo"><Image src={e.image||'/images/yeouido.webp'} alt={e.title} fill sizes="(max-width: 640px) 100vw, 500px"/><span className="photo-arrow"><ArrowUpRight size={24}/></span></div><div className="event-copy"><div className="event-tags"><span>{categoryLabel(e,locale)}</span><span>{e.age_min}–{e.age_max}{tr(locale,' years','세')}</span><div className="nationality-chip-group"><NationalityBadges requirements={e.nationality_requirements} locale={locale}/></div></div><h2>{headline(item.title)}</h2><p className="event-time"><CalendarDays size={16}/>{dateLabelForLocale(e.starts_at,locale)} · {timeLabelForLocale(e.starts_at,locale)} KST</p><p className="event-location"><MapPin size={16}/>{item.venue}</p><div className="event-attendance">{past?<><div><span className="past-event-status">{tr(locale,'Ended','종료')}</span></div><span>{attending}/{e.capacity} {tr(locale,'attended','참여')}</span></>:<><div><AttendeeStack count={attending} kind={tr(locale,'Attendees','참가자')} locale={locale} attendees={preview}/><span>{attending} {tr(locale,'attending','참가 예정')}</span></div><span>{e.seats_remaining} {tr(locale,'places left','자리 남음')}</span></>}</div></div></Link>;}

function LandingEventPreview({e,locale,attendees}:{e:Event;locale:Locale;attendees?:EventAttendees}){
 const item=localizeEvent(e,locale);
 const attending=Math.max(0,e.capacity-e.seats_remaining);
 const preview=attendees?[...attendees.women,...attendees.men]:[];
 const isMingle=eventCategory(e)==='1:1 Speed Mingle';
 return <Link href={'/events/'+e.slug} className="landing-v1-event-card">
  <div className="landing-v1-event-image"><Image src={e.image||'/images/yeouido.webp'} alt={item.title} fill sizes="80px"/></div>
  <div className="landing-v1-event-copy">
   <span className={'landing-v1-event-category '+(isMingle?'mingle':'talk')}>{isMingle?tr(locale,'1:1 Mingle','1:1 밍글'):tr(locale,'Business Talk','비즈니스 토크')}</span>
   <h3>{headline(item.title)}</h3>
   <p><MapPin size={14} aria-hidden="true"/><span>{item.venue}</span></p>
   <p><CalendarDays size={14} aria-hidden="true"/><span>{dateLabelForLocale(e.starts_at,locale)} · {timeLabelForLocale(e.starts_at,locale)}</span></p>
   <div className="landing-v1-event-bottom">
    <div className="landing-v1-attendees"><AttendeeStack count={attending} kind={tr(locale,'Attendees','참가자')} locale={locale} attendees={preview}/><span>{attending} {tr(locale,'attending','참가 예정')}</span></div>
    <span className={'landing-v1-event-status '+(isMingle?'mingle':'talk')}>{e.seats_remaining} {tr(locale,'places left','자리 남음')}</span>
   </div>
  </div>
 </Link>;
}
function LandingLegacyBusinessTalkPreview({e,locale}:{e:LegacyBusinessTalk;locale:Locale}){
 return <a href={e.source_url} target="_blank" rel="noreferrer" className="landing-v1-event-card legacy-talk-preview">
  <div className="landing-v1-event-image">{e.image?<img src={e.image} alt={e.title} loading="lazy" width="80" height="80"/>:<div className="legacy-talk-placeholder"><MessageCircle size={24} aria-hidden="true"/></div>}</div>
  <div className="landing-v1-event-copy">
   <span className="landing-v1-event-category talk">{tr(locale,'Business Talk','비즈니스 토크')}</span>
   <h3>{headline(e.title)}</h3>
   <p><MapPin size={14} aria-hidden="true"/><span>{e.venue}</span></p>
   <p><CalendarDays size={14} aria-hidden="true"/><span>{dateLabelForLocale(e.starts_at,locale)} · {timeLabelForLocale(e.starts_at,locale)}</span></p>
   <div className="landing-v1-event-bottom">
    <span className="landing-v1-legacy-count">{e.participant_count} {tr(locale,'attending','참가 예정')}</span>
    <span className="landing-v1-event-status talk">{Math.max(0,e.capacity-e.participant_count)} {tr(locale,'places left','자리 남음')}</span>
   </div>
  </div>
 </a>;
}
function LegacyBusinessTalkCard({e,locale,past}:{e:LegacyBusinessTalk;locale:Locale;past:boolean}){
 return <a href={e.source_url} target="_blank" rel="noreferrer" className={'legacy-talk-card'+(past?' past-event':'')}>
  <div className="legacy-talk-image">{e.image?<img src={e.image} alt={e.title} loading="lazy"/>:<div className="legacy-talk-placeholder"><MessageCircle size={32}/></div>}</div>
  <div className="legacy-talk-copy">
   <div className="event-tags"><span>{tr(locale,'Business Talk','비즈니스 토크')}</span><span>{tr(locale,'1 Cup archive','영어 한잔 기록')}</span></div>
   <h2>{headline(e.title)}</h2>
   <p className="event-time"><CalendarDays size={16}/>{dateLabelForLocale(e.starts_at,locale)} · {timeLabelForLocale(e.starts_at,locale)} KST</p>
   <p className="event-location"><MapPin size={16}/>{e.venue}</p>
   <div className="legacy-talk-meta"><span>{past?tr(locale,'Ended','종료'):tr(locale,'View on 1 Cup English','영어 한잔에서 보기')}</span><span>{e.participant_count}/{e.capacity}</span></div>
  </div>
 </a>;
}

function LandingPage({events,legacyTalks,locale,attendeesByEvent}:{events:Event[];legacyTalks:LegacyBusinessTalk[];locale:Locale;attendeesByEvent:Record<string,EventAttendees>}){
 const legacyUpcoming=legacyTalks.filter(e=>Date.parse(e.starts_at)>=Date.now());
 const upcoming=[...events.map(e=>({kind:'roundy' as const,event:e})),...legacyUpcoming.map(e=>({kind:'legacy' as const,event:e}))].sort((a,b)=>Date.parse(a.event.starts_at)-Date.parse(b.event.starts_at)).slice(0,2);
 const howSteps=[
  {label:tr(locale,'01 / CHOOSE','01 / 선택'),title:tr(locale,'Choose Your Event','이벤트 선택'),body:tr(locale,'Choose a 1:1 Mingle or Business Talk and reserve your place.','1:1 밍글 또는 비즈니스 토크를 선택하고 자리를 예약하세요.')},
  {label:tr(locale,'02 / MEET','02 / 만남'),title:tr(locale,'Meet Offline','오프라인에서 만나기'),body:tr(locale,'Join a hosted Event in Seoul. No endless profiles to browse before you arrive.','서울에서 진행되는 호스트형 이벤트에 참여하세요. 만나기 전 끝없이 프로필을 넘겨볼 필요가 없습니다.')},
  {label:tr(locale,'03 / CONNECT','03 / 연결'),title:tr(locale,'Keep What Clicks','마음이 맞는 인연 이어가기'),body:tr(locale,'For 1:1 Mingle, only mutual choices become Matches after the Event.','1:1 밍글에서는 이벤트 후 서로 선택한 경우에만 매칭됩니다.')}
 ];
 return <div className="landing landing-v1">
  <section className="landing-v1-hero">
   <span className="eyebrow landing-v1-eyebrow">ROUNDY / SEOUL</span>
   <h1>{tr(locale,'Two Ways to Meet, Both Happen Offline','두 가지 만남 방식, 모두 오프라인에서')}</h1>
   <p>{tr(locale,'Choose a 1:1 Mingle or Business Talk. Less browsing, more real conversation.','1:1 밍글 또는 비즈니스 토크를 선택하세요. 탐색은 줄이고, 실제 대화는 더 많이.')}</p>
   <div className="landing-v1-hero-media" aria-label={tr(locale,'1:1 Mingle and Business Talk','1:1 밍글과 비즈니스 토크')}>
    <div className="landing-v1-hero-main"><Image src="/images/roundy-mingle-hero-photo.webp" alt={tr(locale,'1:1 Mingle Event','1:1 밍글 이벤트')} fill priority sizes="220px"/></div>
    <div className="landing-v1-hero-side"><Image src="/images/roundy-business-hero-photo.webp" alt={tr(locale,'Business Talk Event','비즈니스 토크 이벤트')} fill priority sizes="110px"/></div>
    <span className="landing-v1-hero-caption">{tr(locale,'1:1 Mingle / Business Talk','1:1 밍글 / 비즈니스 토크')}</span>
   </div>
   <Link className="button landing-v1-primary" href="/events">{tr(locale,"See this week's events",'이번 주 이벤트 보기')}</Link>
  </section>

  <section className="landing-v1-section">
   <div className="landing-v1-section-heading">
    <span className="eyebrow landing-v1-eyebrow">{tr(locale,'TWO EVENT TYPES','두 가지 이벤트 타입')}</span>
    <h2>{tr(locale,'Pick Your Kind of Event','원하는 이벤트를 골라보세요')}</h2>
    <p>{tr(locale,'Both event types are built around real conversations, with a different format for each.','두 이벤트 타입 모두 진짜 대화를 중심으로 하며, 진행 방식은 서로 다릅니다.')}</p>
   </div>
   <div className="landing-v1-event-type">
    <div className="landing-v1-event-type-image"><Image src="/images/roundy-mingle-hero.webp" alt={tr(locale,'1:1 Mingle Event','1:1 밍글 이벤트')} fill sizes="342px"/></div>
    <span className="eyebrow landing-v1-event-type-label mingle">1:1 / MUTUAL MATCH</span>
    <h3>{tr(locale,'1:1 Mingle','1:1 밍글')}</h3>
    <p>{tr(locale,'Meet the person before the profile. Short rotations, a later profile reveal, then private mutual matching.','프로필보다 사람을 먼저 만나보세요. 짧은 로테이션, 이후 프로필 공개, 그리고 비공개 상호 매칭으로 이어집니다.')}</p>
    <Link className="landing-v1-text-link" href="/how-it-works/mingle">{tr(locale,'How 1:1 Mingle works','1:1 밍글 이용 방법')}<ArrowRight size={18} aria-hidden="true"/></Link>
   </div>
   <div className="landing-v1-event-type">
    <div className="landing-v1-event-type-image"><Image src="/images/roundy-business-hero.webp" alt={tr(locale,'Business Talk Event','비즈니스 토크 이벤트')} fill sizes="342px"/></div>
    <span className="eyebrow landing-v1-event-type-label">SMALL GROUP / ENGLISH</span>
    <h3>{tr(locale,'Business Talk','비즈니스 토크')}</h3>
    <p>{tr(locale,'Skip networking small talk. Start with one topic worth discussing and meet people through the way they think.','네트워킹용 스몰토크 대신 이야기할 가치가 있는 한 가지 주제로 시작합니다. 생각하는 방식을 통해 사람을 만나보세요.')}</p>
    <Link className="landing-v1-text-link" href="/how-it-works/business-talk">{tr(locale,'How Business Talk works','비즈니스 토크 이용 방법')}<ArrowRight size={18} aria-hidden="true"/></Link>
   </div>
  </section>

  <section className="landing-v1-section landing-v1-upcoming">
   <div className="landing-v1-section-heading">
    <span className="eyebrow landing-v1-eyebrow">{tr(locale,'NEXT UP','다음 이벤트')}</span>
    <h2>{tr(locale,'Upcoming in Seoul','서울에서 곧 열려요')}</h2>
    <p>{tr(locale,'Choose the Event Type first, then the date.','이벤트 타입을 먼저 고른 뒤 날짜를 선택하세요.')}</p>
   </div>
   {upcoming.length>0?<div className="landing-v1-event-list">{upcoming.map(item=>item.kind==='roundy'?<LandingEventPreview key={'roundy-'+item.event.id} e={item.event} locale={locale} attendees={attendeesByEvent[item.event.id]}/>:<LandingLegacyBusinessTalkPreview key={'legacy-'+item.event.id} e={item.event} locale={locale}/>)}</div>:<p className="landing-v1-empty">{tr(locale,'New events are being prepared.','새로운 이벤트를 준비하고 있어요.')}</p>}
   <Link className="landing-v1-text-link landing-v1-all-events" href="/events">{tr(locale,'See all events','모든 이벤트 보기')}<ArrowRight size={18} aria-hidden="true"/></Link>
  </section>

  <section className="landing-v1-section">
   <div className="landing-v1-section-heading">
    <span className="eyebrow landing-v1-eyebrow">{tr(locale,'HOW ROUNDY WORKS','ROUNDY 이용 방법')}</span>
    <h2>{tr(locale,'How Roundy Works','Roundy 이용 방법')}</h2>
    <p>{tr(locale,'Enough structure to make meeting strangers easy, without making it feel like an interview.','낯선 사람과도 편하게 만날 수 있을 만큼만 구조를 두되, 면접처럼 느껴지지는 않게 합니다.')}</p>
   </div>
   <div className="landing-v1-steps">
    {howSteps.map(step=><article className="landing-v1-step" key={step.label}><span>{step.label}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></article>)}
   </div>
  </section>

  <section className="info-card landing-v1-proof">
   <span className="eyebrow landing-v1-eyebrow">{tr(locale,'BUILT FROM REAL COMMUNITY','실제 커뮤니티에서 시작했습니다')}</span>
   <strong>80+</strong>
   <p>{tr(locale,'Before Roundy, our earlier offline conversation community grew to 80+ cumulative paid members.','Roundy 이전에 운영한 오프라인 대화 커뮤니티는 누적 유료 멤버 80명 이상으로 성장했습니다.')}</p>
   <div className="landing-v1-proof-divider"/>
   <h3>{tr(locale,'Profiles Are Reviewed Before Joining','참여 전 프로필 검토')}</h3>
   <p>{tr(locale,'Verification handles and private details are not shown to other attendees.','인증 계정과 비공개 정보는 다른 참가자에게 공개되지 않습니다.')}</p>
   <h3>{tr(locale,'Contact Stays Private Until It Is Mutual','서로 선택하기 전까지 연락처는 비공개')}</h3>
   <p>{tr(locale,'For 1:1 Mingle, contact details are shared only after a mutual Match.','1:1 밍글에서는 서로 매칭된 뒤에만 연락처가 공개됩니다.')}</p>
   <Link className="landing-v1-text-link" href="/how-it-works">{tr(locale,'How it works & safety','이용 방법 및 안전')}<ArrowRight size={18} aria-hidden="true"/></Link>
  </section>

  <section className="landing-v1-final">
   <h2>{tr(locale,'Choose Your Event','이벤트 선택')}</h2>
   <p>{tr(locale,'See the next published Events and choose the Format that fits.','다음 공개 이벤트를 확인하고 나에게 맞는 진행 방식을 선택하세요.')}</p>
   <Link className="button landing-v1-primary" href="/events">{tr(locale,'See all events','모든 이벤트 보기')}</Link>
  </section>
 </div>;
}
export function App({path}:{path:string}){
 const router=useRouter();const {showToast}=useToast();const searchParams=useSearchParams();const [state,setState]=useState<State>(initial);const [ready,setReady]=useState(false);const [events,setEvents]=useState<Event[]>(demoMode?sampleEvents:[]);const [authed,setAuthed]=useState(demoMode);const [isAdmin,setIsAdmin]=useState(false);const [busy,setBusy]=useState(false);const [routeLoading,setRouteLoading]=useState(false);const [eventsLoading,setEventsLoading]=useState(!demoMode);const [message,setMessage]=useState('');const [error,setError]=useState('');const [filter,setFilter]=useState('1:1 Speed Mingle');const [businessTalkPage,setBusinessTalkPage]=useState(1);const [query,setQuery]=useState('');const [quantity,setQuantity]=useState(1);const [qr,setQr]=useState('');const [locale,setLocale]=useState<Locale>('en');const [consentEvent,setConsentEvent]=useState<Event|null>(null);const [consentCancellation,setConsentCancellation]=useState(false);const [consentTerms,setConsentTerms]=useState(false);const [deleteAccountOpen,setDeleteAccountOpen]=useState(false);const [deleteAccountConfirm,setDeleteAccountConfirm]=useState('');const [myReferralCode,setMyReferralCode]=useState('');const [checkoutReferral,setCheckoutReferral]=useState('');const [referralQuote,setReferralQuote]=useState<ReferralQuote|null>(null);const [checkoutTermsAccepted,setCheckoutTermsAccepted]=useState(false);const [attendeesByEvent,setAttendeesByEvent]=useState<Record<string,EventAttendees>>({});const [legacyTalks,setLegacyTalks]=useState<LegacyBusinessTalk[]>([]);const [ticketBalance,setTicketBalance]=useState(0);
 const p=state.profile;const parts=path.split('/');const route=parts[0]||'home';const requestedCategory=searchParams.get('category');const referralParam=(searchParams.get('ref')??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);const requestedSlug=route==='onboarding'?parts[2]:parts[1];const slug=requestedSlug||(route==='events'||route==='discover'||route==='home'||route==='payment'?'':'saturday-social');const event=slug?(events.find(e=>e.slug===slug)??events.find(e=>e.previous_slugs?.includes(slug))):undefined;const appStatus=state.applications[slug];const publishedEvents=events.filter(e=>e.status==='live'||e.status==='published');const publicEvents=publishedEvents.filter(e=>Date.parse(e.starts_at)>Date.now()&&e.seats_remaining>0);
 function patchProfile(values:Partial<Profile>){setState(s=>({...s,profile:{...s.profile,...values}}));}
 function flash(text:string){setMessage(text);setError('');}
 function setLanguage(next:Locale){setLocale(next);try{localStorage.setItem('roundy-locale',next);}catch{/* A blocked storage setting should not block language choice. */}}
 async function work(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
 useEffect(()=>{
  if(route==='events'&&requestedCategory&&eventCategories.some(category=>category===requestedCategory))setFilter(requestedCategory);
 },[route,requestedCategory]);
 useEffect(()=>{setBusinessTalkPage(1);},[filter,route]);

 useEffect(()=>{if(!['home','discover','events'].includes(route))return;let active=true;const controller=new AbortController();void fetch('/api/legacy-business-talks',{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('Legacy Business Talks unavailable');return response.json();}).then(data=>{if(active)setLegacyTalks(Array.isArray(data.events)?data.events:[]);}).catch(()=>{if(active)setLegacyTalks([]);});return()=>{active=false;controller.abort();};},[route]);

 useEffect(()=>{if(!authConfigured()){setReady(true);return;}if(demoMode){try{const saved=sessionStorage.getItem('roundy-demo-v1');if(saved)setState({...initial,...JSON.parse(saved)});}catch{/* A corrupt preview does not block browsing. */}setReady(true);}else{Promise.allSettled([api('profile').then(d=>{const loaded={...emptyProfile,...d.profile};setState(s=>({...s,profile:loaded,verification:d.verification??'Not started'}));setAuthed(true);void api('admin/role').then(result=>setIsAdmin(Boolean(result.isAdmin))).catch(()=>setIsAdmin(false));}).catch(()=>{setAuthed(false);setIsAdmin(false);})]).finally(()=>setReady(true));}},[]);
 useEffect(()=>{if(demoMode||!authConfigured()){setEventsLoading(false);return;}let active=true;let controller:AbortController|null=null;
  async function refresh(){controller?.abort();const request=new AbortController();controller=request;setEventsLoading(true);try{const response=await fetch('/api/events',{cache:'no-store',signal:request.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load events.');if(active&&!request.signal.aborted)setEvents(data.events??[]);}catch(e){if(active&&!request.signal.aborted)setError(e instanceof Error?e.message:'Could not load events.');}finally{if(active&&!request.signal.aborted)setEventsLoading(false);}}
  const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};void refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',onVisible);return()=>{active=false;controller?.abort();window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',onVisible);};
 },[path,authed]);
 useEffect(()=>{if(!demoMode&&authed){void api('referral').then(d=>setMyReferralCode(String(d.referralCode??''))).catch(()=>setMyReferralCode(''));}},[authed]);
 useEffect(()=>{if(demoMode){setTicketBalance(0);return;}if(!authed)return;void api('credits').then(d=>setTicketBalance(Math.max(0,Number(d.balance)||0))).catch(()=>setTicketBalance(0));},[authed,route]);
 useEffect(()=>{let active=true;if(demoMode||!authed||events.length===0)return;void Promise.all(events.filter(e=>e.status==='live').map(async e=>{try{const d=await api('events/'+e.id+'/attendees');return [e.id,d.attendees as EventAttendees] as const;}catch{return [e.id,{women:[],men:[],women_count:0,men_count:0,total:Math.max(0,e.capacity-e.seats_remaining)} as EventAttendees] as const;}})).then(rows=>{if(active)setAttendeesByEvent(Object.fromEntries(rows));});return()=>{active=false;};},[authed,events]);
 useEffect(()=>{try{if(/^[A-Z0-9]{6}$/.test(referralParam)){sessionStorage.setItem('roundy-referral-prefill',referralParam);if(route==='checkout'){setCheckoutReferral(referralParam);setReferralQuote(null);setCheckoutTermsAccepted(false);}}else if(route==='checkout'&&!checkoutReferral){const stored=sessionStorage.getItem('roundy-referral-prefill')??'';if(/^[A-Z0-9]{6}$/.test(stored))setCheckoutReferral(stored);}}catch{/* Referral prefill remains optional if storage is unavailable. */}},[referralParam,route]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(ready&&demoMode){try{sessionStorage.setItem('roundy-demo-v1',JSON.stringify(state));}catch{setError('Photo is too large for this preview. Please choose a smaller photo.');}}},[state,ready]);
 useEffect(()=>{let active=true;setError('');setMessage('');setQuery('');if(!demoMode&&authed){setRouteLoading(true);const tasks=[api('applications').then(d=>{if(active)setState(s=>({...s,applications:Object.fromEntries(d.applications.map((a:{event_slug:string;status:string})=>[a.event_slug,a.status]))}));}),api('bookings').then(d=>{if(active)setState(s=>({...s,booked:Object.fromEntries((d.bookings??[]).filter((b:{event_slug?:string})=>b.event_slug).map((b:{event_slug:string})=>[b.event_slug,true]))}));})];void Promise.all(tasks).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setRouteLoading(false);});}return()=>{active=false;};},[path,authed]); // eslint-disable-line react-hooks/exhaustive-deps
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
 const eligibleToApply=profileComplete(p)&&verified;
 function goApply(e:Event){if(!authed){router.push('/signin/'+e.slug);return;}if(!profileComplete(p)){router.push('/onboarding/basics/'+e.slug);return;}if(!verified){router.push('/onboarding/verification/'+e.slug);return;}setConsentCancellation(false);setConsentTerms(false);setConsentEvent(e);}
 async function confirmRegistration(){const e=consentEvent;if(!e||!consentCancellation||!consentTerms)return;await work(async()=>{if(demoMode){setState(s=>({...s,booked:{...s.booked,[e.slug]:true}}));setConsentEvent(null);router.push('/me/events');return;}try{await api('bookings',{eventId:e.id,termsAccepted:true});setState(s=>({...s,booked:{...s.booked,[e.slug]:true}}));setConsentEvent(null);await Promise.all([refreshEvents(),refreshCredits()]);router.push('/me/events');}catch(err){if(err instanceof Error&&err.message==='No valid ticket available'){setConsentEvent(null);router.push('/checkout/'+e.slug);return;}throw err;}});}
 async function deleteAccount(){if(deleteAccountConfirm!=='delete account')return;await work(async()=>{if(demoMode){setDeleteAccountOpen(false);setDeleteAccountConfirm('');setState(initial);router.push('/');return;}await api('account',{confirmation:deleteAccountConfirm},'DELETE');try{await createClient().auth.signOut({scope:'local'});}catch{/* The Auth user has already been removed server-side. */}setDeleteAccountOpen(false);setDeleteAccountConfirm('');setState(initial);setAuthed(false);setIsAdmin(false);router.push('/');router.refresh();});}
 async function refreshEvents(){if(!demoMode){const d=await api('events');setEvents(d.events??[]);}}
 async function refreshCredits(){if(demoMode){setTicketBalance(0);return;}const d=await api('credits');setTicketBalance(Math.max(0,Number(d.balance)||0));}
 async function refreshEventAttendees(e:Event){if(demoMode)return;try{const d=await api('events/'+e.id+'/attendees');setAttendeesByEvent(prev=>({...prev,[e.id]:d.attendees as EventAttendees}));}catch{/* Event counts remain available even if attendee previews cannot load. */}}
 async function cancelBooking(e:Event){if(!window.confirm(tr(locale,'Cancel your registration for this event? Your ticket will be returned to your balance.','이 이벤트 등록을 취소할까요? 사용한 티켓은 잔액으로 돌아갑니다.')))return;await work(async()=>{if(demoMode){setState(prev=>{const booked={...prev.booked};delete booked[e.slug];return {...prev,booked};});flash(tr(locale,'Registration cancelled.','등록이 취소되었습니다.'));return;}await api('bookings',{eventId:e.id},'DELETE');setState(prev=>{const booked={...prev.booked};delete booked[e.slug];return {...prev,booked};});await Promise.all([refreshEvents(),refreshEventAttendees(e),refreshCredits()]);flash(tr(locale,'Registration cancelled.','등록이 취소되었습니다.'));});}
 async function saveProfile(){if(!demoMode)await api('profile',p,'PUT');}
 async function persistPhotos(photos:string[]){if(!demoMode)await api('profile',{...p,photos},'PUT');patchProfile({photos});}
 function referralMessage(reason:string){if(reason==='self')return tr(locale,"You can't use your own referral code.","본인의 추천 코드는 사용할 수 없어요.");if(reason==='already_redeemed')return tr(locale,'A referral code has already been used on this account.','이 계정에서는 이미 추천 코드를 사용했어요.');if(reason==='profile_required')return tr(locale,'Complete your profile before using a referral code.','추천 코드를 사용하려면 먼저 프로필을 완성해 주세요.');return tr(locale,'Invalid or inactive referral code.','유효하지 않거나 비활성화된 추천 코드예요.');}
 async function generateReferralCode(){await work(async()=>{if(demoMode){setMyReferralCode('RNDY26');flash(tr(locale,'Preview referral code created.','미리보기 추천 코드가 생성되었어요.'));return;}const d=await api('referral',{},'POST');const code=String(d.referralCode??'');if(!code)throw new Error(tr(locale,'Could not create a referral code.','추천 코드를 만들 수 없어요.'));setMyReferralCode(code);flash(tr(locale,'Referral code created.','추천 코드가 생성되었어요.'));});}
 async function shareReferralCode(){if(!myReferralCode)return;const url=`https://roundy.team/payment?ref=${encodeURIComponent(myReferralCode)}`;const text=`Roundy Referral Code: ${url}`;if(typeof navigator.share==='function'){try{await navigator.share({title:'Roundy Referral Code',text});return;}catch(e){if(e instanceof DOMException&&e.name==='AbortError')return;}}try{await navigator.clipboard.writeText(text);flash(tr(locale,'Referral link copied.','추천 링크가 복사되었어요.'));}catch{setError(tr(locale,'Could not share the referral code.','추천 코드를 공유하지 못했어요.'));}}
 async function applyReferral(){await work(async()=>{const normalized=checkoutReferral.trim().toUpperCase();if(!normalized){setReferralQuote(null);return;}const quote:ReferralQuote=demoMode?(normalized==='FRIEND'?{valid:true,reason:'valid',code:normalized,discount_percent:100,subtotal_amount:(p.gender==='female'?19800:29800)*quantity,discount_amount:(p.gender==='female'?19800:29800)*quantity,final_amount:0}:{valid:false,reason:'invalid',code:normalized,discount_percent:0,subtotal_amount:(p.gender==='female'?19800:29800)*quantity,discount_amount:0,final_amount:(p.gender==='female'?19800:29800)*quantity}):(await api('referral/quote',{code:normalized,quantity})).quote;setReferralQuote(quote);if(!quote.valid)return;flash(tr(locale,'Referral discount applied.','추천 할인이 적용되었어요.'));});}
 const nav=[{href:'/discover',text:tr(locale,'Discover','둘러보기'),icon:Compass,on:['home','discover'].includes(route)},{href:'/events',text:tr(locale,'Events','이벤트'),icon:CalendarDays,on:route==='events'},{href:'/matches',text:tr(locale,'Matches','매칭'),icon:Heart,on:route==='matches'},{href:'/me',text:tr(locale,'Profile','프로필'),icon:UserRound,on:route==='me'&&path!=='me/events'}];

 let content:ReactNode;
 let wizardHeader:ReactNode=null;
 if(route==='home'||route==='discover')content=<LandingPage events={publicEvents} legacyTalks={legacyTalks} locale={locale} attendeesByEvent={attendeesByEvent}/>;
 else if(route==='payment')content=<><section className="intro payment-referral-intro"><p className="eyebrow">{tr(locale,'REFERRAL CHECKOUT','추천 결제')}</p><h1>{tr(locale,'Choose an event','이벤트를 선택하세요')}</h1><p>{/^[A-Z0-9]{6}$/.test(referralParam)?tr(locale,`Referral code ${referralParam} is ready and will be filled in automatically at checkout.`,`추천 코드 ${referralParam}가 준비되었습니다. 결제 화면에 자동으로 입력됩니다.`):tr(locale,'Choose an event, then enter your referral code at checkout.','이벤트를 선택한 뒤 결제 화면에서 추천 코드를 입력하세요.')}</p></section><div className="event-grid">{publicEvents.map(e=><EventCard key={e.id} e={e} locale={locale} attendees={attendeesByEvent[e.id]} href={'/events/'+e.slug+(/^[A-Z0-9]{6}$/.test(referralParam)?'?ref='+encodeURIComponent(referralParam):'')}/>)}</div>{publicEvents.length===0&&<Empty title={tr(locale,'New events are on their way.','새로운 이벤트를 준비하고 있어요.')} body={tr(locale,'Check back soon for an event where you can use your referral code.','추천 코드를 사용할 수 있는 이벤트가 열리는지 곧 다시 확인해 주세요.')}/>}</>;
 else if(route==='events'&&!event){
  const now=Date.now();
  const nativeCategoryEvents=publishedEvents.filter(e=>eventCategory(e)===filter);
  const nativeUpcoming=nativeCategoryEvents.filter(e=>Date.parse(e.starts_at)>=now&&e.seats_remaining>0).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
  const nativePast=nativeCategoryEvents.filter(e=>Date.parse(e.starts_at)<now).sort((a,b)=>Date.parse(b.starts_at)-Date.parse(a.starts_at));
  const nativeKeys=new Set(nativeCategoryEvents.map(e=>e.title.trim().toLowerCase()+'|'+e.starts_at.slice(0,10)));
  const legacyVisible=filter==='Business Talk'?legacyTalks.filter(e=>!nativeKeys.has(e.title.trim().toLowerCase()+'|'+e.starts_at.slice(0,10))):[];
  const legacyUpcoming=legacyVisible.filter(e=>Date.parse(e.starts_at)>=now).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
  const legacyPast=legacyVisible.filter(e=>Date.parse(e.starts_at)<now).sort((a,b)=>Date.parse(b.starts_at)-Date.parse(a.starts_at));
  const businessTalkItems=filter==='Business Talk'?[
   ...nativeUpcoming.map(e=>({source:'native' as const,phase:'upcoming' as const,event:e})),
   ...legacyUpcoming.map(e=>({source:'legacy' as const,phase:'upcoming' as const,event:e})),
   ...nativePast.map(e=>({source:'native' as const,phase:'past' as const,event:e})),
   ...legacyPast.map(e=>({source:'legacy' as const,phase:'past' as const,event:e}))
  ]:[];
  const businessTalkPageCount=Math.max(1,Math.ceil(businessTalkItems.length/5));
  const activeBusinessTalkPage=Math.min(businessTalkPage,businessTalkPageCount);
  const visibleBusinessTalkItems=businessTalkItems.slice((activeBusinessTalkPage-1)*5,activeBusinessTalkPage*5);
  const upcomingCards=filter==='Business Talk'
   ?visibleBusinessTalkItems.filter(item=>item.phase==='upcoming').map(item=>item.source==='native'
    ?<EventCard key={'native-'+item.event.id} e={item.event} locale={locale} attendees={attendeesByEvent[item.event.id]}/>
    :<LegacyBusinessTalkCard key={'legacy-'+item.event.id} e={item.event} locale={locale} past={false}/>)
   :nativeUpcoming.map(e=><EventCard key={e.id} e={e} locale={locale} attendees={attendeesByEvent[e.id]}/>);
  const pastCards=filter==='Business Talk'
   ?visibleBusinessTalkItems.filter(item=>item.phase==='past').map(item=>item.source==='native'
    ?<EventCard key={'native-'+item.event.id} e={item.event} locale={locale} attendees={attendeesByEvent[item.event.id]} past/>
    :<LegacyBusinessTalkCard key={'legacy-'+item.event.id} e={item.event} locale={locale} past/>)
   :nativePast.map(e=><EventCard key={e.id} e={e} locale={locale} attendees={attendeesByEvent[e.id]} past/>);
  const hasUpcoming=upcomingCards.length>0;
  const hasPast=pastCards.length>0;
  content=<>
   <div className="chips event-category-filters" aria-label={tr(locale,'Filter by event category','이벤트 카테고리로 필터링')}>{eventCategories.map(x=><button aria-pressed={filter===x} className={filter===x?'chip selected':'chip'} onClick={()=>setFilter(x)} key={x}>{eventFilterLabel(x,locale)}</button>)}</div>
   {hasUpcoming&&<section className="event-history-section"><h2 className="event-history-title">{tr(locale,'Upcoming events','다가오는 이벤트')}</h2><div className="event-grid">{upcomingCards}</div></section>}
   {hasPast&&<section className="event-history-section past-events-section"><h2 className="event-history-title">{tr(locale,'Past events','지난 이벤트')}</h2><p className="event-history-caption">{tr(locale,'A look back at rooms we have already hosted.','이미 함께했던 모임들을 둘러보세요.')}</p><div className="event-grid">{pastCards}</div></section>}
   {!hasUpcoming&&!hasPast&&<Empty title={tr(locale,'No events in this category yet.','이 카테고리의 이벤트가 아직 없어요.')} body={tr(locale,'Check back soon for newly published events.','새로운 이벤트가 곧 열릴 예정이에요. 조금만 기다려 주세요!')}/>}
   {filter==='Business Talk'&&businessTalkPageCount>1&&<nav className="business-talk-pagination" aria-label={tr(locale,'Business Talk event pages','비즈니스 토크 이벤트 페이지')}>
    <button type="button" disabled={activeBusinessTalkPage<=1} onClick={()=>{setBusinessTalkPage(page=>Math.max(1,page-1));document.querySelector('.event-category-filters')?.scrollIntoView({behavior:'smooth',block:'start'});}}><ArrowLeft size={16}/>{tr(locale,'Previous','이전')}</button>
    <span>{tr(locale,`Page ${activeBusinessTalkPage} of ${businessTalkPageCount}`,`${activeBusinessTalkPage} / ${businessTalkPageCount} 페이지`)}</span>
    <button type="button" disabled={activeBusinessTalkPage>=businessTalkPageCount} onClick={()=>{setBusinessTalkPage(page=>Math.min(businessTalkPageCount,page+1));document.querySelector('.event-category-filters')?.scrollIntoView({behavior:'smooth',block:'start'});}}>{tr(locale,'Next','다음')}<ArrowRight size={16}/></button>
   </nav>}
  </>;
 } else if(route==='events'&&event){const item=localizeEvent(event,locale);const attending=Math.max(0,event.capacity-event.seats_remaining);const duration=event.duration_minutes??Math.round((Date.parse(event.ends_at)-Date.parse(event.starts_at))/60000);const registrationClosed=Date.parse(event.starts_at)<=Date.now()||event.seats_remaining<1;const cancellationLocked=Date.now()>=Date.parse(event.starts_at)-((event.lockdown_minutes??0)*60000);const alreadyBooked=Boolean(state.booked[event.slug]);const attendeeInfo=attendeesByEvent[event.id]??{women:[],men:[],women_count:0,men_count:0,total:attending};const genderCapacity=Math.floor(event.capacity/2);content=<><div className="detail-photo"><Image src={event.image||'/images/yeouido.webp'} alt={event.title} fill sizes="(max-width: 640px) 100vw, 800px" priority/></div>{(event.images?.length??0)>1&&<div className="event-gallery">{event.images?.slice(1).map(src=><Image key={src} src={src} alt={event.title} width={360} height={240} unoptimized/>)}</div>}<section className="event-detail-copy"><EventCategoryBadges category={categoryLabel(event,locale)} requirements={event.nationality_requirements} locale={locale}/><h1>{headline(item.title)}</h1></section><div className="detail-facts"><div className="event-fact"><span className="fact-icon"><UsersRound size={20}/></span><span className="fact-copy"><b>{tr(locale,'Age range','연령')}</b><span>{event.age_min}–{event.age_max}</span></span></div><NationalityFact requirements={event.nationality_requirements} locale={locale}/><div className="event-fact"><span className="fact-icon"><CalendarDays size={20}/></span><span className="fact-copy"><b>{tr(locale,'Time','시간')}</b><span>{dateLabelForLocale(event.starts_at,locale)} · {timeLabelForLocale(event.starts_at,locale)} – {timeLabelForLocale(event.ends_at,locale)} KST</span></span></div><div className="event-fact"><span className="fact-icon"><Clock3 size={20}/></span><span className="fact-copy"><b>{tr(locale,'Duration','진행 시간')}</b><span>{duration}{tr(locale,' minutes','분')}</span></span></div><VenueFact venue={item.venue} address={item.address} description={event.venue_description} locale={locale}/></div><VenueMap venue={item.venue} address={item.address} latitude={event.latitude} longitude={event.longitude} locale={locale}/><Card label={tr(locale,'BEFORE YOU APPLY','지원 전 확인')}><ul className="before-apply"><li className="lockdown-notice">{lockdownNotice(event.lockdown_minutes??0,locale)}</li><li>{tr(locale,'Comfortable with short conversations in Korean or English','한국어 또는 영어로 짧은 대화를 편하게 나눌 수 있어야 해요')}</li><li>{tr(locale,'Bring photo ID and arrive 15 minutes early','사진이 있는 신분증을 지참하고 15분 일찍 도착해 주세요')}</li><li>{tr(locale,'Only mutual choices become a match','서로 선택해야 매칭돼요')}</li></ul></Card>{item.description?.trim()&&<p className="event-description">{item.description}</p>}<section className="attendee-list"><h2>{tr(locale,'Attendees','참가자')} <span>({attending} / {event.capacity})</span></h2>{eventCategory(event)==='1:1 Speed Mingle'?<div className="attendee-simple-panel"><div className="attendee-simple-row"><div className="attendee-simple-head"><b>{tr(locale,'Ladies','여성')}</b><span>{attendeeInfo.women_count} / {genderCapacity}</span></div><AttendeeStack count={attendeeInfo.women_count} kind={tr(locale,'Ladies','여성')} locale={locale} attendees={attendeeInfo.women}/></div><div className="attendee-simple-row"><div className="attendee-simple-head"><b>{tr(locale,'Gents','남성')}</b><span>{attendeeInfo.men_count} / {genderCapacity}</span></div><AttendeeStack count={attendeeInfo.men_count} kind={tr(locale,'Gents','남성')} locale={locale} attendees={attendeeInfo.men}/></div></div>:<div className="attendee-simple-panel"><div className="attendee-simple-row"><div className="attendee-simple-head"><b>{tr(locale,'Attendees','참가자')}</b><span>{attendeeInfo.total} / {event.capacity}</span></div><AttendeeStack count={attendeeInfo.total} kind={tr(locale,'Attendees','참가자')} locale={locale} attendees={[...attendeeInfo.women,...attendeeInfo.men]}/></div></div>}</section><div className="sticky-action">{alreadyBooked?<Button secondary disabled={busy||cancellationLocked} onClick={()=>void cancelBooking(event)}>{cancellationLocked?tr(locale,'Cancellation locked','취소 마감'):tr(locale,'Cancel registration','등록 취소')}</Button>:<Button disabled={registrationClosed} onClick={()=>goApply(event)}>{registrationClosed?tr(locale,'Event closed','신청 마감'):!eligibleToApply?tr(locale,'Complete Profile to Join','프로필을 완성하고 참여하기'):tr(locale,'Apply for this event','이 이벤트 지원하기')}</Button>}</div></>;}
 else if(route==='signin')content=<SignIn eventSlug={parts[1]} locale={locale}/>;
 else if(route==='onboarding'){
 const steps=['basics','photos','work','interests','contact','verification'];const step=steps.indexOf(parts[1]);
 async function next(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=new FormData(e.currentTarget);await work(async()=>{if(step===0&&(!p.gender||!isAtLeastAge(p.birth_date)))throw new Error(tr(locale,`You must be ${MINIMUM_AGE} or older and select a gender.`,`만 ${MINIMUM_AGE}세 이상이어야 하며 성별을 선택해야 합니다.`));if(step===1&&p.photos.length<1)throw new Error('Please add at least one photo.');if(step===3&&p.interests.length<3)throw new Error('Choose at least 3 interests.');await saveProfile();if(step===5){if(!demoMode)await api('verification',Object.fromEntries(form.entries()));setState(s=>({...s,verification:'Reviewing'}));router.push(event?'/applications/'+event.slug:'/me');}else router.push('/onboarding/'+steps[step+1]+'/'+slug);});}
 wizardHeader=<header className="wizard-header"><div className="wizard-header-inner"><button className="icon-button" aria-label={tr(locale,'Previous step','이전 단계')} onClick={()=>step>0?router.push('/onboarding/'+steps[step-1]+'/'+slug):router.push('/events')}><ArrowLeft size={20}/></button><span>{tr(locale,'PROFILE','프로필')} {step+1} / 6</span><button type="button" className="save-leave" disabled={busy} onClick={()=>void work(async()=>{await saveProfile();router.push('/me');})}>{tr(locale,'Save & leave','저장 후 나가기')}</button></div><progress max={6} value={step+1} aria-label={tr(locale,'Profile progress','프로필 작성 진행률')}/></header>;
 content=<><Note>{['Your legal name stays private until a mutual match.','Add 1–3 recent photos. Keep it clearly, honestly you.','We display a general description of your work. Exact details stay private.','Pick at least 3, up to 10. Small details make you memorable.','Only mutual matches receive your name and phone number.',tr(locale,'Choose one way to verify your identity.','본인 인증 방법을 하나 선택해 주세요.')][step]}</Note><form onSubmit={next}>
 {step===0&&<><Field label="FULL LEGAL NAME"><input autoComplete="name" required value={p.full_name} onChange={e=>patchProfile({full_name:e.target.value})} placeholder="Your name as shown on ID"/></Field><Field label="DATE OF BIRTH"><input type="date" required value={p.birth_date} onChange={e=>patchProfile({birth_date:e.target.value})}/></Field><fieldset><legend>Gender</legend><div className="chips">{[['female','Woman'],['male','Man']].map(([v,l])=><button type="button" className={'chip '+(p.gender===v?'selected':'')} aria-pressed={p.gender===v} onClick={()=>patchProfile({gender:v})} key={v}><span aria-hidden="true">{v==='female'?'👩':'👨'}</span><span>{ui(locale,l)}</span></button>)}</div></fieldset><Field label="NATIONALITY"><NationalitySelect value={p.nationality} onChange={nationality=>patchProfile({nationality})} locale={locale}/></Field></>}
 {step===1&&<><div className="photo-grid">{p.photos.map((photo,i)=><div className={'profile-photo '+(i===0?'primary-photo':'')} key={photo}>{photo==='sample-avatar'?<UserRound size={64}/>:<Image src={photo} alt={'Your photo '+(i+1)} fill unoptimized sizes="200px"/>}<span>{i===0?'Main photo':'Photo '+(i+1)}</span><button aria-label={'Remove photo '+(i+1)} className="photo-remove" type="button" onClick={()=>void work(()=>persistPhotos(p.photos.filter((_,j)=>j!==i)))}><X size={16}/></button>{i>0&&<button className="make-main" type="button" onClick={()=>void work(()=>persistPhotos([photo,...p.photos.filter((_,j)=>j!==i)]))}>Make main</button>}</div>)}{p.photos.length<3&&<label className="photo-add"><Plus size={32}/><span>{p.photos.length<2?tr(locale,'Add photos','사진 추가하기'):tr(locale,'Add photo','사진 추가')}</span><input type="file" accept="image/*" multiple onChange={e=>{const originals=Array.from(e.target.files??[]).slice(0,3-p.photos.length);e.currentTarget.value='';if(!originals.length)return;void work(async()=>{const next=[...p.photos];for(const original of originals){const file=await compressProfilePhoto(original);if(demoMode){next.push(await fileToDataUrl(file));}else{const form=new FormData();form.set('photo',file);const r=await fetch('/api/photos',{method:'POST',body:form});const data=await r.json();if(!r.ok)throw new Error(data.error);next.push(data.url);}}if(demoMode)patchProfile({photos:next});else await persistPhotos(next);});}}/></label>}</div><Note>No group photos or heavy filters. Use a recent, recognizable picture. Large images are automatically resized and compressed before upload.</Note></>}
 {step===2&&<><Field label="HEIGHT (CM)"><input type="number" min={100} max={250} required value={p.height_cm} onChange={e=>patchProfile({height_cm:Number(e.target.value)})}/></Field><Field label={tr(locale,"MBTI (OPTIONAL)","MBTI (선택)")}><select value={p.mbti??''} onChange={e=>patchProfile({mbti:e.target.value})}><option value="">{tr(locale,"Not selected / Not sure","선택 안 함 / 잘 모르겠어요")}</option>{mbtiTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></Field><Field label="JOB TITLE"><input required value={p.job_title} onChange={e=>patchProfile({job_title:e.target.value})} placeholder="Product designer"/></Field><Field label="WORKPLACE / SCHOOL"><input required value={p.workplace} onChange={e=>patchProfile({workplace:e.target.value})} placeholder="Company or university"/></Field></>}
 {step===3&&<><Field label="SEARCH INTERESTS"><span className="search-input"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="What are you into?"/></span></Field><InterestPicker selected={p.interests} onChange={interests=>patchProfile({interests})} query={query} locale={locale}/></>}
 {step===4&&<><Field label="PRIVATE PHONE NUMBER"><input type="tel" inputMode="tel" required pattern="010-[0-9]{4}-[0-9]{4}" value={p.phone} onChange={e=>patchProfile({phone:formatKoreanPhone(e.target.value)})} placeholder="010-1234-5678"/></Field><label className="check-row"><input type="checkbox" required checked={p.contact_consent} onChange={e=>patchProfile({contact_consent:e.target.checked})}/><span>I agree to share my name and phone number with mutual matches after the event.</span></label><Card label="ONLY WHEN IT’S MUTUAL" title="Your contact details stay private.">Sharing happens only after you both choose Yes. Once revealed, contact details cannot be revoked.</Card></>}
 {step===5&&<VerificationFields locale={locale}/>}
 <Button type="submit" disabled={busy}>{busy?'Saving…':step===5?'Submit for review':'Continue'} {!busy&&<ArrowRight size={18}/>}</Button></form>{demoMode&&<button className="text-button" onClick={()=>{setState(s=>({...s,profile:sampleProfile}));flash('Fictional sample profile loaded. You can edit it or continue.');}}>Fill with a fictional sample profile</button>}</>;
 }
 else if(route==='applications'&&event){content=<><Card label={tr(locale,'DIRECT BOOKING','바로 예약')} title={localizeEvent(event,locale).title}>{tr(locale,'Applications are no longer required. Approved members reserve a seat directly with a valid ticket.','별도 참가 신청은 필요하지 않습니다. 승인된 회원은 유효한 티켓으로 바로 좌석을 예약할 수 있어요.')}</Card><Button href={'/events/'+slug}>{tr(locale,'Back to event','이벤트로 돌아가기')}</Button></>;}
 else if(route==='checkout'&&event){
  const subtotal=(p.gender==='female'?19800:29800)*quantity;
  const quoteValid=Boolean(referralQuote?.valid&&referralQuote.code===checkoutReferral.trim().toUpperCase());
  const total=quoteValid?referralQuote!.final_amount:subtotal;
  content=state.booked[slug]?<Empty title={tr(locale,'Your seat is already confirmed.','이미 좌석이 확정되었어요.')} body={tr(locale,'This event is already saved in My Events.','이 이벤트는 내 이벤트에 이미 등록되어 있어요.')} href="/me/events" label={tr(locale,'View My Events','내 이벤트 보기')}/>:!eligibleToApply?<><Card label={tr(locale,'PROFILE REQUIRED','프로필 필요')} title={tr(locale,'Complete your profile first.','먼저 프로필을 완성해 주세요.')}>{tr(locale,'Your profile and verification must be approved before you can reserve a seat.','좌석을 예약하려면 프로필과 본인 인증 승인이 필요해요.')}</Card><Button href={!profileComplete(p)?'/onboarding/basics/'+slug:'/onboarding/verification/'+slug}>{tr(locale,'Complete Profile','프로필 완성하기')}</Button></>:<>
   <div className="ticket-options">{[1,3].map(n=><button key={n} className={'ticket-option '+(n===quantity?'selected':'')} onClick={()=>{setQuantity(n);setReferralQuote(null);setCheckoutTermsAccepted(false);}}><Ticket/><b>{n} {n===1?'ticket':'tickets'}</b><span>{tr(locale,'Valid for 90 days','90일 동안 유효')}</span></button>)}</div>
   <section className="referral-box">
    <div className="referral-head"><h3>{tr(locale,'Referral code','추천 코드')}</h3><span>{tr(locale,'Optional','선택')}</span></div>
    <p className="referral-help">{tr(locale,'Apply a code from a friend before checkout.','결제 전에 친구에게 받은 추천 코드를 적용할 수 있어요.')}</p>
    <div className="referral-entry"><input value={checkoutReferral} maxLength={6} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder={tr(locale,'Enter referral code','추천 코드 입력')} onChange={e=>{setCheckoutReferral(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));setReferralQuote(null);setCheckoutTermsAccepted(false);}}/><button className="referral-apply" type="button" disabled={busy||checkoutReferral.length!==6} onClick={()=>void applyReferral()}>{tr(locale,'Apply','적용')}</button></div>
    {referralQuote&&<p className={'referral-message '+(referralQuote.valid?'success':'error')}>{referralQuote.valid?tr(locale,'Referral discount applied.','추천 할인이 적용되었습니다.'):referralMessage(referralQuote.reason)}</p>}
   </section>
   <div className="price-row total"><span>{tr(locale,'Total','최종 금액')}</span><strong>₩{total.toLocaleString()}</strong></div>
   <Note>{tr(locale,'One-time ticket purchase. No subscription, automatic renewal or recurring charge.','1회성 티켓 구매입니다. 구독, 자동 갱신 또는 정기 결제가 없습니다.')}</Note>
   {quoteValid&&<label className="check-row checkout-terms"><input type="checkbox" checked={checkoutTermsAccepted} onChange={e=>setCheckoutTermsAccepted(e.target.checked)}/><span>{tr(locale,'I agree to the cancellation/refund rules, ','취소 및 환불 규정과 ')}<Link href="/terms" target="_blank">{tr(locale,'Terms of Use','이용약관')}</Link>{tr(locale,' and ',' 및 ')}<Link href="/privacy" target="_blank">{tr(locale,'Privacy Policy','개인정보 처리방침')}</Link>.</span></label>}
   <Note>{tr(locale,'If you already have a valid ticket, use it below. Otherwise continue to payment. Your seat is confirmed immediately when a ticket is redeemed.','유효한 티켓이 있다면 아래에서 바로 사용하세요. 없다면 결제를 진행하세요. 티켓이 사용되는 즉시 좌석이 확정됩니다.')}</Note>
   <Card label={tr(locale,'BEFORE YOU PAY','결제 전 확인')} title={tr(locale,'Valid for 90 days','90일 동안 유효')}>{tr(locale,'Unused tickets are refundable within their 90-day validity period. Tickets are personal and non-transferable. Event-specific cancellation terms apply after a ticket is redeemed.','사용하지 않은 티켓은 90일 유효기간 안에 환불할 수 있습니다. 티켓은 본인만 사용할 수 있으며 양도할 수 없습니다. 티켓 사용 후에는 이벤트별 취소 규정이 적용됩니다.')}</Card>
   <Button disabled={busy||(quoteValid&&!checkoutTermsAccepted)} onClick={()=>work(async()=>{if(!demoMode){if(quoteValid){await api('checkout',{eventId:event.id,quantity,referralCode:checkoutReferral.trim().toUpperCase(),termsAccepted:checkoutTermsAccepted});setState(s=>({...s,booked:{...s.booked,[slug]:true}}));await Promise.all([refreshEvents(),refreshCredits()]);router.push('/me/events');return;}await api('checkout',{eventId:event.id,quantity});return;}setState(s=>({...s,booked:{...s.booked,[slug]:true}}));router.push('/me/events');})}>{quoteValid?tr(locale,'Apply Discount & Confirm','할인 적용 후 예약 확정'):demoMode?tr(locale,'Preview confirmed booking — no charge','예약 미리보기 — 결제 없음'):tr(locale,'Continue to secure payment','결제 계속하기')}</Button>
   <Button secondary onClick={()=>goApply(event)}>{tr(locale,'Use an existing ticket','보유 티켓 사용하기')}</Button>
  </>;
 }
 else if(route==='ticket'&&event)content=!state.booked[slug]?<Empty title={tr(locale,'No confirmed booking yet.','아직 확정된 예약이 없어요.')} body={tr(locale,'Return to the event page to reserve your seat with a valid ticket.','이벤트 페이지에서 유효한 티켓으로 좌석을 예약해 주세요.')} href={'/events/'+slug} label={tr(locale,'View event','이벤트 보기')}/>:<>{demoMode&&<div className="qr-card">{qr&&<Image src={qr} alt="Demo QR code, not a valid admission ticket" width={230} height={230}/>}<b>PREVIEW TICKET — NOT VALID FOR ENTRY</b></div>}<Card label={tr(locale,'BOOKING CONFIRMED','예약 확정')} title={dateLabelForLocale(event.starts_at,locale)+' · '+timeLabelForLocale(event.starts_at,locale)}>{localizeEvent(event,locale).venue}<br/>{tr(locale,'Arrive 15 minutes early and bring photo ID.','15분 일찍 도착하고 사진이 있는 신분증을 지참해 주세요.')}</Card><Note>{tr(locale,'Your booking is attached to your account. The host will verify your identity at check-in.','예약은 계정에 연결되어 있습니다. 체크인 시 호스트가 신원을 확인합니다.')}</Note>{demoMode&&<div className="demo-controls"><p>Event-night preview</p><Button onClick={()=>{setState(s=>({...s,checked:{...s.checked,[slug]:true}}));router.push('/event-night/'+slug);}}>Preview staff check-in</Button></div>}</>;
 else if(route==='event-night'&&event)content=<EventNight event={event} locale={locale}/>;
 else if(route==='matches')content=<MatchesScreen locale={locale} ownPhoto={p.photos[0]} matchId={parts[1]}/>;
 else if(route==='me'){
 const sub=parts[1]??'';
 if(sub==='events'){const bookedEvents=events.filter(e=>state.booked[e.slug]);content=<div className="my-events-page"><FeedbackPrompt locale={locale}/><header className="subpage-heading"><p className="eyebrow">{tr(locale,'MY EVENTS','내 이벤트')}</p><h1>{tr(locale,'Your confirmed plans','확정된 일정')}</h1></header><div className="my-events-list">{bookedEvents.map(e=>{const item=localizeEvent(e,locale);return <section className="booking-ticket" key={e.id}><div className="booking-ticket-top"><span>{tr(locale,'BOOKING CONFIRMED','예약 확정')}</span><Check size={18}/></div><div className="booking-ticket-main"><h2>{dateLabelForLocale(e.starts_at,locale)} · {timeLabelForLocale(e.starts_at,locale)}</h2><p className="booking-ticket-venue"><MapPin size={17}/>{item.venue}</p></div><div className="booking-ticket-divider"/><div className="booking-ticket-notes"><p>{tr(locale,'Arrive 15 minutes early and bring photo ID.','15분 일찍 도착하고 사진이 있는 신분증을 지참해 주세요.')}</p><p>{tr(locale,'Your booking is attached to your account. The host will verify your identity at check-in.','예약은 계정에 연결되어 있습니다. 체크인 시 호스트가 신원을 확인합니다.')}</p></div>{eventCategory(e)==='1:1 Speed Mingle'&&<Link className="booking-ticket-action" href={'/event-night/'+e.slug}>{tr(locale,'Check-in QR & meetup mode','체크인 QR 및 밋업 모드')}<ArrowRight size={17}/></Link>}</section>;})}</div>{bookedEvents.length===0&&<Empty title={tr(locale,'No booked events yet.','예약된 이벤트가 아직 없어요.')} body={tr(locale,'Your confirmed bookings will appear here.','확정된 예약이 여기에 표시됩니다.')} href="/events" label={tr(locale,'Find an event','이벤트 찾기')}/>}</div>;}
 else if(sub==='tickets'){const progress=Math.min(1,ticketBalance/3);content=<div className="ticket-balance-page"><section className="ticket-balance-card"><div className="ticket-balance-ring" style={{background:`conic-gradient(var(--brand) 0deg ${progress*360}deg,#e9e8e2 ${progress*360}deg 360deg)`}}><div className="ticket-balance-inner"><strong>{ticketBalance}</strong><span>{tr(locale,ticketBalance===1?'ticket':'tickets','티켓')}</span></div></div><div className="ticket-balance-copy"><p className="eyebrow">{tr(locale,'AVAILABLE BALANCE','사용 가능 잔액')}</p><h1>{tr(locale,'Your remaining tickets','남은 티켓')}</h1><p>{tr(locale,'Use one ticket to confirm an available event instantly.','티켓 1장으로 참여 가능한 이벤트의 좌석을 바로 확정할 수 있어요.')}</p></div></section><Button href="/events">{tr(locale,'Find an event','이벤트 찾기')}</Button><Card label={tr(locale,'REFUNDS','환불')} title={tr(locale,'Your 90-day window','90일 유효기간')}>{tr(locale,'Unused tickets are refundable within their 90-day validity period. After a ticket is used for an event, the event cancellation rules apply.','사용하지 않은 티켓은 90일 유효기간 안에 환불할 수 있습니다. 이벤트에 사용된 티켓에는 해당 이벤트의 취소 규정이 적용됩니다.')}</Card></div>;}
 else if(sub==='verification')content=<><Card label={state.verification.toUpperCase()} title={state.verification==='Reviewing'?'We’re reviewing your account.':'Complete your verification'}>Social handles are never revealed to attendees. Changing your social account resets verification. Verification must clear before attending.</Card><Button href="/onboarding/verification/saturday-social">Update verification</Button></>;
 else if(sub==='safety')content=<><form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void work(async()=>{if(!demoMode)await api('reports',{reason:form.get('reason'),context:form.get('context'),kind:form.get('kind')});flash(demoMode?'Preview only. No report was sent.':'Your report was submitted for private review.');});}}><Field label={tr(locale,"SUBMISSION TYPE","접수 유형")}><select name="kind"><option value="report">{tr(locale,"Safety report","안전 신고")}</option><option value="feedback">{tr(locale,"Feedback / suggestion","피드백 / 제안")}</option></select></Field><Field label={tr(locale,"EVENT / CONTEXT","이벤트 / 관련 내용")}><input name="context" required maxLength={500} defaultValue={(searchParams.get("context")??"").slice(0,500)} placeholder="Event date and round or match"/></Field><Field label="WHAT HAPPENED?"><textarea name="reason" required minLength={10} placeholder="Describe your concern" rows={5}/></Field><Button type="submit" disabled={busy}>{tr(locale,"Submit privately","비공개로 제출하기")}</Button></form><Note>Harassment, intoxication, hate speech, unwanted contact, recording and sharing identities can lead to permanent removal. <Link href="/how-it-works">Read our safety principles.</Link></Note></>;
 else if(sub==='settings')content=<><Button secondary href="/onboarding/contact/saturday-social">Update contact details</Button><Button secondary href="/how-it-works">Privacy & event rules</Button><Button onClick={()=>work(async()=>{if(!demoMode){const {error}=await createClient().auth.signOut();if(error)throw error;}setState(initial);setAuthed(demoMode);router.push('/');router.refresh();})}><LogOut size={18}/>{demoMode?'Reset this preview':'Sign out'}</Button><section className="account-danger-zone"><p className="eyebrow">{tr(locale,'ACCOUNT','계정')}</p><h2>{tr(locale,'Delete account','계정 삭제')}</h2><p>{tr(locale,'Permanently remove your login and personal profile. Historical event, payment and safety records may be retained only in anonymized form.','로그인과 개인 프로필을 영구 삭제합니다. 과거 이벤트, 결제 및 안전 관련 기록은 익명화된 형태로만 보관될 수 있습니다.')}</p><button className="danger-button" type="button" onClick={()=>{setDeleteAccountConfirm('');setDeleteAccountOpen(true);}}><Trash2 size={18}/>{tr(locale,'Delete account','계정 삭제')}</button></section></>;
 else content=<><div className="profile-summary"><span className="avatar">{p.photos[0]?<Image className="avatar-image" src={p.photos[0]} alt={tr(locale,'Your profile photo','내 프로필 사진')} fill sizes="76px" unoptimized/>:<UserRound size={40}/>}</span><div className="profile-summary-copy"><h2>{p.full_name||tr(locale,'My Profile','내 프로필')}</h2><div className="profile-status-line"><span className={'verification-tag '+(verified?'verified':'unverified')}>{verified?<Check size={13}/>:<ShieldCheck size={13}/>} {verified?tr(locale,'Verified','인증 완료'):tr(locale,'Unverified','미인증')}</span></div></div></div><Button href={profileComplete(p)?'/onboarding/verification/saturday-social':'/onboarding/basics/saturday-social'}>{eligibleToApply?'Edit profile':'Complete profile'}</Button><Card label={tr(locale,'REFERRAL CODE','추천 코드')} title={tr(locale,'Invite someone to Roundy','Roundy에 친구 초대하기')}>{myReferralCode?<><p className="referral-code-value">{myReferralCode}</p><p>{tr(locale,'Friends can use this code once at checkout for a discount. Your own code cannot be used on your account.','친구는 결제 화면에서 이 코드를 한 번 사용해 할인을 받을 수 있어요. 본인 계정에서는 자신의 코드를 사용할 수 없습니다.')}</p><Button secondary onClick={()=>void shareReferralCode()}><Share2 size={18}/>{tr(locale,'Share referral code','추천 코드 공유')}</Button></>:<><p>{tr(locale,'Generate a personal code to give a friend a Roundy discount.','개인 추천 코드를 만들어 친구에게 Roundy 할인을 공유해 보세요.')}</p><Button secondary disabled={busy} onClick={()=>void generateReferralCode()}>{tr(locale,'Generate referral code','추천 코드 생성')}</Button></>}</Card><div className="menu-list">{[...[['events','My Events',CalendarDays],['tickets','Tickets & credits',Ticket],['verification','Verification',ShieldCheck],['/feedback',tr(locale,'First meetup feedback','첫 모임 피드백'),MessageCircle],['safety','Safety & reporting',Heart],['settings','Settings',UserRound]],...(isAdmin?[['/admin','Admin',ShieldCheck] as [string,string,typeof ShieldCheck]]:[])].map(([url,title,Icon])=>{const I=Icon as typeof Heart;const href=String(url).startsWith('/')?String(url):'/me/'+String(url);const ko=String(title)==='Admin'?'관리자':String(title);return <Link key={String(url)} href={href}><I size={22}/><span>{tr(locale,String(title),ko)}</span><ChevronRight size={18}/></Link>;})}</div></>;
 }
 else if(route==='check-in'&&parts[1])content=<AdminQrCheckIn token={parts[1]} locale={locale}/>;
 else if(route==='how-it-works'){
  const howType=parts[1]??'';
  const howNav=<nav className="how-format-switch" aria-label={tr(locale,'Choose an event format','이벤트 방식 선택')}>
   <Link className={howType==='mingle'?'active':''} href="/how-it-works/mingle">{tr(locale,'1:1 Mingle','1:1 밍글')}</Link>
   <Link className={howType==='business-talk'?'active':''} href="/how-it-works/business-talk">{tr(locale,'Business Talk','비즈니스 토크')}</Link>
  </nav>;
  if(howType==='mingle')content=<div className="how-page">
   <header className="how-hero">
    <p className="eyebrow">1:1 MINGLE / MUTUAL MATCH</p>
    <h1>{tr(locale,'Meet first. Match later.','먼저 만나고, 매칭은 나중에')}</h1>
    <p>{tr(locale,'A structured 1:1 rotation where you meet in person before deciding who you want to know better.','프로필을 먼저 넘겨보는 대신 실제로 1:1로 만나본 뒤, 더 알아가고 싶은 사람을 선택하는 방식입니다.')}</p>
   </header>
   {howNav}
   <div className="how-step-list">
    {[
     [tr(locale,'01 / RESERVE','01 / 예약'),tr(locale,'Choose a 1:1 Mingle','1:1 밍글 선택'),tr(locale,'Complete your profile and verification once, then reserve an available Mingle with a valid ticket or payment.','프로필과 인증을 한 번 완료한 뒤, 참여 가능한 1:1 밍글을 티켓 또는 결제로 예약합니다.')],
     [tr(locale,'02 / ROTATE','02 / 로테이션'),tr(locale,'Meet one person at a time','한 사람씩 직접 만나기'),tr(locale,'Arrive early with photo ID. At the event, you move through short hosted 1:1 conversations instead of browsing profiles beforehand.','사진이 있는 신분증을 지참하고 일찍 도착하세요. 현장에서는 프로필을 미리 보는 대신 짧은 1:1 대화를 순서대로 진행합니다.')],
     [tr(locale,'03 / CHOOSE','03 / 선택'),tr(locale,'Pick up to 3 Yes choices','최대 3명까지 Yes 선택'),tr(locale,'Your choices stay private. The other person cannot see whether you chose them unless the choice is mutual.','선택 결과는 비공개입니다. 서로 선택하기 전에는 상대방이 내가 누구를 선택했는지 알 수 없습니다.')],
     [tr(locale,'04 / MATCH','04 / 매칭'),tr(locale,'Only mutual choices unlock','서로 선택했을 때만 공개'),tr(locale,'When both people say Yes, the match appears after the event and you can see the profile and contact details needed to continue the conversation.','서로 Yes를 선택하면 이벤트 종료 후 매칭이 생성되고, 대화를 이어갈 수 있도록 프로필과 연락처가 공개됩니다.')]
    ].map(([label,title,body])=><Card key={label} label={label} title={title}>{body}</Card>)}
   </div>
   <Card label={tr(locale,'PRIVACY','개인정보')} title={tr(locale,'Private until it is mutual','서로 선택하기 전까지 비공개')}>{tr(locale,'Photos, verification handles, choices and contact details are not shown as a public attendee roster. Verification handles are never shared with other attendees.','사진, 인증 계정, 선택 결과, 연락처는 공개 참가자 명단처럼 노출되지 않습니다. 인증에 사용한 계정은 다른 참가자에게 공유되지 않습니다.')}</Card>
   <Card label={tr(locale,'SAFETY','안전')} title={tr(locale,'Respect is the entry requirement','존중이 참여의 기본 조건입니다')}>{tr(locale,'Harassment, hate speech, intoxication, recording or sharing another person’s identity can lead to removal and exclusion from future events.','괴롭힘, 혐오 표현, 과도한 음주 상태, 무단 촬영 또는 타인의 신원 공유는 현장 퇴장 및 향후 참여 제한 사유가 될 수 있습니다.')}</Card>
   <Button href="/events?category=1%3A1%20Speed%20Mingle">{tr(locale,'See 1:1 Mingle events','1:1 밍글 이벤트 보기')}</Button>
   <Button secondary href="/me/safety">{tr(locale,'Report a concern','문제 신고하기')}</Button>
  </div>;
  else if(howType==='business-talk')content=<div className="how-page">
   <header className="how-hero">
    <p className="eyebrow">BUSINESS TALK / SMALL GROUP ENGLISH</p>
    <h1>{tr(locale,'Skip small talk. Start with an idea.','스몰토크 대신, 이야기할 주제로 시작하세요')}</h1>
    <p>{tr(locale,'Business Talk uses the discussion format developed through our earlier 1 Cup English community: a prepared topic, useful material and a hosted small-group conversation.','비즈니스 토크는 기존 영어 한잔에서 운영해 온 토론 방식을 바탕으로 합니다. 준비된 주제와 자료, 질문을 중심으로 소그룹 영어 대화를 진행합니다.')}</p>
   </header>
   {howNav}
   <div className="how-step-list">
    {[
     [tr(locale,'01 / CHOOSE','01 / 주제 선택'),tr(locale,'Choose a topic worth discussing','이야기할 가치가 있는 주제 선택'),tr(locale,'Pick a Business Talk around business, technology, careers, society or culture. Each event is built around a specific discussion theme.','비즈니스, 기술, 커리어, 사회, 문화 등 하나의 명확한 토론 주제를 중심으로 이벤트를 선택합니다.')],
     [tr(locale,'02 / PREVIEW','02 / 미리보기'),tr(locale,'Check the material if you want','원한다면 자료를 미리 확인'),tr(locale,'The topic, short reading and discussion questions are provided in advance when available. Preparation is optional, but a quick look helps you go deeper once the conversation starts.','가능한 경우 주제, 짧은 읽을거리, 토론 질문을 미리 제공합니다. 사전 준비는 필수가 아니지만, 가볍게 확인하면 현장에서 더 깊은 대화를 나누기 좋습니다.')],
     [tr(locale,'03 / DISCUSS','03 / 토론'),tr(locale,'Join a hosted small group','진행자가 있는 소그룹 토론'),tr(locale,'A facilitator keeps the discussion moving with prepared prompts and follow-up questions. The point is not random icebreakers or “How was your weekend?” small talk, but explaining your view and responding to other people’s ideas in English.','진행자가 준비된 질문과 추가 질문으로 대화를 이어갑니다. 랜덤 아이스브레이킹이나 “주말 어땠어요?”식 스몰토크가 아니라, 자신의 생각을 영어로 설명하고 다른 사람의 관점에 반응하는 데 집중합니다.')],
     [tr(locale,'04 / CONNECT','04 / 연결'),tr(locale,'Meet people through how they think','생각하는 방식을 통해 사람을 만나기'),tr(locale,'Business Talk has no Yes/No matching step. You meet people naturally through the group conversation and can keep in touch when both sides want to continue.','비즈니스 토크에는 Yes/No 매칭 단계가 없습니다. 그룹 대화 속에서 자연스럽게 서로를 알아가고, 양쪽이 원할 때 관계를 이어갑니다.')]
    ].map(([label,title,body])=><Card key={label} label={label} title={title}>{body}</Card>)}
   </div>
   <Card label={tr(locale,'FROM 1 CUP ENGLISH','영어 한잔 방식')} title={tr(locale,'Discussion before networking','네트워킹보다 대화가 먼저')}>{tr(locale,'The format comes from the recurring 1 Cup English meetups: prepared discussion topics, facilitator-led conversation and a room designed for people who want more than a generic language exchange.','영어 한잔의 반복형 모임에서 사용해 온 방식처럼, 준비된 토론 주제와 진행자 중심의 대화를 사용합니다. 일반적인 언어교환보다 내용 있는 대화를 원하는 사람을 위한 구조입니다.')}</Card>
   <Card label={tr(locale,'SAFETY','안전')} title={tr(locale,'A respectful room for everyone','누구에게나 존중받는 대화 공간')}>{tr(locale,'Do not record others, share private information without permission, harass participants or dominate the room. Staff can intervene when conduct makes the discussion unsafe or uncomfortable.','다른 참가자를 무단 촬영하거나 개인정보를 허락 없이 공유하지 마세요. 괴롭힘이나 일방적인 대화 독점 등 다른 사람을 불편하게 만드는 행동에는 운영진이 개입할 수 있습니다.')}</Card>
   <Button href="/events?category=Business%20Talk">{tr(locale,'See Business Talk events','비즈니스 토크 이벤트 보기')}</Button>
   <Button secondary href="/me/safety">{tr(locale,'Report a concern','문제 신고하기')}</Button>
  </div>;
  else content=<div className="how-page">
   <header className="how-hero">
    <p className="eyebrow">{tr(locale,'HOW ROUNDY WORKS','ROUNDY 이용 방법')}</p>
    <h1>{tr(locale,'Two formats. Two different ways to meet.','두 가지 모임, 서로 다른 만남 방식')}</h1>
    <p>{tr(locale,'1:1 Mingle is built around private mutual matching. Business Talk is a hosted small-group English discussion. Choose the format that matches what you want from the evening.','1:1 밍글은 비공개 상호 매칭을 중심으로 하고, 비즈니스 토크는 진행자가 이끄는 소그룹 영어 토론입니다. 원하는 만남 방식에 맞춰 선택하세요.')}</p>
   </header>
   {howNav}
   <div className="how-format-grid">
    <Link href="/how-it-works/mingle" className="how-format-card">
     <span className="eyebrow">1:1 / MUTUAL MATCH</span>
     <h2>{tr(locale,'1:1 Mingle','1:1 밍글')}</h2>
     <p>{tr(locale,'Short 1:1 rotations, private Yes choices and contact details only after a mutual match.','짧은 1:1 로테이션 후 비공개 Yes 선택을 하고, 서로 선택했을 때만 연락처가 공개됩니다.')}</p>
     <span>{tr(locale,'See how it works','이용 방법 보기')} <ArrowRight size={17}/></span>
    </Link>
    <Link href="/how-it-works/business-talk" className="how-format-card">
     <span className="eyebrow">SMALL GROUP / ENGLISH</span>
     <h2>{tr(locale,'Business Talk','비즈니스 토크')}</h2>
     <p>{tr(locale,'Prepared topics, optional pre-reading and facilitator-led discussion based on the 1 Cup English format.','영어 한잔 방식처럼 준비된 주제와 선택형 사전 자료, 진행자 중심의 소그룹 토론으로 진행합니다.')}</p>
     <span>{tr(locale,'See how it works','이용 방법 보기')} <ArrowRight size={17}/></span>
    </Link>
   </div>
   <Card label={tr(locale,'SHARED STANDARD','공통 운영 원칙')} title={tr(locale,'Verification, privacy and respect','인증, 개인정보 보호, 존중')}>{tr(locale,'Both formats use reviewed profiles and clear conduct rules. Private verification information is not exposed to other attendees, and safety reports are reviewed by staff.','두 모임 모두 검토된 프로필과 명확한 운영 규칙을 사용합니다. 인증에 사용한 비공개 정보는 다른 참가자에게 노출되지 않으며, 안전 신고는 운영진이 검토합니다.')}</Card>
   <Button href="/events">{tr(locale,'Explore all events','모든 이벤트 보기')}</Button>
  </div>;
 }
 else if(route==='feedback')content=<FeedbackPage locale={locale}/>;
 else if(route==='about')content=<AboutUs locale={locale}/>;
 else if(route==='terms')content=<TermsOfUse locale={locale}/>;
 else if(route==='privacy')content=<PrivacyPolicy locale={locale}/>;
 else if(route==='copyright')content=<CopyrightPolicy locale={locale}/>;
 else content=<Empty title={tr(locale,'This page isn’t here.','이 페이지를 찾을 수 없어요.')} body={tr(locale,'Let’s find your next evening instead.','대신 다음 이벤트를 찾아 볼까요?')} href="/discover" label={tr(locale,'Explore events','이벤트 둘러보기')}/>;
 const wide=['home','discover','payment'].includes(route)||(route==='events'&&!event);const privateRoute=['onboarding','applications','checkout','ticket','event-night','matches','me','admin','check-in','feedback'].includes(route);
 if(!demoMode&&ready&&!authed&&privateRoute)content=<Empty title={tr(locale,'Your evenings are personal.','당신의 저녁은 개인적인 시간이에요.')} body={tr(locale,'Sign in to manage your profile, tickets and matches.','로그인하고 프로필, 티켓, 매칭을 관리하세요.')} href={'/signin/'+slug} label={tr(locale,'Sign in','로그인')}/>;
 return <RoundyLocaleContext.Provider value={locale}><div className={"experience route-"+route}><a className="skip" href="#main">{tr(locale,'Skip to content','본문으로 건너뛰기')}</a>{wizardHeader??<header className="site-header"><Link className="wordmark" href="/"><RoundyBrand/></Link><nav aria-label={tr(locale,'Desktop navigation','데스크톱 내비게이션')}>{nav.map(n=><Link className={n.on?'active':''} key={n.href} href={n.href}>{n.text}</Link>)}</nav><div className="header-actions"><LocaleToggle locale={locale} onChange={setLanguage}/><Link className="header-signin" href={authed?"/me":"/signin"}>{authed&&p.photos[0]&&<span className="nav-avatar"><Image src={p.photos[0]} alt="" fill sizes="28px" unoptimized/></span>}{authed?tr(locale,'My Profile','내 프로필'):tr(locale,'Sign In','로그인')}</Link></div></header>}{demoMode&&<div className="preview-strip">{tr(locale,'Interactive preview','인터랙티브 미리보기')} <span>{tr(locale,'· Sample events · No payments or messages sent','· 예시 이벤트 · 결제나 메시지는 전송되지 않아요')}</span></div>}<main id="main" className={'content '+(wide?'wide':'narrow')} aria-busy={!ready||busy||routeLoading||eventsLoading}>{ready&&<Localized>{content}</Localized>}</main>{consentEvent&&<div className="modal-backdrop registration-backdrop" onMouseDown={()=>{if(!busy)setConsentEvent(null);}}><section className="roundy-modal registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title" onMouseDown={e=>e.stopPropagation()}><header><div><p className="eyebrow">{tr(locale,'BEFORE YOU JOIN','참여 전 확인')}</p><h2 id="registration-title">{headline(localizeEvent(consentEvent,locale).title)}</h2></div><button className="icon-button" type="button" aria-label={tr(locale,'Close','닫기')} onClick={()=>setConsentEvent(null)} disabled={busy}><X size={20}/></button></header><div className="registration-notes"><p><Check size={18}/><span>{tr(locale,'If you have a valid ticket, one ticket is redeemed and your seat is confirmed immediately.','유효한 티켓이 있으면 티켓 1장이 사용되고 좌석이 즉시 확정됩니다.')}</span></p>{eventCategory(consentEvent)==='1:1 Speed Mingle'&&<p><Check size={18}/><span>{tr(locale,'You are enrolled in the roster group that matches the gender on your approved profile.','승인된 프로필의 성별에 따라 해당 참가 그룹에 자동 등록됩니다.')}</span></p>}<p><Check size={18}/><span>{tr(locale,'Bring photo ID and arrive 15 minutes early.','사진이 있는 신분증을 지참하고 15분 일찍 도착해 주세요.')}</span></p></div><label className="check-row registration-check"><input type="checkbox" checked={consentCancellation} onChange={e=>setConsentCancellation(e.target.checked)}/><span>{tr(locale,'I have read the cancellation and refund rules in the ','취소 및 환불 규정을 ')}<Link href="/terms" target="_blank">{tr(locale,'Terms of Use','이용약관')}</Link>{tr(locale,'.','에서 확인했습니다.')}</span></label><label className="check-row registration-check"><input type="checkbox" checked={consentTerms} onChange={e=>setConsentTerms(e.target.checked)}/><span>{tr(locale,'I agree to the ','다음 내용에 동의합니다: ')}<Link href="/terms" target="_blank">{tr(locale,'Terms of Use','이용약관')}</Link>{tr(locale,' and ',' 및 ')}<Link href="/privacy" target="_blank">{tr(locale,'Privacy Policy','개인정보 처리방침')}</Link>.</span></label><Button disabled={busy||!consentCancellation||!consentTerms} onClick={()=>void confirmRegistration()}>{busy?tr(locale,'Registering…','등록 중…'):tr(locale,'Confirm event registration','이벤트 등록 확정')}</Button><p className="registration-footnote">{tr(locale,'No valid ticket yet? After confirmation, you will continue to checkout instead.','유효한 티켓이 아직 없다면 확인 후 결제 화면으로 이동합니다.')}</p></section></div>}{deleteAccountOpen&&<div className="modal-backdrop account-delete-backdrop" onMouseDown={()=>{if(!busy)setDeleteAccountOpen(false);}}><section className="roundy-modal account-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onMouseDown={e=>e.stopPropagation()}><header><div><p className="eyebrow">{tr(locale,'PERMANENT ACTION','영구 작업')}</p><h2 id="delete-account-title">{tr(locale,'Delete account?','계정을 삭제할까요?')}</h2></div><button className="icon-button" type="button" aria-label={tr(locale,'Close','닫기')} onClick={()=>setDeleteAccountOpen(false)} disabled={busy}><X size={20}/></button></header><div className="account-delete-warning"><p>{tr(locale,'Your sign-in account, profile, verification data and uploaded identity media will be permanently removed.','로그인 계정, 프로필, 인증 정보 및 업로드한 신원 관련 파일이 영구 삭제됩니다.')}</p><p>{tr(locale,'Past event, payment and safety records are kept only as anonymized operational history. Future event registrations are cancelled. This cannot be undone.','과거 이벤트, 결제 및 안전 관련 기록은 익명화된 운영 기록으로만 보관됩니다. 향후 이벤트 예약은 취소됩니다. 이 작업은 되돌릴 수 없습니다.')}</p></div><label className="delete-confirm-field"><span>{tr(locale,'Type ','아래에 ')}<b>delete account</b>{tr(locale,' to confirm.','를 입력해 확인하세요.')}</span><input value={deleteAccountConfirm} onChange={e=>setDeleteAccountConfirm(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="delete account"/></label><div className="account-delete-actions"><button className="button secondary" type="button" onClick={()=>setDeleteAccountOpen(false)} disabled={busy}>{tr(locale,'Cancel','취소')}</button><button className="danger-button solid" type="button" onClick={()=>void deleteAccount()} disabled={busy||deleteAccountConfirm!=='delete account'}><Trash2 size={18}/>{busy?tr(locale,'Deleting…','삭제 중…'):tr(locale,'Delete account','계정 삭제')}</button></div></section></div>}{(!ready||busy||routeLoading||eventsLoading)&&<LoadingScreen/>}<SiteFooter locale={locale}/>{ready&&authed&&!demoMode&&<AccountConsent locale={locale} path={path}/>}{!['onboarding','admin','terms','privacy','copyright'].includes(route)&&<nav className="bottom-nav" aria-label={tr(locale,'Main navigation','주요 내비게이션')}>{nav.map(n=><Link aria-current={n.on?'page':undefined} className={n.on?'active':''} href={n.href} key={n.href}><n.icon size={22} strokeWidth={n.on?2:1.5}/><span>{n.text}</span></Link>)}</nav>}</div></RoundyLocaleContext.Provider>;
}
