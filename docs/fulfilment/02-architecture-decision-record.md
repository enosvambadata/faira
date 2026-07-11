# ADR: Faira Fulfilment Architecture

Status: Accepted
Date: 2026-07-11
Supersedes: none (new product line, sibling to Faira Market)

## Context

Faira is pivoting to launch Faira Fulfilment (hub-to-hub parcel fulfilment, Harare ↔ Bulawayo pilot) as the first live product, with Faira Market paused (see `01-marketplace-pause-report.md`). The repository audit (`00-repository-audit.md`) found a sound, working Express + Prisma + Supabase(auth) + Railway + Cloudinary stack with no technical blocker to extending it. This ADR fixes the decisions needed to start building instead of re-debating stack choices ticket by ticket.

## Decisions

### 1. One repository, one Postgres database, shared backend

Fulfilment is added to the existing `apps/api` Express app and the existing Prisma schema/database — new models, new route modules, no second database and no second backend service. Marketplace tables are untouched; Fulfilment tables are additive. This keeps `User` (and its Supabase-issued identity) shared across both product lines, which is required for "shared seller identities" per the pivot brief and for the future marketplace→fulfilment integration point.

**Rejected alternative**: separate microservice/database for Fulfilment. Rejected because there is no scale or team-size justification for the operational overhead yet (single small team, single Postgres instance handles both domains fine at pilot scale), and it would duplicate the User/Auth model instead of sharing it.

### 2. New Next.js web app for Seller Portal, Hub Ops, and Admin

The existing `apps/mobile` Expo app is a consumer marketplace app (buyer/seller browsing, chat, checkout) and is out of scope while paused. Fulfilment's three internal-facing surfaces (seller portal, hub staff ops dashboard, admin dashboard) are a different product shape — desktop-first, data-dense, role-gated — and don't belong bolted onto the consumer app. A new `apps/web` (Next.js + TypeScript) is added to the monorepo, calling the same `apps/api` backend the mobile app already calls.

