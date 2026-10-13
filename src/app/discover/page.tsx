import { publicMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import LanguageExchangePage from '@/app/language-exchange/page';

// Discovery now presents the language-exchange program. The independent
// /language-exchange page remains available for direct links and PG review.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = publicMetadata('/');

export default LanguageExchangePage;
