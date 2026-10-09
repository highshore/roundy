'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarDays, Check, MapPin, Ticket } from 'lucide-react';
import { Heading } from '@/components/heading';
import type { Event } from '@/lib/data';
import { eventHasEnded, ticketStateUrl, venueDirections } from '@/lib/event-experience';
import { dateLabelForLocale, localizeEvent, timeLabelForLocale, tr, type Locale } from '@/lib/locale';

type TicketState = { check_in_url: string | null; checked_in_at: string | null };

export function TicketView({ event, locale, qr, checkedIn, loading, error, onRetry }: { event: Event; locale: Locale; qr: string; checkedIn: boolean; loading: boolean; error: string; onRetry: () => void }) {
  const copy = localizeEvent(event, locale);
  const ended = eventHasEnded(event);
  return <section className="event-ticket-page event-experience">
    <Link className="experience-text-link" href="/me/events">{tr(locale, 'Back to My Events', '내 모임으로 돌아가기')}</Link>
    <header className="experience-heading"><Heading level={1}>{tr(locale, 'My Ticket', '내 티켓')}</Heading><Heading level={2}>{copy.title}</Heading></header>
    <span className={'event-state-badge ' + (ended ? 'neutral' : 'confirmed')}><Check size={16}/>{ended ? tr(locale, 'Event ended', '모임 종료') : checkedIn ? tr(locale, 'Checked in', '체크인 완료') : tr(locale, 'Booking confirmed', '예약 확정')}</span>
    <div className="admission-qr" aria-busy={loading}>
      {loading ? <p role="status">{tr(locale, 'Loading your ticket…', '티켓을 불러오고 있어요…')}</p> : error ? <div role="alert"><p>{error}</p><button className="experience-button secondary" type="button" onClick={onRetry}>{tr(locale, 'Try again', '다시 시도')}</button></div> : checkedIn || ended ? <><Check size={60}/><p>{checkedIn ? tr(locale, 'You’re checked in', '체크인이 완료됐어요') : tr(locale, 'Thanks for joining us', '함께해 주셔서 고마워요')}</p></> : qr ? <Image src={qr} alt={tr(locale, 'Your admission QR code', '내 체크인 QR 코드')} width={294} height={294} unoptimized/> : <><Ticket size={40}/><p>{tr(locale, 'Your QR is not available. Show your booking to the host for help.', 'QR을 불러올 수 없어요. 호스트에게 예약 내역을 보여 주세요.')}</p></>}
    </div>
    <div className="ticket-event-meta"><p><CalendarDays size={18}/><span>{dateLabelForLocale(event.starts_at, locale)} {timeLabelForLocale(event.starts_at, locale)} KST</span></p><p><MapPin size={18}/><span>{copy.venue}</span></p></div>
    {!ended && <p className="experience-caption">{tr(locale, 'Show this code to your host. Arrive 15 minutes early and bring photo ID.', '호스트에게 QR 코드를 보여 주세요. 15분 일찍 도착하고 사진이 있는 신분증을 지참해 주세요.')}</p>}
    <a className="experience-button secondary" href={venueDirections(event, locale)} target="_blank" rel="noopener noreferrer"><MapPin size={18}/>{tr(locale, 'Directions', '길찾기')}</a>
    {!ended && <Link className="experience-button" href={'/event-night/' + event.slug}>{tr(locale, 'Open meetup mode', '모임 진행 화면 열기')}</Link>}
  </section>;
}

export function EventTicket({ event, locale }: { event: Event; locale: Locale }) {
  const [ticket, setTicket] = useState<TicketState | null>(null);
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setTicket(null); setQr(''); setError('');
    async function load() {
      try {
        const response = await fetch('/api/event-night/' + event.id, { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.state) throw new Error('Ticket unavailable');
        const state = result.state as TicketState;
        const url = ticketStateUrl(state.check_in_url);
        let image = '';
        if (url && !state.checked_in_at && !eventHasEnded(event)) {
          const QRCode = (await import('qrcode')).default;
          image = await QRCode.toDataURL(url, { width: 588, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#20211f', light: '#ffffff' } });
        }
        if (!controller.signal.aborted) { setTicket(state); setQr(image); }
      } catch {
        if (!controller.signal.aborted) setError(tr(locale, 'We couldn’t load your ticket. Please try again.', '티켓을 불러오지 못했어요. 다시 시도해 주세요.'));
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [event.id, event.ends_at, locale, attempt]); // The remaining event fields are only presentation data.
  return <TicketView event={event} locale={locale} qr={qr} checkedIn={Boolean(ticket?.checked_in_at)} loading={loading} error={error} onRetry={() => setAttempt(value => value + 1)}/>;
}
