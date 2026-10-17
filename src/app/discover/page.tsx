import { publicMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import { App } from '@/components/app';

// Restore the original 1:1 rotation-dating Discovery while keeping
// the separate language-exchange program at /language-exchange.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = publicMetadata('/');

export default function DiscoverPage() {
  return <App path="discover" />;
}
