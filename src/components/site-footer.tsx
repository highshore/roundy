import Link from 'next/link';
import { RoundyBrand } from '@/components/roundy-brand';
import { tr, type Locale } from '@/lib/locale';

export function SiteFooter({ locale }: { locale: Locale }) {
  return <footer className="site-footer">
    <div className="footer-top">
      <div className="footer-links" aria-label="Footer navigation">
        <Link href="/discover">{tr(locale, 'Discover Events', '이벤트 찾기')}</Link>
        <Link href="/how-it-works">{tr(locale, 'How It Works & Safety', '이용 방법 및 안전')}</Link>
        <Link href="/privacy">{tr(locale, 'Privacy Policy', '개인정보 처리방침')}</Link>
        <Link href="/terms">{tr(locale, 'Terms of Use', '이용약관')}</Link>
      </div>
      <Link className="footer-wordmark" href="/"><RoundyBrand /></Link>
    </div>
    <div className="footer-business">
      <p>{tr(locale, 'NativePT | Business Registration No. 549-04-02156 | Representative Kyle Kim | Email ', '네이티브피티 | 549-04-02156 | 대표자 김수겸 | 이메일 ')}<a href="mailto:hello@roundy.team">hello@roundy.team</a>{tr(locale, ' | Tel +82 10-6858-4123', ' | 전화 010-6858-4123')}</p>
      <p>{tr(locale, 'Mail-order Business Registration No. 2022-Seoul-Jongno-1744', '통신판매업 신고번호 제2022-서울종로-1744호')}</p>
      <p>{tr(locale, 'Room 303, 9-8 Anam-ro 9ga-gil, Seongbuk-gu, Seoul, Republic of Korea', '서울특별시 성북구 안암로9가길 9-8, 303호')}</p>
      <p>{tr(locale, 'Roundy is NativePT’s English-education service brand.', "'Roundy'는 '네이티브피티'의 영어 교육 관련 서비스 브랜드입니다.")}</p>
      <p>{tr(locale, '© 2026 Roundy. All rights reserved.', '© 2026 Roundy. 모든 권리 보유.')}</p>
    </div>
  </footer>;
}
