# Roundy marketing setup

The admin workspace is `/admin/marketing`. Templates are private until published. Each template has its own days and KST time. No days means paused. Instagram and Koreapas have separate connections.

## Instagram: @roundy.meet

1. Open https://developers.facebook.com/apps/ with the Meta account that will own the integration. Register as a developer if prompted and create an app named **Roundy Marketing**. Select the Instagram management use case (or add the Instagram product to a Business app if the dashboard offers app types).
2. Choose **Instagram API with Instagram Login** / **API setup with Instagram login**. This integration uses `graph.instagram.com` and does not require a linked Facebook Page.
3. Under **Generate access tokens**, add **roundy.meet**. Add/accept an Instagram tester invitation if the dashboard asks for one. Sign in as roundy.meet and authorize `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages`, and `instagram_business_manage_insights`. The insights permission is used to learn better publishing times from reach, saves and shares; the system falls back to basic like/comment data when it is unavailable.
4. Generate a token with those permissions and record the Instagram **user ID** displayed for the account. Use the Instagram ID, not the Meta app ID. For an app serving only an account you own/manage and have added to the dashboard, use the access level Meta provides for that account. Serving other customers' accounts requires the appropriate App Review/Advanced Access.
5. In the **Roundy** Supabase project, open **Edge Functions → Secrets** and add `INSTAGRAM_USER_ID` and `INSTAGRAM_ACCESS_TOKEN`. Do not use `NEXT_PUBLIC_` variables, paste tokens into chat, or put them in templates. The worker verifies that the token belongs to `roundy.meet` before publishing.
6. The API version defaults to `v25.0`; `INSTAGRAM_API_VERSION` can override it after compatibility verification. Record the token's expiration date. Before expiry, refresh a valid long-lived Instagram token using Meta's documented refresh endpoint and replace the server secret. An expired/revoked token needs reauthorization. Automatic token refresh is not yet implemented.
7. Reload Marketing. **Configured** means the server has credentials; it is not proof of a successful API publish. Save a JPEG photo template, review its preview, and explicitly choose **Publish now** for the first real post. Inspect publishing history before enabling its weekly schedule.
8. In `/admin/marketing`, open **One-time Meta setup for comments & DMs**. Copy its Callback URL and Verify token into the Instagram webhook configuration in the Meta app, then subscribe the `comments` and `messages` fields. The callback URL contains a private per-project key; do not publish it.
9. Optional hardening: add the Meta app secret as the Supabase Edge Function secret `INSTAGRAM_APP_SECRET`. When present, the webhook verifies Meta's `X-Hub-Signature-256` before processing events.

No OAuth callback is required for the owner-managed dashboard-token setup above. If adding self-service OAuth later, configure a dedicated HTTPS redirect URI and state validation before enabling it.

Instagram feed posts need at least one image. Uploads are converted to JPEG, up to 10 images, with aspect ratios between 4:5 and 1.91:1. Use one aspect ratio across carousel images. Captions plus CTA/link are limited to 2,200 characters. Caption URLs are not clickable; keep the profile bio link current.

### Daily drafts, approval, custom regeneration and time optimization

