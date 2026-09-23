import Link from 'next/link';
import { RoundyBrand } from '@/components/roundy-brand';

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="footer-links" aria-label="Footer navigation">
      <Link href="/discover">Discover Events</Link>
      <Link href="/how-it-works">How It Works & Safety</Link>
      <Link href="/privacy">개인정보 처리방침</Link>
      <Link href="/terms">이용약관</Link>
    </div>
    <div className="footer-business">
      <Link className="footer-wordmark" href="/"><RoundyBrand /></Link>
      <p>Curated, in-person English conversations in Seoul.</p>
      <p>Roundy Team · Seoul, Republic of Korea · <a href="mailto:hello@roundy.team">hello@roundy.team</a></p>
      <p>© 2026 Roundy. All rights reserved.</p>
    </div>
  </footer>;
}
