import type { Event } from './data';
import { localizeEvent, tr, type Locale } from './locale';

/** Base prices only. Personalized discounts remain authoritative at checkout. */
export function eventPriceLabel(event: Event, locale: Locale) {
  const amounts = event.gender_split_enabled === false
    ? [event.price_general]
    : [event.price_ladies, event.price_gents];
  const known = amounts.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  if (!known.length) return tr(locale, 'Price at checkout', '결제 시 금액 확인');
  const minimum = Math.min(...known);
  const varies = known.length !== amounts.length || new Set(known).size > 1;
  const price = minimum === 0 ? tr(locale, 'Free', '무료') : '₩' + minimum.toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US');
  return varies ? tr(locale, 'From ' + price, price + '부터') : price;
}

export function venueDirections(event: Event, locale: Locale) {
  const copy = localizeEvent(event, locale);
  return 'https://map.naver.com/v5/search/' + encodeURIComponent(copy.address || copy.venue);
}

export function eventCalendarUrl(event: Event, locale: Locale) {
  const copy = localizeEvent(event, locale);
  const timestamp = (date: string) => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: copy.title,
    dates: timestamp(event.starts_at) + '/' + timestamp(event.ends_at),
    ctz: 'Asia/Seoul', location: [copy.venue, copy.address].filter(Boolean).join(', '),
    details: 'https://roundy.team/events/' + encodeURIComponent(event.slug),
  });
  return 'https://calendar.google.com/calendar/render?' + params;
}

export function eventHasEnded(event: Event, now = Date.now()) {
  return Date.parse(event.ends_at) <= now;
}

export function ticketStateUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Only the server-issued Roundy check-in URL may become an admission QR.
  return /^https:\/\/roundy\.team\/check-in\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
