const privateRoots = new Set(['payment', 'onboarding', 'applications', 'checkout', 'ticket', 'event-night', 'matches', 'me', 'admin', 'feedback']);

export function isPrivatePath(path: string) {
  return privateRoots.has(path.replace(/^\//, '').split('/')[0]);
}

// Only canonical internal product paths, never arbitrary redirect URLs.
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(value)) return '/me';
  return isPrivatePath(value) || value === '/reset-password' ? value : '/me';
}

export function signInPath(next: string) {
  return '/signin?next=' + encodeURIComponent(safeReturnPath(next));
}

const eventScopedProfileRoots = new Set(['applications', 'checkout', 'ticket', 'event-night']);

export function profileSetupPath(next: string) {
  const safe = safeReturnPath(next);
  if (safe === '/reset-password' || safe.startsWith('/onboarding/')) return safe;
  const [root, slug] = safe.replace(/^\//, '').split('/');
  return eventScopedProfileRoots.has(root) && slug ? '/onboarding/basics/' + slug : '/onboarding/basics';
}

export function authConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
