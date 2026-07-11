# Faira Repository Audit (pre-Fulfilment pivot)

Date: 2026-07-11
Scope: `apps/api`, `apps/mobile`, infra (Supabase, Railway, GitHub Actions)

## Frontend

- **Single codebase, three targets**: React Native + Expo (`apps/mobile`), running on iOS, Android, and web (Expo web). There is **no separate responsive web app** — "the web app" today is the Expo web build of the same screens buyers/sellers use on mobile.
- Navigation via `@react-navigation/native-stack`. Lightweight hand-rolled API client (`src/lib/api.ts`), no React Query/SWR — each screen manages its own loading/error state.
- No component library beyond hand-styled `StyleSheet` screens; a `src/theme/` module centralizes colors/typography.

**Implication for Fulfilment**: the prompt's "Sellers should have a responsive web application" and "Hub staff / Admin should have a dashboard" are new surfaces, not extensions of existing screens. Recommend a **new web app** (Next.js, per the fallback stack) for seller portal + hub ops + admin, rather than forcing three very different user bases (seller, warehouse staff, admin) into the existing consumer-facing Expo app. The existing mobile app is out of scope for Fulfilment v1.

## Backend

- **Express 5** API (`apps/api`), TypeScript, Zod validation at every route boundary, a consistent `ApiError` + centralized error handler.
- **Prisma 7** ORM via `@prisma/adapter-pg`, i.e. Prisma connects **directly to Postgres with its own credentials** (`postgres.<project>` pooler connection string) — not through Supabase's PostgREST/client layer. This is the single most important architectural fact for the RLS requirements below.
- 21 models today, all marketplace-domain (User, Listing, Order, Payment, EscrowLedgerEntry, Review, ReviewFlag, Report, etc.) — see `apps/api/prisma/schema.prisma`.
- No queue/worker infrastructure (no Redis, no BullMQ, no cron). Scheduled-style work (delivery reminders, auto-release) is implemented as admin-triggered endpoints, not background jobs.
- Route-level authorization is 100% application code: `requireAuth` middleware resolves a Supabase JWT to a `userId`, then each route hand-checks ownership (`order.buyerId === req.userId`, etc.). A separate `requireAdmin` middleware is a **shared-secret header check** (`x-admin-token`), not a role system — there is currently exactly one privilege level ("has the admin token") beyond "authenticated user."
- SMS: `africastalking` package is installed and used in `webhooks.ts` (found live in production code, not just a placeholder). No WhatsApp integration exists yet anywhere in the repo.
- Payments: Paynow Zimbabwe integration via the official `paynow` npm package, plus a `CASH_ON_DELIVERY` method. Payment/escrow domain already has a real state machine (`PaymentStatus`, `EscrowLedgerEntry` with HOLD/RELEASE/REFUND/PAYOUT types) — this is directly reusable groundwork for Fulfilment's Payments & Settlement module.
- Images: **all image storage is Cloudinary**, not Supabase Storage (`src/lib/cloudinary.ts` — signed client-direct uploads to Cloudinary for listings, chat, verification docs, dispute evidence, review-report evidence). Supabase Storage is provisioned (one public `listing-images` bucket per infra memory) but the running application does not write to it.

## Database & Auth (Supabase)

- Supabase project provides **only two things** to the running app: (1) Auth (issuing/validating JWTs, OTP flows via `supabasePublic`), and (2) the underlying Postgres instance Prisma connects to directly.
- **Supabase Row Level Security is not part of the enforcement path today.** Prisma's connection string uses a role with full table access (needed for a generic ORM to work); RLS policies, if any exist from initial Supabase setup, are bypassed because the app never queries through PostgREST/the Supabase client with an end-user JWT. All authorization is enforced in Express route handlers before a Prisma call is ever made.
- `public.users` rows are provisioned lazily on first authenticated request (`requireAuth` upserts a `User` row keyed by the Supabase `auth.users.id`), not via a Postgres trigger.
- No dedicated staff/role tables exist. Every human in the system today is a `User` row; "admin" is not a row property, it's whoever holds the `ADMIN_TOKEN` secret.

