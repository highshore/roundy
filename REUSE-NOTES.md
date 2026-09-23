# 1 Cup English reuse audit

Read-only audit of highshore/1cup-web, main at commit 29edc5ed922ab5e918f09c162a45d2038a440276. No existing site, database or payment settings changed.

## Verified prototype images

Both assets were fetched from the user's repository and visually inspected. They contain architecture and scenery, with no identifiable attendees. Each is 1400 × 900 pixels. These are neighborhood atmosphere images, not photographs of the proposed event venue. Do not imply an event occurs inside the pictured buildings.

| Local file | Description | Repository source |
| --- | --- | --- |
| yeouido.webp | Yeouido skyline, Han River and green foreground | https://github.com/highshore/1cup-web/blob/main/public/images/payment/yeouido.webp |
| anam-korea-university.webp | Korea University stone buildings and trees | https://github.com/highshore/1cup-web/blob/main/public/images/payment/anam-korea-university.webp |

## Verified layout and infrastructure

- Event list: region filter pills; upcoming/past sections; horizontal image/title/location/date cards; capacity/status. Source: app/meetup/MeetupClient.tsx.
- Event detail: 35vh mobile image carousel, category pill, title, description, duration/start time/venue icon rows, 250px Naver map, status-aware floating CTA. Source: app/meetup/[id]/EventDetailClient.tsx.
- WHO adaptation: retain the image/detail/map/CTA hierarchy; replace attendee avatars/roster with aggregates; keep price in checkout.
- Stack already matches: Next.js 16, React 19, Tailwind 4, Supabase SSR/JS and Vercel.
- Booking: register_for_meetup and cancel_meetup_registration use row locks for atomic capacity, credit spending and refunds. Source: app/lib/features/meetup/services/participation_service.ts; supabase/migrations/20260903174738_participation_credits.sql.
- Kakao login: OAuth safe redirect-back and Supabase sessions; kakao-login imports profile_image_url into an empty photo_url. Sources: app/auth/callback/route.ts, app/auth/kakao/start/route.ts, app/kakao_callback/route.ts, supabase/functions/kakao-login/index.ts.
- Current checkout lives in supabase/functions/checkout/index.ts; it quotes server-side, creates payment windows, verifies settlement and calls claim/complete RPCs for idempotency. Reuse patterns without borrowing production credentials.
- Current products are region-based 30-day membership or 5-ticket packs lasting 180 days, with proportional unused-credit refunds. WHO needs separate 1/3-ticket products, 90-day expiry, gender/returner prices and its own refund rules. Sources: supabase/migrations/20260905114500_regional_pricing_schema.sql; 20260905114600_regional_pricing_workflows.sql.
- Messaging has staff-authorized Kakao meetup reminders and internal scheduler authorization. Source: supabase/functions/messaging/index.ts. WHO needs separate templates and attendance reconfirmation.
- Existing staff event editing, duplication and drag/drop seating are useful patterns; structured one-to-one round scheduling and mutual-choice matching are new domain logic.
- Privacy boundary: existing signed-in participant/profile reads are insufficient for WHO. Do not expose the roster; reveal rich profiles and contacts only through mutual-match-authorized paths. Source: supabase/migrations/20260914050000_member_data_security_hardening.sql.

## Scope boundary

ROUNDY should share proven implementation patterns but have an isolated product data scope. No new code should inherit 1 Cup's 5-pack/180-day constants, broad roster visibility, credentials or legacy Firebase migration assumptions.
