# Faira Collect UK — Repository Audit & Reuse Assessment

Date: 2026-07-12
Scope: `apps/api`, `apps/web`, `apps/mobile`, infra (Supabase, Railway, GitHub), against the
"FAIRA PROJECT STEERING DOCUMENT v2.0" strategic expansion brief.
Status: **Audit and planning only.** No Jira restructuring, schema changes, or implementation
have been started — this document is the checkpoint requested before that work begins.

## Executive summary

The steering document asks for a new, UK-based, multi-tenant parcel-collection product ("Faira
Collect UK") sitting alongside the existing Zimbabwe hub-to-hub Fulfilment product and the paused
Market app. The good news: the repo's existing conventions (Express + Prisma + Supabase-auth +
Railway + Cloudinary, Zod-validated routes, atomic `updateMany` state transitions, RBAC-in-app-code)
extend cleanly to a third product line the same way Fulfilment extended Marketplace. **Most of the
"shared logistics engine" concept can be realized as shared modules within the existing `apps/api`
app, not a new package or service** — see the Architecture Concerns section for why a literal
"engine" extraction isn't justified yet.

The bad news, stated plainly because a few things in the steering document don't fit as cleanly as
its "maximise reuse" framing implies: **the two products' domain models solve genuinely different
shipping problems.** Fulfilment is *scheduled hub-to-hub freight between two Faira-owned
warehouses*; Collect UK is *on-demand, address-to-address driver collection for third-party
companies' own warehouses*. Several of the steering document's implied reuse targets (`Hub`,
`TransportRoute`, `TransportRun`) are a poor structural fit for that and would need new models
alongside them, not a shared table. Payments and SMS providers are Zimbabwe/Africa-specific and
need new UK integrations outright. These are called out below rather than glossed over.

## What's directly reusable, unchanged

- **Auth**: Supabase JWT issuance/verification, `requireAuth` middleware, the lazy `User` upsert
  pattern. A UK driver/dispatcher/company-admin is still a `User` row with roles layered on top,
  same as every other persona in this app.
- **Audit logging**: `AuditLog` model + `recordAuditLog()` service — generic, already
  action-string-based, no schema change needed to log Collect UK events.
- **State machine pattern**: `canTransition`/`displayStatus` + atomic
  `updateMany({ where: { id, status: currentStatus } })` race-safe transitions
  (`shipmentStateMachine.ts`, `orderStateMachine.ts`). A `CollectionBooking` status lifecycle
  (REQUESTED → SCHEDULED → EN_ROUTE → COLLECTED → AT_WAREHOUSE → HANDED_OVER → CLOSED, roughly)
  should copy this exact pattern, not invent a new one.
- **Evidence/proof-of-collection pattern**: `ParcelEvidence`, `ParcelSeal`, and the newly-built
  `CollectionEvent` (SCRUM-146) — signed Cloudinary uploads, photo + optional signature capture,
  immutable-by-convention records with no update/delete route. Directly reusable shape for a UK
  driver's proof-of-collection.
- **Admin surface convention**: `x-admin-token`-gated endpoints (`requireAdmin`), Zod validation,
  `ApiError` codes, Vitest+Supertest with fully-mocked Prisma. Keep following these conventions for
  every new Collect UK route.
- **`SystemConfiguration` key/value pattern**: for every tunable (collection radius, driver capacity
  defaults, etc.) rather than hardcoding.
- **Deployment pipeline**: same Railway project, same `develop`→staging auto-deploy, same GitHub
  Actions CI shape. No infra changes needed to add a third product's routes to the same API service.

## What already exists in schema but is unused — a real head start

The schema has several models designed ahead of implementation that map well onto Collect UK's
"notifications" and "payments" needs, the same way `CollectionEvent`/`SellerSettlement` sat unused
in schema for a session before SCRUM-142/146 implemented them:

- **`NotificationTemplate` / `Notification` / `NotificationChannel` enum** — a real
  channel-abstraction schema (matches steering doc Epic "Notifications" and the already-queued
  SCRUM-147). Zero lines of code reference it yet. This is the natural home for the
  `NotificationChannel` interface the Fulfilment ADR proposed but never built.
