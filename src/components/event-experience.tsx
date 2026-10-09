'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarDays, Check, Clock3, MapPin, Search, Ticket } from 'lucide-react';
import { Heading } from '@/components/heading';
import type { Event } from '@/lib/data';
import { eventLanguageLabel } from '@/lib/event-presentation';
import { eventCategory } from '@/lib/data';
import { eventCalendarUrl, eventHasEnded, eventPriceLabel, venueDirections } from '@/lib/event-experience';
import { dateLabelForLocale, localizeEvent, timeLabelForLocale, tr, type Locale } from '@/lib/locale';

export type PendingEventPayment = { order_number: string; status: string; amount: number };

export function EventSummary({ event, locale }: { event: Event; locale: Locale }) {
  const copy = localizeEvent(event, locale);
  return <div className="event-summary">
    <div className="event-summary-image"><Image src={event.image || '/images/yeouido.webp'} alt="" fill sizes="80px"/></div>
    <div className="event-summary-copy">
      <Heading level={3}>{copy.title}</Heading>
      <p><CalendarDays size={15}/><span>{dateLabelForLocale(event.starts_at, locale)} {timeLabelForLocale(event.starts_at, locale)} KST</span></p>
      <p><MapPin size={15}/><span>{copy.venue}</span></p>
      <span className="event-summary-language">{eventLanguageLabel(event.event_language, locale)}</span>
    </div>
  </div>;
}

export function EventQuickActions({ event, locale, calendar = false }: { event: Event; locale: Locale; calendar?: boolean }) {
  return <div className="event-quick-actions">
    <Link className="experience-button" href={'/ticket/' + event.slug}><Ticket size={18}/>{tr(locale, 'My Ticket', '내 티켓')}</Link>
    <a className="experience-button secondary" href={venueDirections(event, locale)} target="_blank" rel="noopener noreferrer"><MapPin size={18}/>{tr(locale, 'Directions', '길찾기')}</a>
    {calendar && <a className="experience-button secondary calendar-action" href={eventCalendarUrl(event, locale)} target="_blank" rel="noopener noreferrer"><CalendarDays size={18}/>{tr(locale, 'Add to Google Calendar', 'Google 캘린더에 추가')}</a>}
  </div>;
}

export function CompactEventList({ events, locale }: { events: Event[]; locale: Locale }) {
  return <div className="compact-event-list">{events.map(event => <Link key={event.id} className="compact-event-row" href={'/events/' + event.slug}>
    <EventSummary event={event} locale={locale}/>
    <div className="compact-event-meta"><strong>{eventPriceLabel(event, locale)}</strong><span className={'event-state-badge ' + (event.seats_remaining <= 0 ? 'neutral' : 'available')}>
      {event.seats_remaining <= 0 ? tr(locale, 'Sold out', '마감') : tr(locale, event.seats_remaining + ' seats left', '잔여 ' + event.seats_remaining + '석')}
    </span></div>
  </Link>)}</div>;
}

export function ReturningDiscovery({ events, booked, locale }: { events: Event[]; booked: Record<string, boolean>; locale: Locale }) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const upcoming = events.filter(event => event.status === 'live' && Date.parse(event.starts_at) > Date.now()).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const next = events.filter(event => booked[event.slug] && !eventHasEnded(event)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
  const matches = upcoming.filter(event => {
    const copy = localizeEvent(event, locale);
    return (category === 'all' || eventCategory(event) === category) && (copy.title + ' ' + copy.venue + ' ' + event.neighborhood).toLowerCase().includes(query.trim().toLowerCase());
  });
  return <div className="returning-discovery event-experience">
    {next && <section className="next-event-section"><div className="experience-section-title"><Heading level={2}>{tr(locale, 'Your next plan', '다가오는 내 모임')}</Heading><Link href="/me/events">{tr(locale, 'View all', '전체 보기')}</Link></div>
      <article className="next-event-card"><span className="event-state-badge confirmed"><Check size={14}/>{tr(locale, 'Confirmed', '예약 확정')}</span><EventSummary event={next} locale={locale}/><EventQuickActions event={next} locale={locale}/></article>
    </section>}
    <header className="experience-heading"><Heading level={1}>{tr(locale, 'Explore Seoul', '서울에서 만나요')}</Heading><p>{tr(locale, 'Find your next conversation.', '다음 대화가 시작될 모임을 찾아보세요.')}</p></header>
    <label className="event-search"><Search size={18}/><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={tr(locale, 'Search events or neighborhoods', '모임 또는 지역 검색')} aria-label={tr(locale, 'Search events', '모임 검색')}/></label>
    <div className="experience-filters" aria-label={tr(locale, 'Event type', '모임 유형')}>{[
      ['all', tr(locale, 'All', '전체')], ['Language Exchange', tr(locale, 'Language Exchange', '언어교환')], ['1:1 Speed Mingle', tr(locale, '1:1 Mingle', '1:1 밍글')],
    ].map(([value, label]) => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{label}</button>)}</div>
    {matches.length ? <CompactEventList events={matches} locale={locale}/> : <div className="experience-empty"><CalendarDays size={28}/><Heading level={2}>{tr(locale, 'No events here yet', '아직 모임이 없어요')}</Heading><p>{query ? tr(locale, 'Try another name or neighborhood.', '다른 이름이나 지역으로 검색해 보세요.') : tr(locale, 'New dates will appear here when they are announced.', '새로운 일정이 공개되면 여기에서 확인할 수 있어요.')}</p></div>}
    <Link className="experience-program-link" href="/language-exchange"><span><b>{tr(locale, 'Roundy Language Exchange', 'Roundy 언어교환')}</b><small>{tr(locale, 'Explore the program and how it works', '프로그램과 진행 방식 알아보기')}</small></span><span aria-hidden="true">↗</span></Link>
  </div>;
}

