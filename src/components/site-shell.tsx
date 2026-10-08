'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { CalendarDays, Compass, MessageCircle, UserRound } from 'lucide-react';
import { siteLayoutForPath } from '@/lib/site-layout';
import { authConfigured } from '@/lib/auth-routing';
import { tr, type Locale } from '@/lib/locale';
import { LocaleToggle } from '@/components/locale-toggle';
import { RoundyBrand } from '@/components/roundy-brand';
import { SiteFooter } from '@/components/site-footer';

type LocaleSettings = { locale: Locale; changeLocale: (value: Locale) => void };
const SiteLocaleContext = createContext<LocaleSettings>({
  locale: 'en',
  changeLocale: () => {},
});

/** Shared across the App experience and independently rendered public pages. */
export function useSiteLocale() {
  return useContext(SiteLocaleContext);
}

type HeaderAccount = { authenticated: boolean; photo: string | null };
const anonymous: HeaderAccount = { authenticated: false, photo: null };

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/';
  const policy = siteLayoutForPath(pathname);
  const [locale, setLocale] = useState<Locale>('en');
  const [account, setAccount] = useState<HeaderAccount>(anonymous);

  const changeLocale = useCallback((next: Locale) => {
    setLocale(next);
    try { window.localStorage.setItem('roundy-locale', next); }
    catch { /* Storage availability never blocks a language switch. */ }
  }, []);

  useEffect(() => {
    const applyPreferredLocale = () => {
      try {
        const saved = window.localStorage.getItem('roundy-locale');
        if (saved === 'en' || saved === 'ko') { setLocale(saved); return; }
      } catch { /* Fall back to the browser's current language. */ }
      const preferred = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase();
      setLocale(preferred === 'ko' || preferred.startsWith('ko-') ? 'ko' : 'en');
    };
    applyPreferredLocale();
    window.addEventListener('languagechange', applyPreferredLocale);
    return () => window.removeEventListener('languagechange', applyPreferredLocale);
  }, []);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  useEffect(() => {
    if (!policy.useSiteShell || !authConfigured()) { setAccount(anonymous); return; }
    const controller = new AbortController();
    void fetch('/api/profile', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) return anonymous;
        const result = await response.json();
        const photo = Array.isArray(result.profile?.photos) && typeof result.profile.photos[0] === 'string'
          ? result.profile.photos[0] : null;
        return { authenticated: true, photo } as HeaderAccount;
      })
      .then(profile => { if (!controller.signal.aborted) setAccount(profile); })
      .catch(() => { if (!controller.signal.aborted) setAccount(anonymous); });
    return () => controller.abort();
  }, [pathname, policy.useSiteShell]);

  const nav = [
    { href: '/discover', label: tr(locale, 'Discover', '둘러보기'), icon: Compass,
      active: pathname === '/' || pathname === '/discover' || pathname === '/language-exchange' || pathname.startsWith('/discover/') },
    { href: '/events', label: tr(locale, 'Events', '모임'), icon: CalendarDays,
      active: pathname === '/events' || pathname.startsWith('/events/') },
    { href: '/matches', label: tr(locale, 'Messages', '메시지'), icon: MessageCircle,
      active: pathname === '/matches' || pathname.startsWith('/matches/') },
    { href: '/me', label: tr(locale, 'Profile', '프로필'), icon: UserRound,
      active: pathname === '/me' || pathname.startsWith('/me/') },
  ];

  const body = !policy.useSiteShell ? children : (
    <div className={'experience route-' + policy.route + (policy.programWidth ? ' program-shell' : '')}>
      {policy.header && <>
        <a className="skip" href="#main">{tr(locale, 'Skip to content', '본문으로 건너뛰기')}</a>
        <header className="site-header" data-global-header>
          <Link className="wordmark" href="/" aria-label="Roundy home"><RoundyBrand/></Link>
          <nav aria-label={tr(locale, 'Desktop navigation', '데스크톱 내비게이션')}>
            {nav.map(item => <Link key={item.href} href={item.href} className={item.active ? 'active' : ''}
              aria-current={item.active ? 'page' : undefined}>{item.label}</Link>)}
          </nav>
          <div className="header-actions">
            <LocaleToggle locale={locale} onChange={changeLocale}/>
            <Link className="header-signin" href={account.authenticated ? '/me' : '/signin'}>
              {account.authenticated && account.photo &&
                <span className="nav-avatar"><Image src={account.photo} alt="" fill sizes="28px" unoptimized/></span>}
              {account.authenticated ? tr(locale, 'My Profile', '내 프로필') : tr(locale, 'Sign In', '로그인')}
            </Link>
          </div>
        </header>
      </>}
      {children}
      {policy.footer && <SiteFooter locale={locale}/>}
      {policy.bottomNav && <nav className="bottom-nav" data-global-bottom-nav
        aria-label={tr(locale, 'Main navigation', '주요 메뉴')}>
        {nav.map(item => <Link key={item.href} href={item.href} className={item.active ? 'active' : ''}
          aria-current={item.active ? 'page' : undefined}>
          <item.icon size={22} strokeWidth={item.active ? 2 : 1.5}/>
          <span>{item.label}</span>
        </Link>)}
      </nav>}
    </div>
  );

  return <SiteLocaleContext.Provider value={{ locale, changeLocale }}>{body}</SiteLocaleContext.Provider>;
}
