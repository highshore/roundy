# Authentication

Roundy accepts Kakao, email/password and phone/SMS accounts. Member routes still require a server-verified non-anonymous user; admin routes additionally require `is_admin()`.

Email signup can register a unique ID (3-30 lowercase letters, digits, underscores or hyphens). The auth-user insert trigger reserves it atomically. Changing user metadata cannot rename or take over an existing ID. Existing accounts without a registered ID continue to use email or Kakao.

`roundy-username-login` resolves IDs with server-only access to `account_usernames`, verifies the real password through Supabase Auth, and returns a normal user session. It never returns the resolved email. Its rate-limit budgets are atomic and service-only (10 attempts per ID and 30 per IP per minute). The public edge endpoint uses password authentication, so deploy it with gateway JWT verification disabled.

Deploy `supabase/migrations/20260928035659_username_signin.sql` before the edge function and frontend. No auth service key belongs in Vercel or browser code.

Phone authentication is displayed as unavailable while `/auth/settings` reports it disabled. To enable it, configure a supported SMS provider and enable phone authentication in the Roundy Supabase project. Real SMS delivery and code verification need to be tested afterward.

Email confirmation and password-reset URLs must allow `https://roundy.team/auth/callback`. Password-reset callbacks return to `/reset-password` through the existing safe redirect allowlist.

PG review screenshots must reflect the actual state. Paid checkout is currently disabled; do not label referral-only checkout as a working payment integration.