## Deployment / CI

- **Railway**: one project (`faira-api`), one service (`api`), two environments (`staging`, `production`). `develop` branch auto-deploys to staging on push; there is no equivalent auto-deploy path to production from `main` (production has historically been deployed by manually pointing Railway at a commit — not exercised much this session).
- **GitHub Actions**: `api-ci.yml` runs lint + vitest unit tests on every PR touching `apps/api`, plus a Docker build validation job (no push/deploy from CI itself — Railway's own GitHub integration handles deploy). `mobile-ci.yml` exists in parallel for the mobile app.
- Migrations are version-controlled SQL files under `apps/api/prisma/migrations/`, but **`prisma migrate dev`/`deploy` hang indefinitely on the primary dev machine** (suspected Windows Firewall/AV blocking the schema-engine binary). The established workaround all session: diff schema with `prisma migrate diff --script`, hand-save the SQL, apply it directly via a `pg` `Client` in a transaction, and manually insert the matching row into `_prisma_migrations` so Prisma's own migration history stays consistent. This same workaround will be used for Fulfilment migrations.

## Testing

- 22 backend test files (Vitest + Supertest), fully mocked Prisma/Supabase per file — no integration tests against a real database in CI. 381 tests passing as of the last marketplace ticket (SCRUM-71).
- No mobile-level automated tests (screens are verified manually / via `tsc --noEmit` + live staging checks).

## Technical debt / risks worth carrying into Fulfilment planning

1. **No role/permission system.** Fulfilment's 8 roles (Seller, Hub Agent, Hub Supervisor, Transport Operator, Support, Finance Admin, Ops Admin, Super Admin) require building RBAC from scratch — this is genuinely new infrastructure, not an extension.
2. **RLS is not the app's authorization model.** Building real Postgres RLS policies as the prompt describes would require either (a) changing how the app connects to Postgres (per-request role switching, which Prisma+pgBouncer makes awkward), or (b) treating RLS as defense-in-depth only, with Express-layer role checks as the actual enforcement (matching the existing pattern). Recommendation: **(b)** — keep enforcing in the API layer (extend the existing middleware pattern), add RLS policies on new sensitive tables as a second line of defense where practical, and say so explicitly rather than imply Supabase-native security when the architecture doesn't use it that way.
3. **No background job runner.** Reminders, settlement, manifest reconciliation etc. need a scheduling mechanism. Given Railway hosting and no existing Redis, the pragmatic near-term option is a Railway cron-triggered endpoint (same pattern as the existing admin-triggered delivery-reminder endpoints) rather than introducing BullMQ/Redis before it's proven necessary.
4. **No WhatsApp integration exists.** SMS (Africa's Talking) is real and working; WhatsApp will need a new provider (e.g. Meta Cloud API or Twilio) behind the same notification abstraction.
5. **Windows dev-machine Prisma migration hang** is a standing friction point for whoever runs migrations locally — already has a documented workaround, carried forward.

## Recommendation

**Extend, don't rewrite.** The existing Express + Prisma + Supabase(auth only) + Railway + Cloudinary stack is sound and directly reusable for Fulfilment:
- Same Postgres database (new tables, `apps/api/prisma/schema.prisma` extended, not a second database).
- Same Express app, new route modules (`hubs`, `shipments`, `manifests`, ...), same Zod+ApiError conventions.
- Same Railway project — new environment variables, possibly a second Railway service later for a worker process, not a new project.
- **New**: a role/permission layer (new tables + middleware), a Next.js web app for seller/hub/admin surfaces (the existing Expo app is marketplace-only and out of scope), a WhatsApp provider, and a background-job mechanism once a specific job actually needs one.

No infrastructure migration (AWS/Azure/Firebase/Clerk) is justified — there is no technical blocker found in this audit that the current stack cannot handle.
