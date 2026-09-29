# Authentication

Roundy’s public sign-in screen offers ID/email, Kakao, and phone/SMS authentication.

## Kakao

Kakao OAuth requests the consent items configured for Roundy: nickname, profile image, email, name, gender, birthday, birth year, and Kakao-account phone number.

After the OAuth code exchange, Roundy uses the short-lived Kakao provider token on the server to fetch the consenting user's Kakao account information and prefill only profile fields that are still empty:

- Kakao name → Roundy full legal name
- Solar birth year + birthday → Roundy date of birth
- Kakao gender → Roundy gender
- Korean Kakao-account phone number → Roundy phone number
- Non-default Kakao profile image → copied into Roundy's private profile-photo storage as the first photo

Existing Roundy profile values are never overwritten. Lunar birthdays and phone numbers that cannot be normalized to a Korean 010 mobile number are left for the user to enter manually. Email remains on the authentication account rather than being duplicated into the event profile, and Kakao nickname is not copied because Roundy currently has no nickname field.

Kakao prefill is convenience only; the normal profile-completion and age-19 eligibility rules still apply. If Kakao data or the provider API is unavailable, sign-in continues and the user completes the missing fields in Roundy.

## Phone

Phone authentication is passwordless and works as sign-in-or-sign-up. The user chooses a country calling code (South Korea +82 by default), enters the local phone number, receives an SMS OTP, and verifies it through Supabase Auth.

The country-code list mirrors CountryCode.org and includes every code shown in its country table, including territories and countries with multiple calling codes.

Supabase must have phone auth and a supported SMS provider enabled. A successful client request uses \`signInWithOtp(..., { shouldCreateUser: true })\`, so a first-time phone number can create an Auth user rather than failing with \`otp_disabled\`.

## Email / ID authentication

Email/password signup and ID/email login are offered alongside Kakao and phone when the email provider is enabled. Signup without a session opens a dedicated confirmation screen. Resend uses `auth.resend({ type: "signup" })`, with a 60-second cooldown. Correcting the address returns to signup; it does not mutate an unauthenticated account. Onboarding starts only after an authenticated session exists.

\`roundy-username-login\` resolves existing IDs with server-only access to \`account_usernames\`, verifies the real password through Supabase Auth, and returns a normal user session. No auth service key belongs in Vercel or browser code.

## Profile and legal consent

Date of birth is not collected as an authentication gate. It is collected in the Roundy event profile and validated there. Required/optional collection conditions are documented in the Privacy Policy.

Terms and Privacy consent is recorded after authentication through the account-consent flow.

## Account security

Figma specification: https://www.figma.com/design/in15ghtoWrlRr0Zivaa3zy/Roundy?node-id=456-1781

- `/me/email` requests a change and reads the authoritative `user.email` and `user.new_email`. Both inboxes must confirm when Secure Email Change is enabled. Focus and manual refresh update the displayed status.
- `/me/password` sends `current_password` with the new password. Supabase's `reauthentication_needed` response opens the nonce step using `reauthenticate()`; retry includes `nonce`. Access-token issue time is never used as a proxy for session creation time.
- Secrets stay only in component memory and are cleared on success/unmount. No passwords or codes are logged or persisted.
- Kakao/phone users without an email identity are offered email recovery or email addition rather than being required to enter a nonexistent password.
- `/reset-password` remains a separate recovery flow. Supabase validates whether the authenticated session is allowed to reset a password.
- `/auth/callback` exchanges PKCE codes before onboarding. Email-change callbacks return to email settings. Invalid, expired, or other-browser links return to an actionable sign-in error.

## Hosted Auth configuration and email templates

Set Site URL to `https://roundy.team` and allow `https://roundy.team/auth/callback` plus the callback URLs with `next` query parameters used by signup, recovery (`/reset-password`) and email changes (`/me/email`). Keep production redirects scoped to this domain. Test confirmation/recovery links in the browser that initiated the flow because default PKCE links require its verifier cookie.

`supabase/templates/` contains Roundy-branded bilingual confirmation, email-change, recovery and reauthentication templates. Link templates preserve `{{ .ConfirmationURL }}`; reauthentication uses `{{ .Token }}`. `auth-email-config.json` is the exact Management API PATCH payload for `/v1/projects/<ROUNDY_PROJECT_REF>/config/auth`. It contains no credentials. Apply only to the verified Roundy project or copy the HTML into its Dashboard email templates.

These files are not applied by a Vercel deployment. New Free projects using default SMTP may not support custom templates; configure custom SMTP if required by the hosted project. Verify the live Site URL, allow-list and templates separately. Do not copy settings from the 1 Cup English project.
