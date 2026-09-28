import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isMemberUser } from '@/lib/auth-user';
import { LEGAL_VERSION, validLegalConsent } from '@/lib/legal-consent';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function handle(req: NextRequest) {
  if (req.method === 'POST' && req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'Invalid request origin' }, 403);
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !isMemberUser(user)) return json({ error: 'Sign in required' }, 401);
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      if (!validLegalConsent(body)) return json({ error: 'Both agreements are required' }, 400);
      const { error: insertError } = await supabase.from('account_legal_consents').insert({ user_id: user!.id, version: LEGAL_VERSION, terms: true, privacy: true });
      // Repeated requests leave the original acceptance timestamp unchanged.
      if (insertError && insertError.code !== '23505') throw insertError;
    }
    const { data, error: readError } = await supabase.from('account_legal_consents').select('accepted_at').eq('user_id', user!.id).eq('version', LEGAL_VERSION).maybeSingle();
    if (readError) throw readError;
    return json({ accepted: Boolean(data), version: LEGAL_VERSION });
  } catch { return json({ error: 'Consent could not be saved or checked' }, 503); }
}
export const GET = handle;
export const POST = handle;
