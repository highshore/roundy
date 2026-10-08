import type { Metadata } from 'next';
import LanguageExchangePage from '@/app/language-exchange/page';

// Discovery now presents the language-exchange program. The independent
// /language-exchange page remains available for direct links and PG review.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Discover | Roundy Language Exchange',
  description: '라운디의 오프라인 언어교환 프로그램을 알아보고, 실제 모집 중인 모임과 참가비를 확인하세요.',
  robots: { index: false, follow: false },
};

export default LanguageExchangePage;
