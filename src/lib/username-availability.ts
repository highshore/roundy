import { createClient } from '@/lib/supabase/client';

export const normalizeUsername = (value: string) => value.trim().toLowerCase();
export const validUsername = (value: string) => /^[a-z0-9_][a-z0-9_-]{2,29}$/.test(normalizeUsername(value));
export type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export async function checkUsername(value: string): Promise<UsernameStatus> {
  if (!validUsername(value)) return 'idle';
  try {
    const { data, error } = await createClient().functions.invoke('roundy-username-login', {
      body: { action: 'availability', username: normalizeUsername(value) },
      timeout: 5000,
    });
    if (error || typeof data?.available !== 'boolean') return 'error';
    return data.available ? 'available' : 'taken';
  } catch {
    return 'error';
  }
}
