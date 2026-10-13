import { publicMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import LanguageExchangeContent, { type LanguageEvent } from './program-content';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = publicMetadata('/');

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
