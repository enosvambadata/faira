# Faira Market — Pause Report

Date paused: 2026-07-11
Git tag: `marketplace-pause-2026-07-11`
Jira label applied to all open marketplace tickets: `marketplace-paused`

## What's complete (live in production/staging, untouched)

Everything through SCRUM-71 is shipped and deployed to Railway staging:

- **Core marketplace** (SCRUM-15–51, pre-dating this session's detailed log): auth, listings, search, wishlist, buyer-seller chat, seller profiles, verification, account deletion/export.
- **Payments epic** (SCRUM-52–65): Paynow + cash-on-delivery checkout, escrow hold/release with commission split, seller payout requests, buyer payment disputes, delivery fee calculation, order state machine (8 statuses), push notifications, seller arranges delivery + tracking.
- **Reviews & Trust epic** (SCRUM-66–71): review schema, both-parties-review-after-completion with blind reveal, seller aggregate rating + paginated review list, flag-a-review moderation queue, reports schema, report-a-listing-or-seller.

381 backend tests passing, full CI on every PR (`api-ci.yml`, `mobile-ci.yml`).

## What's incomplete (moved to paused backlog, labeled `marketplace-paused`, not deleted)

45 open Jira issues, spanning:

| Epic | Status |
|---|---|
| SCRUM-2 Authentication | Epic-level, largely superseded by shipped auth work but left open as a container |
| SCRUM-3 Product Listings | Epic-level, mostly shipped; open items are polish |
| SCRUM-4 Search & Filters | Epic-level |
| SCRUM-5 Buyer-Seller Chat | Epic-level, shipped |
| SCRUM-6 Seller Profiles | Epic-level, shipped + extended by SCRUM-68 |
| SCRUM-7 Payments | Epic-level, fully shipped (SCRUM-52–65) |
| SCRUM-8 Delivery | Epic-level, fully shipped (SCRUM-61, 64) |
| SCRUM-9 Reviews & Trust | Epic-level, shipped through SCRUM-71; SCRUM-72 (banned-keyword scanning) was the next queued ticket in this epic when the pivot happened |
| SCRUM-10 Product Discovery | Epic-level |
| SCRUM-11 Admin Dashboard | Epic-level — **entirely unbuilt**. SCRUM-75–80 (scaffold dashboard, user/listing/verification/dispute/analytics management) are all still To Do. Today's "admin" surface is a handful of `x-admin-token`-gated API endpoints with no UI. |
| SCRUM-12 Security & Compliance | Epic-level — SCRUM-74 (rate limiting), SCRUM-81–84 (ToS/privacy, secure ID storage, customs disclosure, consent screen) all To Do |
| SCRUM-13 Testing & Launch | Epic-level — SCRUM-85–94 (test suites, QA regression, OWASP review, load testing, app store listings, support process, soft launch, KPI dashboard) all To Do |
| SCRUM-14 UX/UI Design | Epic-level — SCRUM-96/97/99 In Review (personas, seller interviews, journey maps), SCRUM-101–104 To Do (high-fidelity screens, component library, prototype, app icon/splash) |
| — | SCRUM-29 (wireframes) and SCRUM-62 ("buyer tracks order status," left In Progress from an earlier session — the functionality is live, the ticket was never formally closed) also labeled and left as-is |

None of this work is lost. It's queryable in Jira via `label = marketplace-paused`, and this document is the point-in-time snapshot of what stage the marketplace was at.

## Reusable components identified for Faira Fulfilment

These marketplace pieces are directly reusable, not rebuilt:

- **User/auth model** — `requireAuth` middleware, Supabase JWT verification, the lazy `User` upsert pattern. Fulfilment roles get layered on top of this, not instead of it.
- **Payment/escrow domain** — `PaymentStatus`, `EscrowLedgerEntry` (HOLD/RELEASE/REFUND/PAYOUT), Paynow integration, commission-split logic (`escrowRelease.ts`). Fulfilment's Settlement module is structurally the same problem (hold money, release on a trigger, split fees) and should extend these rather than reinvent them.
- **State machine pattern** — `orderStateMachine.ts`'s `canTransition`/`displayStatus` approach, plus the atomic `updateMany({ where: { id, status: currentStatus } })` race-safe transition pattern used everywhere in `orders.ts`. This is the exact shape needed for the shipment state machine.
- **Notification plumbing** — `orderNotifications.ts` (Expo push) and the Africa's Talking SMS integration in `webhooks.ts` are real, working senders. The abstraction layer the Fulfilment spec asks for (swap providers without touching business logic) doesn't exist yet, but two of the three channels already have a working provider to wrap.
- **Evidence/photo upload pattern** — Cloudinary signed-upload flow (`cloudinary.ts`, `signXUpload()` functions) used for dispute/report/verification evidence is exactly the pattern needed for parcel photos, tamper-seal photos, and proof-of-collection images.
- **Admin gate** — `requireAdmin`'s shared-secret pattern is a stopgap, not reusable as-is for Fulfilment's 8-role system, but the CI/deployment/testing conventions around it (Zod validation, ApiError codes, Vitest + Supertest with fully-mocked Prisma) are the conventions Fulfilment code should follow.

## Integration point for later marketplace re-activation

Per the pivot brief, Faira Market must eventually create Fulfilment shipments through a stable internal interface rather than reaching into Fulfilment's tables directly. Recommendation once Fulfilment ships: expose a narrow `POST /api/v1/fulfilment/shipments` (or an internal service function) that Marketplace order-completion logic calls, keeping `Order` (marketplace) and `Shipment` (fulfilment) as separate models linked by an optional `sourceOrderId` on `Shipment` — not a foreign key the other direction, so Fulfilment has no compile-time dependency on Marketplace tables. Not built yet; noted here so the schema design doesn't accidentally foreclose it.
