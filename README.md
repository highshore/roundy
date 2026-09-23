# Roundy

Mobile-first Next.js + Tailwind implementation foundation, with a Supabase migration and Vercel configuration.

Figma: https://www.figma.com/design/in15ghtoWrlRr0Zivaa3zy

## Run

Requires Node 22 or later.

```sh
npm ci
npm run dev
npm run build
npm test
```

Without Supabase environment variables, the site runs an explicitly labeled local preview. It uses fictional event/profile data and sessionStorage. It does not send messages, take payment, issue admission tickets, approve real applications or fabricate another person's match choice.

## Design structure

The Figma file contains 37 screen frames in 00 Public Web, 01 Discover, 02 Onboarding, 03 Application, 04 Event Night, 05 Matches and 06 My Account, with 07 Components & States separately. The revised screens use purpose-specific layouts: photo-led event detail, one-decision setup, interest chips, photo slots, checkout line items, QR ticket, dark timer, circular choices, profile detail, contact reveal, wallet and settings rows. Status variants remain intentionally related. It is an editable storyboard, not a fully wired interaction prototype. Figma photography remains labeled placeholders because its upload endpoint rejected the uploads. Local website assets contain the actual neighborhood photographs.

The current app starts those flows; it is not a complete production implementation of every Figma frame. In particular, event-night starting table, round and choice screens are currently combined in a preview view, and live matching results use a simple list pending the full profile presentation.

## Implemented foundation

- Responsive public landing, event discovery/filtering, event detail and Naver Maps link, with separate product navigation: Discover / My Events / Matches / Profile.
- Six-step resumable preview profile flow, 1–3 photo upload UI, 3–10 interest selection, private contact consent and social verification submission.
- Application status preview, approved checkout preview, sample QR, check-in and private round-choice preview.
- Supabase SSR clients, session refresh proxy, OAuth code callback with internal redirect allowlist, authenticated API routes and owner-only private photo storage routes.
- SQL with explicit grants/RLS, owner-only profiles/applications/credits, no attendee directory, idempotent application/redeem, row-locking credit redemption, event-scoped maximum three Yes choices, reciprocal matching after close and authorized contact reveal.
- Manual verification is reset when social handles change. Clients cannot self-approve, issue credits, check themselves in or read other attendees' records.
- Local PGlite tests execute the migration and validate privacy, authorization and workflow invariants. They use mock auth/storage schemas and do not replace testing on the selected Supabase project.

## Live setup still needed

No Supabase project was provisioned or migrated, and no Vercel deployment was created. Existing 1 Cup English production data was not changed.

1. Select/provision a dedicated Roundy Supabase project. Copy `.env.example` to `.env.local`, set the URL and publishable key, then apply the migration with Supabase CLI to that selected project.
2. Configure Kakao/email auth and allowed redirect URLs, e.g. `https://your-domain/auth/callback`. Kakao initial-photo import is pending.
3. Add real event data and authorized staff accounts. Build the staff approval, verification, ID/QR check-in, seating/exclusion and event-close interfaces. No client can directly write those privileged states.
4. Integrate a payment provider: server-side gender/returner pricing, promo/referral rules, idempotent provider verification/webhooks, paid credit issuance, transactional booking and refunds. Checkout currently fails closed with 503 and never issues paid credits. Existing-ticket redemption has a real RPC.
5. Add live ticket issuance/signing, arrival enforcement, realtime round schedule, match-profile photo grants and display, communication reminders, cancellation and credit history views. Add rate limiting/abuse controls before public launch.
6. Resolve whether an already-used ticket is refundable within the 90-day window. The UI records the stated policy but no automated refund logic is active.
7. Link this directory to a new Vercel project, set the same public Supabase environment values, and deploy a preview for review. `vercel.json` selects Next.js and Seoul region.

Do not expose a Supabase service-role key in client code. The application currently requires only the publishable key and relies on user sessions plus database policies.

## Reference reuse

See REUSE-NOTES.md. Neighborhood images come from the user's public `highshore/1cup-web` repository and are labeled as neighborhood scenery, not venue photographs. The 1 Cup event structure informed the event detail layout. Roundy's attendee privacy is stricter, and its 1/3 ticket, 90-day rules differ from 1 Cup's credit constants.

## Verification in this workspace

- `npm run build`: passed (Next.js production compilation and TypeScript).
- `npm test`: passed (PGlite migration and privacy/workflow invariants).
- Figma screenshots checked for distinct layouts and clipping; photo heights and matched-profile metadata widths corrected.
- Automated browser interaction verification could not complete: agent-browser's daemon failed to start, the standard browser download was invalid, and the alternate Chromium renderer exited in this environment. Mobile visual/interaction QA still needs a working browser before launch.
