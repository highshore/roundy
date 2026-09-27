import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type OneCupMeetup = {
  id: string;
  title: string;
  date: string;
  time: string;
  description?: string;
  location_name?: string;
  location_address?: string;
  duration_minutes?: number;
  max_participants?: number;
  participants?: string[];
  leaders?: string[];
  image_urls?: string[];
};

type OneCupPage = {
  events?: OneCupMeetup[];
  lastDoc?: number | null;
};

const PAGE_SIZE = 50;
const MAX_EVENTS = 500;
const SOURCE_ORIGIN = 'https://1cupenglish.com';

function isActualMeetup(event: OneCupMeetup) {
  const title = event.title.trim();
  if ((event.max_participants ?? 0) <= 2) return false;
  return !/(쉬어갑니다|쉬어가겠습니다|휴가|no meetup|week off|break week)/i.test(title);
}

function toSeoulIso(date: string, time: string) {
  return `${date}T${time || '00:00'}:00+09:00`;
}

export async function GET() {
  try {
    const all: OneCupMeetup[] = [];
    let offset = 0;

    while (offset < MAX_EVENTS) {
      const url = new URL('/api/meetup/events', SOURCE_ORIGIN);
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('limit', String(PAGE_SIZE));

      const response = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        throw new Error(`1cup meetup feed returned ${response.status}`);
      }

      const page = (await response.json()) as OneCupPage;
      const rows = Array.isArray(page.events) ? page.events : [];
      all.push(...rows);

      if (page.lastDoc == null || rows.length === 0) break;
      offset = page.lastDoc;
    }

    const events = all
      .filter(isActualMeetup)
      .map((event) => {
        const startsAt = toSeoulIso(event.date, event.time);
        const duration = Math.max(0, Number(event.duration_minutes) || 120);
        const startsMs = Date.parse(startsAt);
        const endsAt = Number.isFinite(startsMs)
          ? new Date(startsMs + duration * 60_000).toISOString()
          : startsAt;
        const participantCount =
          (Array.isArray(event.participants) ? event.participants.length : 0) +
          (Array.isArray(event.leaders) ? event.leaders.length : 0);

        return {
          id: event.id,
          title: event.title,
          starts_at: startsAt,
          ends_at: endsAt,
          description: event.description ?? '',
          venue: event.location_name ?? '',
          address: event.location_address ?? '',
          capacity: Math.max(0, Number(event.max_participants) || 0),
          participant_count: participantCount,
          image: event.image_urls?.[0] ?? '',
          source_url: `${SOURCE_ORIGIN}/meetup/${encodeURIComponent(event.id)}`,
        };
      })
      .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

    return NextResponse.json(
      { events },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
        },
      },
    );
  } catch (error) {
    console.error('Unable to load legacy 1cup Business Talks', error);
    return NextResponse.json(
      { events: [], error: 'legacy_business_talks_unavailable' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