- The default daily content mode is **Pre-launch Promotion** while Roundy is not officially launched. In this mode the system deliberately ignores website event rows because the current events are test data.
- Pre-launch posts may talk about the Roundy concept, Seoul dating pain points, Korean/international social discovery, face-to-face 1:1 conversations and trust-building. They must not claim a launch date, real attendees, reviews, ticket prices, venue, seat availability or live booking status.
- Admins can switch a draft between **Pre-launch Promotion** and **Live Event** during regeneration. Switching to pre-launch removes the draft's event reference.
- Every draft has a **Custom regeneration** panel with a free-form instruction up to 500 characters and three modes: **Text only**, **Image only**, or **Text + image**.
- Text regeneration uses the admin instruction as creative direction but preserves Roundy's factual constraints. Image regeneration creates a new square hyper-realistic dating/lifestyle visual with no text, logo, watermark or alcohol and stores it as a JPEG in Roundy's existing public marketing-image bucket.
- Quick prompt chips are available for premium, concise, Seoul/international, trust-focused and playful directions.
- At **10:00 KST** by default, the worker creates one Instagram draft for the current day. The generation time and default content mode are configurable in `/admin/marketing`.
- A draft is never published automatically. It stays **Needs approval** until an admin reviews the image, caption, CTA and recommended posting window.
- Admin actions are **Approve & schedule**, **Save edits**, **Custom regeneration**, and **Skip today**. Approval is blocked when an image is missing.
- Approved drafts are queued for the recommended time. If the recommended window has already passed when approval happens, the post is scheduled shortly after approval and excluded from timing-model training.
- Initial time priors are: Sunday 21:00, Monday 19:00, Tuesday 19:00, Wednesday 18:00, Thursday 12:30, Friday 21:00 and Saturday 21:00 KST. Each is treated as a 60-minute window rather than a rigid exact minute.
- The worker collects post performance at approximately **24h and 72h**. With `instagram_business_manage_insights`, it uses reach, views, saves, shares, comments and likes. Saves and shares receive the highest engagement weight.
- The optimizer blends benchmark priors with Roundy data. Before enough posts are measured, the benchmark dominates. As the sample grows, the Roundy measurements receive up to 65% of the recommendation score.
- Five candidate slots are evaluated: 12:30, 18:00, 19:00, 20:00 and 21:00 KST. Recommended times are slightly varied within the selected window to avoid learning only from exact clock-minute behavior.
- Clear FAQs about schedule, location, base price, age range, format, registration, discounts, greetings, and acknowledgements are answered automatically from current event data.
- Payment/refund/cancellation, safety/reporting, account/privacy, nationality/religion and unclassified messages are sent to **Customer Support** for human review. For a sensitive DM, Roundy sends only a receipt acknowledgement and leaves the substantive reply for an admin. Sensitive comments are not answered publicly until reviewed.
- Instagram only permits DM replies within conversations initiated by the Instagram user; this integration never sends cold DMs.


Official references:
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started/
- https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login
- https://developers.facebook.com/docs/instagram-platform/content-publishing/

## Koreapas

In the same project's Edge Function secrets, set `KOREAPAS_USER_ID` and `KOREAPAS_PASSWORD` for the account authorized to post Roundy adverts. These are separate from 1cup's credentials; the implementation does not copy them. The publisher reuses 1cup's EUC-KR login/write flow and restricts cookie-bearing redirects to the Koreapas origin.

Before sending, the worker checks the first free-ad page for the same title. A match is skipped. A network failure fails closed. The queue also enforces one successful Koreapas post per 24 hours across templates.

## Operations

- `roundy-marketing` Edge Function authenticates admin requests or a private database scheduler secret. No service credentials reach the browser.
- `roundy-marketing` cron invokes the worker only when a draft is due to be generated, an approved run is due to publish, an existing template schedule needs attention, or 24h/72h Instagram insights are due. Approved runs keep an immutable content snapshot.
- `instagram-webhook` accepts only the private callback-key URL. Meta verification also requires the private verify token. If `INSTAGRAM_APP_SECRET` is configured, POST payload signatures are verified as well.
- Incoming comments/DMs are deduplicated by Instagram external ID before any reply is attempted.
- A post whose external submission may have succeeded is marked **needs review**; its channel's queue pauses. Check the channel, then mark it published/not published in the admin history. Do not blindly retry.
- Claims that time out are also marked needs review. There is no automatic external-post retry.
- Missing credentials leave publishing unavailable; templates can still be prepared. Nothing was posted while implementing/testing this feature.

Verification: `npm run typecheck`, `npm run build`, and `node scripts/test-event-management.mjs`.
