import type { Metadata } from 'next';
import LanguageExchangeProgram from './program-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Language Exchange | 라운디 언어교환 | Roundy',
  description: 'Roundy guided Korean and English conversation: program format, sample curriculum, upcoming sessions, fees and policies. 라운디 언어교환 프로그램의 진행 방식, 모집 일정, 참가비 및 환불 안내.',
  robots: { index: false, follow: false },
};

export default function LanguageExchangePage() { return <LanguageExchangeProgram/>; }
