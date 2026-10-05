const HOUR = 3_600_000;

type StatusEvent = {
  starts_at: string;
  ends_at: string;
  capacity: number;
  seats_remaining: number;
  status: string;
  lockdown_minutes?: number;
  early_bird_hours?: number;
  last_minute_hours?: number;
};
type Counts = { total: number; women_count: number; men_count: number };
export type EventStatusKind = 'early' | 'imminent' | 'almost-full' | 'available' | 'full' | 'started' | 'ended' | 'closed';

export function eventStatus(event: StatusEvent, counts: Counts | undefined, now: number) {
  const start = Date.parse(event.starts_at);
  const end = Date.parse(event.ends_at);
  const earlyDeadline = start - 240 * HOUR;
  const imminentAt = start - (event.lockdown_minutes ?? 4320) * 60_000;
  const occupied = Math.max(0, event.capacity - event.seats_remaining);
  let kind: EventStatusKind = 'available';
  let deadline: number | null = null;
  if (end <= now) kind = 'ended';
  else if (start <= now) kind = 'started';
  else if (event.status !== 'live') kind = 'closed';
  else if (event.capacity <= 0 || event.seats_remaining <= 0 || (counts && counts.total >= event.capacity)) kind = 'full';
  else if (now >= imminentAt) { kind = 'imminent'; deadline = start; }
  else if (now <= earlyDeadline) { kind = 'early'; deadline = earlyDeadline; }
  else if (event.capacity > 0 && (counts?.total ?? occupied) / event.capacity > 0.7) kind = 'almost-full';

  // Balance offers apply only during the admin-configured lockdown window.
  const lockdown = kind === 'imminent';
  const discount = lockdown && counts
    ? counts.women_count - counts.men_count > 1 ? 'gents'
      : counts.men_count - counts.women_count > 1 ? 'ladies' : null
    : null;
  return { kind, deadline, discount };
}

export function countdownParts(deadline: number, now: number) {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return { days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600), minutes: Math.floor(seconds % 3600 / 60), seconds: seconds % 60 };
}
