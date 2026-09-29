/** Active public offerings. Historical event and payment records are not mutated. */
export function isRoundyEvent(event: { theme?: string | null }): boolean {
  return event.theme === '1:1 Speed Mingle' || event.theme === '1:1 Speed Meetup';
}

/** Old links resolve to the current event list without reviving a retired offering. */
export function retiredEventDestination(pathname: string, category?: string | null): string | null {
  const path = pathname.replace(/\/$/, '');
  if (path === '/business-talk' || path === '/how-it-works/business-talk') return '/events';
  if (path === '/events' && category && ['Business Talk', 'Business Meetup'].includes(category)) return '/events';
  return null;
}