Buyers get **no app and no web app account** — per the pivot brief, buyer tracking is a signed, time-limited link (server-rendered or a lightweight static page within `apps/web` at a public route, no auth required, no PII beyond what's already been shared with the shipment).

**Rejected alternative**: extend the Expo app's web build for hub/admin use. Rejected because Expo's web output is optimized for the consumer app's needs (image-heavy, gesture-based) not for the tabular, keyboard-and-scanner-driven workflows hub agents need, and mixing marketplace and fulfilment auth/roles into one app increases the chance of a role-check mistake exposing one product's data to the other.

### 3. Authorization stays in the application layer; RLS is defense-in-depth, not the primary control

The audit found Prisma connects to Postgres directly with a role that bypasses RLS, and the app never routes queries through Supabase's PostgREST layer with an end-user JWT. Retrofitting RLS as the *actual* enforcement mechanism would require re-architecting how every request reaches the database — out of proportion to the pilot's timeline and not something the existing marketplace code does either.

**Decision**: build a real RBAC system in the application layer — `Role`, `Permission`, `UserRole` (or `HubStaffAssignment` for hub-scoped roles) tables, checked in Express middleware before any Prisma call, mirroring the existing `requireAuth`/`requireAdmin` pattern but with actual role/permission data instead of a shared secret. Add Postgres RLS policies on the most sensitive new tables (payments, evidence, audit logs) as an additional safety net for the rare case of a bug or a direct DB query bypassing the API — but the audit trail, tests, and code review should treat the **API-layer check as the source of truth**, not the RLS policy. This is stated explicitly so nobody later assumes RLS alone protects a table it doesn't.

### 4. Notifications: provider abstraction over Africa's Talking (SMS, already working) + a new WhatsApp provider + existing email/push

A `NotificationChannel` interface (`send(recipient, template, data): Promise<NotificationResult>`) is implemented by an SMS adapter (wrapping the existing Africa's Talking client), a WhatsApp adapter (new — Meta Cloud API, since it doesn't require a third-party BSP contract for the pilot volume), and reuses the existing Expo-push and (once chosen) email senders. Business logic calls a `NotificationService.notify(event, ...)` that resolves which channel(s) apply per event/recipient, never a provider SDK directly.

### 5. Background jobs: start with Railway cron + endpoint, not a queue

No job queue exists today; the marketplace's "reminder" style features are admin-triggered endpoints. For the pilot's volume (two hubs, one route), Railway's built-in cron trigger calling a protected internal endpoint (same shape as the existing delivery-reminder admin endpoint) is sufficient for: seller drop-off reminders, buyer collection reminders, collection-window expiry. **Revisit** (introduce Redis + BullMQ) only if/when job volume, retry semantics, or multi-instance coordination actually require it — not preemptively.

### 6. Payments: extend the existing Payment/Escrow domain, provider-abstracted

Reuse `PaymentStatus`-style state, add `SellerSettlement` mirroring the existing escrow-release commission-split pattern. Keep the existing Paynow integration as the first payment provider behind a `PaymentProvider` interface (`initiate`, `pollStatus`, `handleWebhook`) so EcoCash/ZimSwitch-specific providers can be added later without touching settlement logic. **No claim of legal escrow** is made anywhere in code, copy, or these docs — "funds held pending collection" is an internal ledger state, not a regulated escrow product, unless/until a licensed provider is contracted for that.

### 7. File storage: continue with Cloudinary for now, revisit before launch if a compliance reason emerges

The audit found Supabase Storage is provisioned but unused; Cloudinary is the real, working, signed-upload pattern already in production for sensitive evidence (verification IDs, dispute photos). Reusing it for parcel photos, tamper-seal photos, and proof-of-collection avoids introducing a second storage system for the pilot. If a specific compliance requirement (e.g. data residency for ID documents) later rules out a third-party CDN, revisit as a dedicated ticket — not assumed away here.

## System context (textual, pilot scope)

```
Seller (web browser) ──┐
Hub Agent (web browser)├──> apps/web (Next.js) ──> apps/api (Express) ──> Postgres (Supabase-hosted)
Admin (web browser) ───┘                                │        │
                                                          │        └──> Cloudinary (evidence/photos)
Buyer (SMS/WhatsApp link, no app) ─────────────────────>│
                                                          ├──> Africa's Talking (SMS)
                                                          ├──> WhatsApp provider (new)
                                                          └──> Paynow (payments)
```

## Container-level module boundaries (apps/api)

New route modules, each following the existing `orders.ts`/`admin.ts` conventions (Zod schemas, `ApiError`, atomic `updateMany` transitions):

- `routes/auth-roles.ts` — role/permission assignment (admin-only)
- `routes/hubs.ts` — hub CRUD, opening hours (admin)
- `routes/shipments.ts` — seller-facing: create, quote, confirm, cancel, history
- `routes/hub-ops.ts` — hub-agent-facing: search, accept drop-off, inspect, dispatch/arrival scans, collection
- `routes/manifests.ts` — transport-run and manifest management
- `routes/tracking.ts` — public, unauthenticated buyer tracking by signed token
- `routes/settlements.ts` — seller settlement, payouts
- `services/shipmentStateMachine.ts` — single source of truth for valid transitions (mirrors `orderStateMachine.ts`)
- `services/notifications/` — channel abstraction + adapters
- `services/collectionCode.ts` — code generation/verification

## Major trade-offs accepted

1. RLS as defense-in-depth only, not primary control (see #3) — documented so it isn't mistaken for Supabase-native security later.
2. A second frontend app (`apps/web`) is more surface area to maintain than reusing the existing one, accepted because the user bases and interaction patterns are too different to share cleanly.
3. No queue infrastructure at launch — accepted risk: if pilot volume spikes unexpectedly, reminder/settlement jobs could run long on a single cron tick; mitigated by keeping each job idempotent and bounded to the two-hub pilot scale.
4. Deferring a licensed escrow provider — accepted risk: "held funds" language must stay internal/ledger-only in all user-facing copy until/unless a licensed provider is contracted.
