# Phase 4 — Monorepo split cutover runbook (6 Railway services)

Turns the CI-green branch `task/SCRUM-262-phase0-workspaces-db` (PR #173) into six
live services. **No secret values are recorded in this file** — set each variable
from your own vault/rotation. Rotate every credential that was shared in chat.

**Golden rules**
- Cut over **one product at a time: Vamba Collect → Faira Fulfilment → Faira Parts (last).**
- Keep the **old combined deploy warm** for rollback until Parts is verified.
- Exactly **one migrate owner**: only `parts-api` runs `prisma migrate deploy`. Collect + Fulfilment APIs run `prisma generate` at build, `node dist/server.js` at start, **never migrate**.
- Do the risky, staging-breaking merge (Step 5) only **after** the new services are pre-created and configured (Steps 1–4), so downtime is minutes not hours.

---

## The 6 services (all: build context = repo ROOT, dockerfilePath = the app's Dockerfile)

| Service | Dockerfile | Start | Migrate? |
|---|---|---|---|
| parts-api | `apps/api/Dockerfile` | `node apps/api/dist/server.js` | **YES** (release cmd) |
| collect-api | `apps/collect-api/Dockerfile` | `node apps/collect-api/dist/server.js` | no |
| fulfilment-api | `apps/fulfilment-api/Dockerfile` | `node apps/fulfilment-api/dist/server.js` | no |
| parts-web | `apps/web/Dockerfile` | `npm run start -w faira-web` | no |
| collect-web | `apps/collect-web/Dockerfile` | `npm run start -w collect-web` | no |
| fulfilment-web | `apps/fulfilment-web/Dockerfile` | `npm run start -w fulfilment-web` | no |

The web images bake `NEXT_PUBLIC_*` at **build** time → set those as Railway
**build args/variables**, not just runtime env.

---

## Env var split (set by NAME; use your rotated values)

**Shared (every API):** `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, Cloudinary (`CLOUDINARY_*`), `ADMIN_TOKEN`.
**Shared (every web, as build args):** `NEXT_PUBLIC_API_URL` (that product's API domain), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

- **parts-api:** + Paynow creds, Africa's Talking (`AFRICASTALKING_*`), `TRACKING_TOKEN_SECRET`.
- **collect-api:** + Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC`/publishable on collect-web), Twilio (`TWILIO_*`), Resend (`RESEND_API_KEY`), `COLLECT_UK_TRACKING_TOKEN_SECRET`.
- **fulfilment-api:** shared set only (+ any fulfilment-specific it already used).

Only **parts-api** should carry the migrate release command.

---

## Steps

**1. Pre-create the 3 new services** (collect-api, collect-web, fulfilment-api,
fulfilment-web, parts-web — i.e. everything except the one existing service you'll
repurpose as parts-api). For each: connect the repo, set **root build context** +
the app's `dockerfilePath`, and the env/build vars above. Do **not** attach domains yet.

**2. Supabase redirect allow-list** (before any domain flip): in the one Supabase
project, add `https://<each web domain>/auth/callback` for all three web apps.
Keep the existing entries.

**3. Fix hardcoded URLs** on the branch before merge:
- `apps/*/e2e/**` and any `partners.html` referencing `api-staging-9878.up.railway.app` → the new per-product API domains.
- Verify each web service's `NEXT_PUBLIC_API_URL` points at its own product's API.

**4. Migrate owner:** add `prisma migrate deploy` (via `npm run migrate -w @faira/db`)
as the **release command on parts-api only**. Confirm collect/fulfilment have **no**
migrate hook.

**5. Merge PR #173 → `develop`** (the irreversible, staging-affecting step). This
flips the Docker build context to repo root; the *old* combined service will fail to
auto-build until you point it at `apps/api/Dockerfile` (root context) = parts-api.
Do this in a low-traffic window.

**6. Cutover, one product at a time:**
   1. **Collect** — deploy collect-api + collect-web, smoke-test (a booking + a *signed* Stripe webhook), then point `collect.<domain>` + the collect API subdomain at them.
   2. **Fulfilment** — same, smoke-test a shipment.
   3. **Parts (last)** — repurpose the old service as parts-api (root context, `apps/api/Dockerfile`, migrate release cmd), deploy parts-web, smoke-test an order + confirm Paynow still works. Only now enable the migrate release command and run one no-op migration to prove the single-owner path.

**7. DNS:** point the 6 subdomains at their Railway services (registrar). Suggested:
`market.` / `api.` (Parts), `collect.` / `collect-api.` (Collect), a fulfilment pair.

---

## Rollback
- Phases 0–3 are pure refactors; the old combined deploy stays warm until Parts is verified.
- If a product misbehaves post-flip, repoint its DNS back to the old combined service.
- The migrate release command goes on parts-api **only at the very end**, after schema parity is confirmed — so no concurrent-migrate risk.

## Post-cutover
- Rotate every shared credential.
- Optional cleanup: rename `apps/api`→`parts-api` / `apps/web`→`parts-web`; real marketplace landing (today `/`→`/market`); move the 3 fulfilment admin routes out of `apps/api/admin.ts`; drop unused Poppins/Open-Sans + `.theme-collect` from parts-web.
