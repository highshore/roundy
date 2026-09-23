import Link from 'next/link';
import { RoundyBrand } from '@/components/roundy-brand';
import { tr, type Locale } from '@/lib/locale';

export function SiteFooter({ locale }: { locale: Locale }) {
  return <footer className="site-footer">
    <div className="footer-links" aria-label="Footer navigation">
      <Link href="/discover">{tr(locale, 'Discover Events', '이벤트 찾기')}</Link>
      <Link href="/how-it-works">{tr(locale, 'How It Works & Safety', '이용 방법 및 안전')}</Link>
      <Link href="/privacy">{tr(locale, 'Privacy Policy', '개인정보 처리방침')}</Link>
      <Link href="/terms">{tr(locale, 'Terms of Use', '이용약관')}</Link>
    </div>
    <div className="footer-business">
      <Link className="footer-wordmark" href="/"><RoundyBrand /></Link>
      <p>{tr(locale, 'Curated, in-person English conversations in Seoul.', '서울에서 만나는, 엄선된 오프라인 영어 대화.')}</p>
      <p>{tr(locale, 'Roundy Team · Seoul, Republic of Korea · ', 'Roundy 팀 · 대한민국 서울 · ')}<a href="mailto:hello@roundy.team">hello@roundy.team</a></p>
      <p>{tr(locale, '© 2026 Roundy. All rights reserved.', '© 2026 Roundy. 모든 권리 보유.')}</p>
    </div>
  </footer>;
}
