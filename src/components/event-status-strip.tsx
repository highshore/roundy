'use client';

import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import type { Event } from '@/lib/data';
import { countdownParts, eventStatus, type EventStatusKind } from '@/lib/event-status';
import { tr, type Locale } from '@/lib/locale';

type Counts = { total: number; women_count: number; men_count: number };
const labels: Record<EventStatusKind, [string, string]> = {
  early: ['Early Bird', '얼리버드'], imminent: ['Imminent', '시작 임박'],
  'almost-full': ['Almost Full', '마감 임박'], available: ['Available', '참가 가능'],
  full: ['Full', '마감'], started: ['In Progress', '진행 중'], ended: ['Ended', '종료'], closed: ['Closed', '신청 종료'],
};

export function EventStatusStrip({ event, attendees, locale, compact = false }: { event: Event; attendees?: Counts; locale: Locale; compact?: boolean }) {
  // A stable first render avoids a server/client clock hydration mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const status = now === null ? null : eventStatus(event, attendees, now);
  const remaining = status?.deadline != null && now !== null ? countdownParts(status.deadline, now) : null;
  const timer = remaining ? `${remaining.days ? remaining.days + tr(locale, 'd ', '일 ') : ''}${String(remaining.hours).padStart(2, '0')}:${String(remaining.minutes).padStart(2, '0')}:${String(remaining.seconds).padStart(2, '0')}` : null;
  const showPrimary = status && !(status.kind === 'available' && status.discount);
  return <div className={`event-status-strip${compact ? ' compact' : ''}`} data-status={status?.kind ?? 'loading'}>
    <div className="event-status-info">
      <div className="event-status-labels">
        {showPrimary && <span className="event-status-badge">{tr(locale, ...labels[status.kind])}</span>}
        {status?.discount && <span className="event-status-badge balance">{status.discount === 'gents' ? tr(locale, 'Gents Discount (-10%)', '남성 할인 (-10%)') : tr(locale, 'Ladies Discount (-10%)', '여성 할인 (-10%)')}</span>}
        {!status && <span className="event-status-badge">{tr(locale, 'Checking Availability', '참가 현황 확인 중')}</span>}
      </div>
      {timer && <span className="event-status-timer"><Clock3 size={12} aria-hidden="true"/><span>{status?.kind === 'early' ? tr(locale, 'Ends in ', '마감까지 ') : tr(locale, 'Starts in ', '시작까지 ')}<time dateTime={new Date(status!.deadline!).toISOString()}>{timer}</time></span></span>}
    </div>
    <span className="event-status-count" aria-label={tr(locale, 'Confirmed attendees / capacity', '확정 참가자 / 정원')}>({attendees?.total ?? '—'} / {event.capacity})</span>
  </div>;
}
