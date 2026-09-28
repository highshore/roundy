# Authentication

Roundy’s public sign-in screen offers ID/email, Kakao, and phone/SMS authentication.

## Kakao

Kakao OAuth requests only the scopes used by Roundy: nickname and profile image. Roundy does not request name, gender, birthday, birth year or the Kakao-account phone number during sign-in. Age and other event-profile details are collected later in the profile flow, where the 19+ eligibility rule remains enforced.

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
