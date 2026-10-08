/**
 * One explicit policy for the persistent consumer layout.
 * New public pages inherit all three site-chrome elements by default.
 * Full-screen/admin routes opt out here rather than in individual pages.
 */
export type SiteLayoutPolicy = {
  route: string;
  useSiteShell: boolean;
  header: boolean;
  footer: boolean;
  bottomNav: boolean;
};

const noBottomNav = new Set([
  'onboarding', 'profile', 'admin', 'terms', 'refund-policy',
  'privacy', 'copyright', 'checkout', 'event-night',
]);

export function siteLayoutForPath(pathname: string): SiteLayoutPolicy {
  const canonical = (pathname || '/').replace(/\/+$/, '') || '/';
  const route = canonical === '/' ? 'home' : canonical.split('/')[1] || 'home';
  const useSiteShell = route !== 'admin' && route !== 'auth' && route !== 'api';
  const onboarding = route === 'onboarding';
  return {
    route,
    useSiteShell,
    header: useSiteShell && !onboarding,
    footer: useSiteShell && !onboarding,
    bottomNav: useSiteShell && !noBottomNav.has(route),
  };
}
