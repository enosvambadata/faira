# Vamba Collect — production environment checklist

The API is best-effort about notifications, so a missing provider does **not**
crash — it goes silently mute. This checklist is the antidote: set these before
treating a deploy as live. On boot the API **fails loudly** on the one hard
requirement and **warns loudly** (see `warnOptionalConfig`) on the rest.

## Hard requirement (API refuses to boot without it)
| Var | Why |
|---|---|
| `COLLECT_UK_TRACKING_TOKEN_SECRET` | HMAC secret for guest booking + shipment tracking tokens. Generate: `openssl rand -hex 32`. Without it a booking would commit and then fail to mint its tracking link. |

## Reliability-critical (best-effort, but the product is mute without them)
| Var(s) | Why |
|---|---|
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM` | **UK SMS.** The default Africa's Talking transport reaches African telcos only and **cannot deliver to +44**. Without Twilio, every customer SMS silently no-ops on UK numbers. All three required together. |
| `RESEND_API_KEY` + `EMAIL_FROM` | **Email** — the reliable second channel (no +44 gap). Customers who give an email at booking get updates here even if SMS is down; also driver approve/reject mail. Both required together. |

Every customer notification is now recorded in `collect_uk_notification_logs`
(channel, recipient, event, `SENT`/`FAILED`/`SKIPPED`, provider, detail), so you
can verify delivery instead of guessing. A row with `provider: 'africas-talking'`
on a UK booking, or `status: 'SKIPPED'`, is the tell that Twilio/Resend is unset.

## Payments (Vamba Collect card payments — env-gated, dormant until set)
| Var(s) | Why |
|---|---|
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | GBP Checkout + signature-verified webhook at `POST /api/v1/webhooks/stripe`. Absent → the payments endpoint returns 503 `STRIPE_NOT_CONFIGURED` (no crash). |

## Shared foundation (needed by every deploy)
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`
(driver-doc + proof uploads), `WEB_APP_URL` (booking/tracking/portal/pay links —
**falls back to `http://localhost:3100` if unset**, which would ship localhost
links to real customers), `ADMIN_TOKEN` (dispatch board), `SENTRY_DSN`, `PORT`.

## Go-live smoke test
1. Boot the API; confirm **no** `warnOptionalConfig` warnings in the logs.
2. Create a test booking with a real UK mobile **and** an email → confirm the
   SMS and the email both arrive, and two `SENT` rows land in
   `collect_uk_notification_logs`.
3. Confirm `WEB_APP_URL` is the real domain (tracking link is not `localhost`).
4. Send a signed Stripe test webhook to `/api/v1/webhooks/stripe`; confirm the
   payment flips `PENDING → PAID`.
