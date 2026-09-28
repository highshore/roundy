export const MINIMUM_AGE = 19;
export const PENDING_BIRTH_DATE_KEY = 'roundy-pending-birth-date-v1';

type DateParts = { year: number; month: number; day: number };

function parseBirthDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function seoulToday(now: Date): DateParts {
  // Korea does not use daylight saving time. Shift once and read UTC fields so
  // browser and server-side eligibility checks agree around midnight.
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: seoul.getUTCFullYear(),
    month: seoul.getUTCMonth() + 1,
    day: seoul.getUTCDate(),
  };
}

export function isAtLeastAge(value: string, minimumAge = MINIMUM_AGE, now = new Date()): boolean {
  const birth = parseBirthDate(value);
  if (!birth) return false;
  const today = seoulToday(now);
  const eligibleYear = today.year - minimumAge;
  if (birth.year < eligibleYear) return true;
  if (birth.year > eligibleYear) return false;
  if (birth.month < today.month) return true;
  if (birth.month > today.month) return false;
  return birth.day <= today.day;
}

export function latestEligibleBirthDate(minimumAge = MINIMUM_AGE, now = new Date()): string {
  const today = seoulToday(now);
  const year = today.year - minimumAge;
  return `${year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
}
