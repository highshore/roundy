const privateRoots = new Set(['onboarding', 'applications', 'checkout', 'ticket', 'event-night', 'matches', 'me', 'admin']);

export function isPrivatePath(path: string) {
  return privateRoots.has(path.replace(/^\//, '').split('/')[0]);
}

// Only canonical internal product paths, never arbitrary redirect URLs.
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(value)) return '/me';
  return isPrivatePath(value) ? value : '/me';
}

export function signInPath(next: string) {
  return '/signin?next=' + encodeURIComponent(safeReturnPath(next));
}

export function authConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