- **`SupportTicket`** — schema exists, unused. Relevant to the steering doc's "Support" user type.

## What needs real modification or generalization (not straight reuse)

- **RBAC has no tenant dimension.** `UserRole.hubId` scopes a role to a Faira-owned `Hub`; there is
  no `companyId`/tenant column anywhere. Collect UK's "Company Administrator can only see Company
  A's bookings" requirement needs either (a) a new tenant-scoped role table
  (`CompanyRole { userId, role, companyId }`, mirroring `UserRole`'s shape), or (b) extending
  `UserRole` with a nullable `companyId` alongside the existing nullable `hubId`. **Recommendation:
  (a), a parallel table** — reusing `UserRole` for two different scoping dimensions (hub vs.
  company) invites exactly the kind of role-check mistake the Fulfilment ADR warned about when
  explaining why marketplace and fulfilment auth were kept apart.
- **Payments are Zimbabwe-specific.** `FulfilmentPaymentMethod` (EcoCash/OneMoney/ZimSwitch) and the
  Paynow integration cannot process a UK company's subscription billing or a UK customer's card
  payment. This needs a **new** provider integration (Stripe is the obvious fit — it's also cited in
  the steering doc's own UX-inspiration list, and its subscriptions API directly fits
  "logistics companies subscribe to Faira Collect"). The *pattern* (a `PaymentProvider` interface,
  state-machine-tracked payment status) is reusable; the provider and the specific
  method/status enums are not.
- **SMS is Africa-specific.** Africa's Talking's core market is Africa; a UK-domiciled customer base
  needs a different SMS/WhatsApp provider (Twilio or the Fulfilment ADR's already-proposed Meta
  Cloud API for WhatsApp). The notification *abstraction* (see above) is exactly what makes this a
  swap-the-adapter problem instead of a rewrite, once it's actually built.
- **`Hub`/`TransportRoute`/`TransportRun` are a weaker fit than the steering doc implies** — see
  Architecture Concerns below. Don't reuse these tables directly for Collect UK; model the new
  domain instead and let both products share the *pattern*, not the *rows*.

## Net-new domain entities needed for Faira Collect UK

None of these exist today in any form (schema or code):

| Entity | Purpose |
|---|---|
| `Company` | The tenant — a shipping company subscribing to Faira Collect. Profile, branding, countries served, service areas, opening hours, billing/subscription status. |
| `CompanyWarehouse` | A company's own drop-off warehouse (distinct from Fulfilment's Faira-owned `Hub` — Faira doesn't operate this location). |
| `CompanyRole` | Tenant-scoped RBAC: `{ userId, role, companyId }` — `COMPANY_ADMIN`, `DISPATCHER` initially. |
| `Driver` | A Faira-employed driver (steering doc: "Drivers belong to Faira," not the company) — profile, vehicle, capacity, availability. |
| `CollectionBooking` | The core object: customer, chosen company, destination country, collection address, preferred date/window, parcel size/weight, special instructions, status. Analogous to `Shipment` but customer-initiated and address-based rather than seller-initiated and hub-based. |
| `CollectionRoute` / `CollectionStop` | A driver's optimised sequence of stops for a shift — genuinely new; nothing in the current schema models multi-stop dynamic routing (see below). |
| `DriverProofOfCollection` | Can likely reuse the `CollectionEvent`/`ParcelEvidence` *shape* rather than being a distinct model — worth a design pass once this ticket starts, not decided here. |
| `Subscription` | Company's Faira Collect billing plan/status, tied to the new payment provider. |

## Architecture concerns (flagging before anyone builds against this)

1. **"Faira Logistics Engine" should not become a literal shared package yet.** The steering
   document's org chart implies a standalone engine component. There's no workspace tooling in this
   repo today (no root `package.json`, no `pnpm-workspace.yaml`/`turbo.json` — each of `apps/api`,
   `apps/web`, `apps/mobile` is independently managed). Introducing a `packages/logistics-engine`
   would mean setting up monorepo tooling from scratch purely to extract code that has exactly one
   consumer (`apps/api`) today. **Recommendation**: keep "the engine" as a conceptual boundary —
   well-organized shared modules/services inside `apps/api` (`services/notifications/`,
   `services/stateMachine/`, `services/auditLog.ts`, etc.) — and only promote it to a real package
   if/when a second backend process actually needs to import it (e.g. a future driver-routing
   worker). This is the same reasoning the Fulfilment ADR used to reject a second database: no
   scale/team-size justification yet.
2. **`TransportRoute`/`TransportRun`/`TransportManifest` are scheduled hub-to-hub freight-run
   models, not dynamic collection routing.** They represent one vehicle on one fixed route with a
   scheduled departure/arrival between two known hubs, carrying a manifest of parcels assembled in
   advance. Collect UK's "optimised route" is the opposite shape: a driver visiting N different
   customer addresses in a dynamically-computed order, discovered from that day's bookings, with no
   fixed origin/destination pair. Trying to force this into `TransportRun` would mean either (a)
   modeling every customer address as a one-parcel micro-hub (absurd), or (b) bolting
   address-sequence fields onto a model whose entire design assumes two fixed endpoints. Model
   `CollectionRoute`/`CollectionStop` as new tables. They can still share the *state-machine
   pattern* and the *manifest-style "what's assigned to this route" list* conceptually — just not
   the rows.
3. **Route optimisation is a genuinely new capability, not a refactor.** Nothing in the repo does
   multi-stop route optimization today (`TransportRun` has one fixed route). This needs either a
   maps/routing API integration (Google Routes API, Mapbox Optimization API) or an accepted "good
   enough" heuristic for pilot scale (nearest-neighbour / manual dispatcher reordering) before
   reaching for a real optimizer. Recommend treating this as its own scoped ticket/epic with an
   explicit build-vs-buy decision, not an assumed side effect of the domain model work.
4. **Multi-tenancy: RLS won't be the enforcement mechanism here either, for the same reason it
   isn't for Fulfilment** (Prisma connects with a role that bypasses RLS; the app never routes
   through PostgREST with an end-user JWT — see the original repo audit). The steering document
   asks to "review Supabase RLS to support this," and the honest answer is the same one the
   Fulfilment ADR already gave: RLS can be added as defense-in-depth on the most sensitive new
   tables, but tenant isolation has to be enforced in Express middleware
   (`requireCompanyRole`/`companyId` checks before every Prisma call), consistent with how hub
   scoping works today. Worth saying explicitly now so nobody assumes RLS alone will isolate
   tenants.