export function MyEvents({ events, booked, pendingPayments, locale }: { events: Event[]; booked: Record<string, boolean>; pendingPayments: Record<string, PendingEventPayment>; locale: Locale }) {
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const confirmed = events.filter(event => booked[event.slug]);
  const selected = confirmed.filter(event => eventHasEnded(event) === (view === 'past')).sort((a, b) => (view === 'past' ? -1 : 1) * (Date.parse(a.starts_at) - Date.parse(b.starts_at)));
  const pending = events.filter(event => pendingPayments[event.slug] && !booked[event.slug]);
  return <section className="my-events-page event-experience">
    <header className="experience-heading"><Heading level={1}>{tr(locale, 'My Events', '내 모임')}</Heading><p>{tr(locale, 'Your plans, tickets and memories.', '다가오는 모임과 티켓, 함께한 시간을 확인하세요.')}</p></header>
    <div className="experience-tabs" aria-label={tr(locale, 'Event history', '모임 내역')}>{(['upcoming', 'past'] as const).map(value => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>{value === 'upcoming' ? tr(locale, 'Upcoming', '예정된 모임') : tr(locale, 'Past', '지난 모임')}</button>)}</div>
    <div className="my-events-list">{selected.map(event => <article className="experience-booking" key={event.id}>
      <span className={'event-state-badge ' + (view === 'past' ? 'neutral' : 'confirmed')}><Check size={14}/>{view === 'past' ? tr(locale, 'Ended', '종료') : tr(locale, 'Confirmed', '예약 확정')}</span>
      <EventSummary event={event} locale={locale}/>
      {view === 'upcoming' && <><EventQuickActions event={event} locale={locale} calendar/><p className="experience-caption">{tr(locale, 'Arrive 15 minutes early and bring photo ID.', '15분 일찍 도착하고 사진이 있는 신분증을 지참해 주세요.')}</p></>}
      <Link className="experience-text-link" href={'/events/' + event.slug}>{tr(locale, 'View event details', '모임 상세 보기')}</Link>
    </article>)}</div>
    {selected.length === 0 && <div className="experience-empty"><Ticket size={32}/><Heading level={2}>{view === 'past' ? tr(locale, 'No past events yet', '아직 지난 모임이 없어요') : tr(locale, 'Make your next plan', '다음 모임을 찾아보세요')}</Heading><p>{tr(locale, 'Confirmed bookings appear here.', '예약이 확정된 모임이 여기에 표시돼요.')}</p><Link className="experience-button" href="/events">{tr(locale, 'Explore events', '모임 둘러보기')}</Link></div>}
    {view === 'upcoming' && pending.length > 0 && <section className="pending-events"><Heading level={2}>{tr(locale, 'Payment pending', '결제 확인 중')}</Heading>{pending.map(event => <article className="experience-booking pending" key={event.id}>
      <span className="event-state-badge pending"><Clock3 size={14}/>{tr(locale, 'Payment pending', '결제 확인 중')}</span><EventSummary event={event} locale={locale}/><p className="experience-caption">{tr(locale, 'Your seat is not confirmed yet. Review the existing payment before trying again.', '아직 좌석이 확정되지 않았어요. 다시 결제하기 전에 기존 결제 상태를 확인해 주세요.')}</p><Link className="experience-button secondary" href={'/checkout/' + event.slug}>{tr(locale, 'Review payment', '결제 확인하기')}</Link>
    </article>)}</section>}
  </section>;
}
