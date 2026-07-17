# Email verification on signup

Email signups create an **unconfirmed** account and Supabase emails a confirmation
link. The account cannot log in until the link is clicked. This closes the hole
where a bot could mass-register fake companies against unverified email addresses.

Phone signups are unaffected — they stay OTP-verified as before.

## What the code does

- `POST /api/v1/auth/signup` (email): creates the user with `email_confirm: false`
  and calls `supabase.auth.resend({ type: 'signup' })` to send the confirm link.
  Returns `confirmationEmailSent` so the client can warn if mail delivery failed.
- `POST /api/v1/auth/email/resend`: resends the confirm link. Always returns 200
  (even for unknown addresses) so it can't be used to enumerate registered emails.
- Web/mobile signup: show a **"check your inbox"** screen instead of auto-login.
- Web login: an unconfirmed login attempt (`email_not_confirmed`) shows a
  "confirm your email first" message with a resend button.

## Required Supabase settings (do this to arm the gate)

The code is safe to deploy before these are set — accounts are just created
unconfirmed and the login gate only switches on once **Confirm email** is enabled.

In the Supabase dashboard for the Collect UK project:

1. **Authentication → Sign In / Providers → Email**
   - Enable **Confirm email**. (This is the actual gate — it's a global setting
     and applies to every email login across web + mobile.)

2. **Project Settings → Authentication → SMTP Settings** — set custom SMTP so the
   confirmation emails actually deliver (the default Supabase mailer is rate-limited
   to a few per hour and not for production):
   - Host: `smtp.resend.com`
   - Port: `465` (or `587`)
   - Username: `resend`
   - Password: a Resend API key
   - Sender email: an address on the verified `updates.vambadata.com` domain
   - Sender name: `Vamba Collect`

3. **Authentication → URL Configuration**
   - Site URL: `https://collect.vambadata.com`
   - Redirect URLs: add `https://collect.vambadata.com/**` (and
     `http://localhost:3100/**` for local dev). The confirm link redirects here
     after verification.

4. **Authentication → Email Templates → Confirm signup** — the default template
   works; adjust copy/branding if desired.

## Verifying it works

1. Sign up with a real inbox on staging → you land on "check your inbox".
2. Confirm the link arrives (check spam) → click it.
3. Sign in → succeeds. Signing in *before* confirming → "confirm your email first".

## Stronger bot defence (deferred)

Email verification proves the address is real but doesn't stop a bot with real
inboxes. If automated signups persist, add a **Cloudflare Turnstile** CAPTCHA to
the signup form (Supabase has native support) — decided against for now to keep
onboarding frictionless.
