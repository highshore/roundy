import type { Metadata } from 'next';
import { App } from '@/components/app';

// Keep the original Discovery experience intact and accessible by URL.
export const metadata: Metadata = {
  title: 'Original Discovery | Roundy',
  description: 'The original Roundy discovery page.',
  robots: { index: false, follow: false },
};

export default function ClassicDiscoveryPage() {
  return <App path="discover" />;
}
