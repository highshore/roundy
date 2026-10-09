'use client';

import dynamic from 'next/dynamic';
import { useSiteAccount } from '@/components/site-shell';
import LanguageExchangeContent, { type LanguageEvent } from '@/app/language-exchange/program-content';

const MemberDiscovery = dynamic(() => import('@/components/app').then(module => module.App), {
  loading: () => <main id="main" className="content narrow" aria-busy="true"><div className="experience-skeleton"/></main>,
});

/** Visitors retain program context; members get quick access to their next event. */
export function DiscoveryEntry({ events }: { events: LanguageEvent[] }) {
  const account = useSiteAccount();
  return account.authenticated ? <MemberDiscovery path="discover/member"/> : <LanguageExchangeContent events={events}/>;
}
