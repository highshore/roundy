import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import LanguageExchangeContent, { type LanguageEvent } from './program-content';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Language Exchange | 라운디 언어교환 | Roundy',
  description: 'Roundy guided Korean and English conversation: program format, sample curriculum, upcoming sessions, fees and policies. 라운디 언어교환 프로그램의 진행 방식, 모집 일정, 참가비 및 환불 안내.',
  robots: { index: false, follow: false },
};

export default async function LanguageExchangePage() {
  let events: LanguageEvent[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('events')
      .select('id,slug,title,title_ko,starts_at,venue,capacity,seats_remaining,price_general')
      .eq('theme', 'Language Exchange').eq('status', 'live').is('deleted_at', null)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true }).limit(10);
    if (!error) events = (data ?? []) as LanguageEvent[];
  } catch { /* Program information must remain available during backend maintenance. */ }

  return <LanguageExchangeContent events={events} />;
}
