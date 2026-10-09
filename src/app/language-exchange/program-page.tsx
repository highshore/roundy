import { createClient } from '@/lib/supabase/server';
import LanguageExchangeContent, { type LanguageEvent } from './program-content';
import { DiscoveryEntry } from '@/components/discovery-entry';

export default async function LanguageExchangePage({ memberDiscovery = false }: { memberDiscovery?: boolean } = {}) {
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

  return memberDiscovery ? <DiscoveryEntry events={events}/> : <LanguageExchangeContent events={events} />;
}