5. **Marketplace-pause precedent should repeat, not reverse.** The steering document says "move
   marketplace work into a future roadmap" — this already happened (`marketplace-paused` Jira
   label, `01-marketplace-pause-report.md`, git tag). Nothing further to do there except keep
   Fulfilment's current in-flight tickets (SCRUM-147+, next up per the existing sprint) moving or
   explicitly re-sequence them behind Collect UK — that's a sequencing decision for you, not
   something to infer from the document.

## Recommendation

Extend, don't rewrite — same conclusion as the original Fulfilment ADR, for the same reasons:
- Same repo, same `apps/api`, same Postgres database, new tables and route modules
  (`routes/collect-uk/companies.ts`, `bookings.ts`, `drivers.ts`, `routes.ts`, ...).
- Same Railway project, same CI/CD conventions.
- New: a company-scoped RBAC dimension, a UK payment provider (Stripe), a UK-suitable SMS/WhatsApp
  provider behind the (currently unbuilt) notification abstraction, and a route-optimisation
  capability — each a real, scoped piece of new work, not "reuse with minor tweaks."
- `apps/web` (Next.js) is the natural home for the Company Portal, Dispatch Portal, and Warehouse
  Portal (same reasoning as Fulfilment's hub-ops screens: desktop-first, data-dense, role-gated —
  not a fit for the paused consumer Expo app). The Driver mobile app is a new, genuinely
  mobile-first surface — worth a separate decision on whether it's a new Expo app, a PWA, or a
  screen set inside `apps/mobile` re-purposed later, rather than assumed here.

## Explicitly not done in this pass (pending your confirmation)

- No new Jira initiative, epics, or tickets created.
- No schema changes (no `Company`/`Driver`/`CollectionBooking` tables added).
- No existing tickets moved, relabeled, or resequenced.
- No code written against this plan yet.
