# Roundy marketing setup

The admin workspace is `/admin/marketing`. Templates are private until published. Each template has its own days and KST time. No days means paused. Instagram and Koreapas have separate connections.

## Instagram: @roundy.meet

1. Open https://developers.facebook.com/apps/ with the Meta account that will own the integration. Register as a developer if prompted and create an app named **Roundy Marketing**. Select the Instagram management use case (or add the Instagram product to a Business app if the dashboard offers app types).
2. Choose **Instagram API with Instagram Login** / **API setup with Instagram login**. This integration uses `graph.instagram.com` and does not require a linked Facebook Page.
3. Under **Generate access tokens**, add **roundy.meet**. Add/accept an Instagram tester invitation if the dashboard asks for one. Sign in as roundy.meet and authorize `instagram_business_basic` and `instagram_business_content_publish`.
4. Generate a token with those permissions and record the Instagram **user ID** displayed for the account. Use the Instagram ID, not the Meta app ID. For an app serving only an account you own/manage and have added to the dashboard, use the access level Meta provides for that account. Serving other customers' accounts requires the appropriate App Review/Advanced Access.
5. In the **Roundy** Supabase project, open **Edge Functions → Secrets** and add `INSTAGRAM_USER_ID` and `INSTAGRAM_ACCESS_TOKEN`. Do not use `NEXT_PUBLIC_` variables, paste tokens into chat, or put them in templates. The worker verifies that the token belongs to `roundy.meet` before publishing.
6. The API version defaults to `v25.0`; `INSTAGRAM_API_VERSION` can override it after compatibility verification. Record the token's expiration date. Before expiry, refresh a valid long-lived Instagram token using Meta's documented refresh endpoint and replace the server secret. An expired/revoked token needs reauthorization. Automatic token refresh is not yet implemented.
7. Reload Marketing. **Configured** means the server has credentials; it is not proof of a successful API publish. Save a JPEG photo template, review its preview, and explicitly choose **Publish now** for the first real post. Inspect publishing history before enabling its weekly schedule.

No OAuth callback is required for the owner-managed dashboard-token setup above. If adding self-service OAuth later, configure a dedicated HTTPS redirect URI and state validation before enabling it.

Instagram feed posts need at least one image. Uploads are converted to JPEG, up to 10 images, with aspect ratios between 4:5 and 1.91:1. Use one aspect ratio across carousel images. Captions plus CTA/link are limited to 2,200 characters. Caption URLs are not clickable; keep the profile bio link current.

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
- `roundy-marketing` cron invokes the worker each minute only when schedules or queued work exist. Scheduled runs claim once per template/time and keep an immutable content snapshot.
- A post whose external submission may have succeeded is marked **needs review**; its channel's queue pauses. Check the channel, then mark it published/not published in the admin history. Do not blindly retry.
- Claims that time out are also marked needs review. There is no automatic external-post retry.
- Missing credentials leave publishing unavailable; templates can still be prepared. Nothing was posted while implementing/testing this feature.

Verification: `npm run typecheck`, `npm run build`, and `node scripts/test-event-management.mjs`.
