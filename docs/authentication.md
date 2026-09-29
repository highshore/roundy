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

## Legacy email / ID infrastructure

Existing email/password and username-login infrastructure remains in the backend for existing/internal accounts, but it is not offered as a public Roundy sign-in method. The public UI must not advertise ID/email registration.

\`roundy-username-login\` resolves existing IDs with server-only access to \`account_usernames\`, verifies the real password through Supabase Auth, and returns a normal user session. No auth service key belongs in Vercel or browser code.

## Profile and legal consent

Date of birth is not collected as an authentication gate. It is collected in the Roundy event profile and validated there. Required/optional collection conditions are documented in the Privacy Policy.

Terms and Privacy consent is recorded after authentication through the account-consent flow.
