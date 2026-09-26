'use client';

import Link from 'next/link';
import { ArrowRight,Check,MapPin } from 'lucide-react';
import { dateLabelForLocale,timeLabelForLocale,tr,type Locale } from '@/lib/locale';
import { eventCategory,localizeEvent,type Event } from '@/lib/data';

export function MyEventsPage({events,booked,locale,hasActiveEvent}:{events:Event[];booked:Record<string,boolean>;locale:Locale;hasActiveEvent:boolean}){
 const bookedEvents=events.filter(event=>booked[event.slug]);

 return <div className="my-events-page">
  <header className="subpage-heading">
   <div className="heading-with-alert"><p className="eyebrow">{tr(locale,'MY EVENTS','내 이벤트')}</p>{hasActiveEvent&&<span className="activity-dot" aria-label={tr(locale,'An event is active','진행 중인 이벤트가 있습니다')}/>}</div>
   <h1>{tr(locale,'Your confirmed plans','확정된 일정')}</h1>
  </header>
  <div className="my-events-list">
   {bookedEvents.map(event=>{
    const item=localizeEvent(event,locale);
    return <section className="booking-ticket" key={event.id}>
     <div className="booking-ticket-top"><span>{tr(locale,'BOOKING CONFIRMED','예약 확정')}</span><Check size={18}/></div>
     <div className="booking-ticket-main"><h2>{dateLabelForLocale(event.starts_at,locale)} · {timeLabelForLocale(event.starts_at,locale)}</h2><p className="booking-ticket-venue"><MapPin size={17}/>{item.venue}</p></div>
     <div className="booking-ticket-divider"/>
     <div className="booking-ticket-notes"><p>{tr(locale,'Arrive 15 minutes early and bring photo ID.','15분 일찍 도착하고 사진이 있는 신분증을 지참해 주세요.')}</p><p>{tr(locale,'Your booking is attached to your account. The host will verify your identity at check-in.','예약은 계정에 연결되어 있습니다. 체크인 시 호스트가 신원을 확인합니다.')}</p></div>
     <div className="booking-ticket-actions">
      <Link className="booking-ticket-secondary-action" href={'/events/'+event.slug}>{tr(locale,'Check Details','상세 보기')}</Link>
      {eventCategory(event)==='1:1 Speed Mingle'&&<Link className="booking-ticket-action" href={'/event-night/'+event.slug}>{tr(locale,'Join Event','이벤트 참여')}<ArrowRight size={17}/></Link>}
     </div>
    </section>;
   })}
  </div>
  {!bookedEvents.length&&<section className="empty"><CalendarPlaceholder/><h2>{tr(locale,'No booked events yet.','예약된 이벤트가 아직 없어요.')}</h2><p>{tr(locale,'Your confirmed bookings will appear here.','확정된 예약이 여기에 표시됩니다.')}</p><Link className="button" href="/events">{tr(locale,'Find an event','이벤트 찾기')}</Link></section>}
 </div>;
}

function CalendarPlaceholder(){return <span className="empty-calendar" aria-hidden="true"><span/></span>;}
