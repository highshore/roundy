# Roundy

Next.js 16, React 19, Supabase and Vercel. Production: https://roundy.team

Design: https://www.figma.com/design/in15ghtoWrlRr0Zivaa3zy

## Development

Node 22 or later is required. Run `npm ci`, copy `.env.example` to `.env.local`, then `npm run dev`. Check with `npm test`, `npm run typecheck` and `npm run build`.

Missing credentials never enable demo authentication. Public pages remain accessible; private pages require Kakao authentication. API routes independently verify the user and database-enforced admin role.

## September 24 refresh

- Coral `#FF6666` brand and black navbar sign-in; the supplied animated WebP is centered during navigation, data loading, uploads and saves. Reduced-motion users receive a text loading state.
- Admin event editor: title, description, Seoul date/time, Naver location search and coordinate resolution, duration, participant capacity, age range, registration cutoff, uploaded images and Kakao reminder offsets. Images accept JPEG/PNG/WebP, up to 5 MB each and 10 per event.
- Database-derived `MM-DD-YYYY` slugs, stable numeric suffixes for same-date events, aliases after date changes, derived end times and remaining capacity calculated from confirmed bookings.
- Create, edit, duplicate, generate seating and share/download a seating PNG. Seating requires verified, balanced confirmed attendees, respects pair exclusions, and locks once event choices begin. A host-only roster maps codes to attendees; exported images contain codes only.
- Prominent profile progress/save bar, localized 195-country flag dropdown, 120 categorized emoji interests, automatic general work descriptions, and main-photo avatars.
- One verification method: Instagram handle, LinkedIn profile, or private work/student proof (PDF/JPEG/PNG/WebP, 5 MB). Only the owner and administrators can read proof files. Changing evidence resets approval.
- Figma brand tokens and onboarding updated; native admin/editor/search/seating/loading states are on `08 — ADMIN & LOADING`. The loading design uses a still frame from the supplied animation; the website plays the original animation.

## Production services

All refresh migrations are applied to Roundy's Seoul Supabase project `sruzwoiyfjnebjmyxucy`. The `roundy-reminders` Edge Function and a once-per-minute `pg_cron` job are deployed. The scheduler uses the public anon JWT for gateway verification; provider credentials and the service-role key are never shipped to the browser. No 1 Cup production data or credentials were changed.

Configure server-only values through the corresponding project's environment settings, never in source or chat:

| Feature | Configuration |
| --- | --- |
| Naver venue-name search | Vercel `NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET` from NAVER API HUB Local Search |
| Naver address geocoding fallback | Vercel `NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET` from Naver Cloud Maps |
| Venue map display | Vercel `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`; Naver Cloud Maps Client ID, with Roundy's domain allowed |
| General work descriptions | Vercel `OPENAI_API_KEY`; optional `PROFILE_SUMMARY_MODEL` (default `gpt-4.1-mini`) |
| Kakao reminders | Supabase Edge secrets `KAKAO_APPKEY`, `KAKAO_SECRET_KEY`, `KAKAO_SENDER_KEY`, `KAKAO_TEMPLATE_CODE` |

NAVER API HUB Local Search is the default venue-name and address search path. NAVER Cloud Maps Geocoding resolves an entered address when no exact Local Search result is available. Ambiguous results require selection. Work summaries send only occupation/workplace fields, never documents, photos or contact details. If generation is unavailable, a generic description is saved with `summary_status: pending` and retried on a subsequent profile save.

The Kakao adapter follows 1cup-web's NHN Alimtalk integration and requires a **Roundy-approved** template with `meetup-time`, `meetup-location`, `meetup-link` substitutions. Its deployed health check currently reports `configured: false`. The admin editor clearly shows unavailable reminder delivery. Only due reminders for confirmed bookings are claimed; disabling/rescheduling cancels stale queued jobs. Atomic claims, a unique event/user/start key, and the provider idempotency header prevent repeated dispatch. At-start reminders allow 10 minutes of scheduler grace. `sent` means provider acceptance, not confirmed handset delivery. Ambiguous failures stay failed for manual provider reconciliation; they are not automatically retried. SMS fallback is disabled. Changing provider settings requires an authorized test recipient before claiming delivery is verified.

## Boundaries inherited from the existing application

Payment checkout remains disabled until a real provider/webhook and refund adapter exist. Existing-ticket redemption is implemented. Staff approval, document review UI, ID/QR check-in, live event round controls and complete match-photo presentation still need their own implementation; the new admin seating controls do not replace those workflows. A database administrator can review uploaded proof using protected storage. Existing profile and match privacy constraints remain in place.

## Verification

`npm test` covers private-route return paths and database privacy/workflows: application/redeem idempotency, maximum three Yes choices, reciprocal matching, event close, date slugs and aliases, derived capacity, lockdown, seating exclusions/authorization, document ownership, admin image upload, reminder deduplication and cancellation. Tests execute application migrations in PGlite with mock auth/storage schemas; hosted `pg_cron`/`pg_net` setup is verified on Supabase separately.

Build and type checking pass. The production scheduler reports a successful run. Protected upload/search/save workflows and external provider delivery still require a signed-in admin session and configured provider credentials for end-to-end verification.

## Reference reuse

See `REUSE-NOTES.md`. Existing neighborhood photographs come from the user's `highshore/1cup-web` repository and remain labeled illustrative in preview mode. Its event editor, Naver search and messaging flow informed this implementation. Roundy's privacy and ticket rules remain separate.
