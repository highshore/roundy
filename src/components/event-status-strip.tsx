'use client';

import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import type { Event } from '@/lib/data';
import { countdownParts, eventStatus, type EventStatusKind } from '@/lib/event-status';
import { tr, type Locale } from '@/lib/locale';

type Counts = { total: number; women_count: number; men_count: number };
const labels: Record<EventStatusKind, [string, string]> = {
  early: ['Early Bird · 10% Off', '얼리버드 10% 할인'], imminent: ['Lockdown Deal · 10% Off', '락다운 10% 할인'],
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
  const open = status && ['early', 'imminent', 'available', 'almost-full'].includes(status.kind);
  const timingRate = status?.kind === 'early' || status?.kind === 'imminent' ? 10 : 0;
  const hasOffer = Boolean(open && (timingRate || status?.discount));
  return <div className={`event-status-strip${compact ? ' compact' : ''}${hasOffer ? ' has-offer' : ''}`} data-status={status?.kind ?? 'loading'}>
    <div className="event-status-info">
      <div className="event-status-labels">
        {showPrimary && <span className="event-status-badge">{tr(locale, ...labels[status.kind])}</span>}
        {status?.discount && <span className="event-status-badge balance">{status.discount === 'gents' ? tr(locale, 'Gents Extra 10% Off', '남성 추가 10% 할인') : tr(locale, 'Ladies Extra 10% Off', '여성 추가 10% 할인')}</span>}
        {!status && <span className="event-status-badge">{tr(locale, 'Checking Availability', '참가 현황 확인 중')}</span>}
      </div>
      {timer && <span className="event-status-timer"><Clock3 size={12} aria-hidden="true"/><span>{status?.kind === 'early' ? tr(locale, 'Ends in ', '마감까지 ') : tr(locale, 'Starts in ', '시작까지 ')}<time dateTime={new Date(status!.deadline!).toISOString()}>{timer}</time></span></span>}
    </div>
    <span className="event-status-count" aria-label={tr(locale, 'Confirmed attendees / capacity', '확정 참가자 / 정원')}>({attendees?.total ?? '—'} / {event.capacity})</span>
    {open && <div className="event-offer-prices">
      {event.gender_split_enabled===false ? <div className="event-offer-price general">
        <span className="event-offer-group">{tr(locale,'All participants','모든 참가자')}</span>
        {event.seats_remaining<=0?<strong>{tr(locale,'Sold Out','마감')}</strong>:<>
          {timingRate>0&&<span className="event-offer-saving">−{timingRate}%</span>}
          {timingRate>0&&<del>₩{(event.price_general??0).toLocaleString('en-US')}</del>}
          <strong>₩{((event.price_general??0)-Math.round((event.price_general??0)*timingRate/100)).toLocaleString('en-US')}</strong>
        </>}
      </div> : (['ladies', 'gents'] as const).map(group => {
        const original = group === 'ladies' ? (event.price_ladies ?? 35000) : (event.price_gents ?? 55000);
        const rate = timingRate + (status?.discount === group ? 10 : 0);
        const final = original - Math.round(original * timingRate / 100) - (status?.discount === group ? Math.round(original * .1) : 0);
        const groupFull = attendees && (group === 'ladies' ? attendees.women_count : attendees.men_count) >= Math.floor(event.capacity / 2);
        return <div className={`event-offer-price ${group}`} key={group}>
          <span className="event-offer-group">{group === 'ladies' ? tr(locale, 'Ladies', '여성') : tr(locale, 'Gents', '남성')}</span>
          {groupFull ? <strong>{tr(locale, 'Sold Out', '마감')}</strong> : <>
            {rate > 0 && <span className="event-offer-saving">−{rate}%</span>}
            {rate > 0 && <del>₩{original.toLocaleString('en-US')}</del>}
            <strong>₩{final.toLocaleString('en-US')}</strong>
            {rate > 0 && <small>{tr(locale, 'Save ', '')}₩{(original-final).toLocaleString('en-US')}{tr(locale, '', ' 절약')}</small>}
          </>}
        </div>;
      })}
      <p className="event-offer-note">{tr(locale, 'Eligible code + returning guest savings stack at checkout.', '조건에 맞는 코드 할인과 재참여 할인까지 중복 적용돼요.')}</p>
    </div>}
  </div>;
}
