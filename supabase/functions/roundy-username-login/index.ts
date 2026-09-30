import { createClient } from 'npm:@supabase/supabase-js@2.117.0';

const allowedOrigins = new Set(['https://roundy.team', 'https://www.roundy.team']);
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');

// Public login endpoint: the supplied password is authenticated by Supabase Auth.
// Service credentials only resolve an ID internally; they never mint a session.
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const headers: Record<string,string> = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin',
  };
  if (origin && allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowedOrigins.has(origin)) return json({ code: 'origin_not_allowed' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);
  try {
    if (Number(req.headers.get('content-length') || 0) > 4096) return json({ code: 'invalid_credentials' }, 400);
    const raw = await req.text();
    if (raw.length > 4096) return json({ code: 'invalid_credentials' }, 400);
    const body = JSON.parse(raw);
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const availability = body.action === 'check_availability';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[a-z0-9_][a-z0-9_-]{2,29}$/.test(username) || (!availability && (!password || password.length > 128))) return json({ code: 'invalid_credentials' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const [idBudget, ipBudget] = await Promise.all([
      admin.rpc('consume_username_login_attempt', { p_key: await hash((availability ? 'availability:id:' : 'id:') + username), p_limit: 10 }),
      admin.rpc('consume_username_login_attempt', { p_key: await hash((availability ? 'availability:ip:' : 'ip:') + ip), p_limit: 30 }),
    ]);
    if (idBudget.error || ipBudget.error) return json({ code: 'temporarily_unavailable' }, 503);
    if (!idBudget.data || !ipBudget.data) return json({ code: 'over_request_rate_limit' }, 429);
    const { data: alias, error: aliasError } = await admin.from('account_usernames').select('user_id').eq('username', username).maybeSingle();
    if (aliasError) return json({ code: 'temporarily_unavailable' }, 503);
    // Availability returns only a boolean; never resolve emails or user details.
    if (availability) return json({ available: !alias });
    let email = 'unassigned-roundy-login@invalid.example';
    if (alias) {
      const { data, error } = await admin.auth.admin.getUserById(alias.user_id);
      if (error) return json({ code: 'temporarily_unavailable' }, 503);
      email = data.user.email || email;
    }
    const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error || !data.session || !alias || data.user?.id !== alias.user_id) return json({ code: 'invalid_credentials' }, 401);
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch {
    return json({ code: 'temporarily_unavailable' }, 503);
  }
});
