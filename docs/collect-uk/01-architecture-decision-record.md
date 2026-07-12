# ADR: Faira Collect UK Architecture

Status: Accepted
Date: 2026-07-12
Supersedes: none (new product line, sibling to Faira Fulfilment and paused Faira Market)

## Context

Per the FAIRA PROJECT STEERING DOCUMENT v2.0, Faira is expanding into a multi-product logistics
platform. Faira Collect UK — a shared UK parcel-collection network serving multiple African
shipping companies — is the first product to build under this expansion. The repository audit
(`00-repository-audit-and-reuse-assessment.md`) found the existing stack extends cleanly, with a
few real gaps: no tenant dimension in RBAC, Zimbabwe/Africa-specific payment and SMS providers,
and no dynamic multi-stop routing capability. This ADR fixes the decisions needed to start
building Collect UK's domain model instead of re-litigating them ticket by ticket, the same role
the Fulfilment ADR played for that pivot.

## Decisions

### 1. Same repository, same database, same `apps/api` — third product line, not a new service

Collect UK models are added to the existing Prisma schema and Express app, prefixed `CollectUk`
(tables `collect_uk_*`), the same way Fulfilment was added alongside Marketplace. No new database,
no new backend service.

**Naming convention note**: unlike Fulfilment (mostly bare model names, e.g. `Shipment`, `Hub`),
every new Collect UK model is prefixed `CollectUk`. With three product lines now sharing one schema
file, an unprefixed `Company` or `Driver` model name would be ambiguous at a glance in migration
diffs and IDE autocomplete. Existing Fulfilment/Marketplace models are untouched — this convention
applies to new models going forward, it is not a retroactive rename.

**Rejected alternative**: a separate `packages/logistics-engine` shared package. Rejected because
this repo has no monorepo workspace tooling today (no root `package.json`, no
`turbo.json`/`pnpm-workspace.yaml` — each of `apps/api`/`apps/web`/`apps/mobile` is independently
managed), and there is exactly one consumer (`apps/api`) for any "engine" code right now. Building
workspace tooling purely to extract code with one consumer is process for its own sake. "The
engine" stays a conceptual boundary — shared services inside `apps/api`
(`services/notifications/`, `services/*StateMachine.ts`, `services/fulfilmentAuditLog.ts` reused
as-is) — revisit only if a second backend process needs to import this code.

### 2. Company-tenant RBAC is a new, parallel table — not an extension of `UserRole`

`CollectUkCompanyRole { userId, companyId, role }` is a new table, structurally similar to but
independent from Fulfilment's `UserRole { userId, hubId, role }`. A user can hold Fulfilment hub
roles and Collect UK company roles simultaneously (e.g. a support engineer), and the two scoping
dimensions are enforced by separate middleware (`requireCompanyRole` planned, mirroring
`requireFulfilmentRole`), never conflated.

**Rejected alternative**: add a nullable `companyId` column to the existing `UserRole` table
alongside its existing nullable `hubId`. Rejected for the same reason the Fulfilment ADR gave for
keeping Marketplace and Fulfilment auth separate: overloading one table for two different scoping
dimensions increases the chance that a permission check reads the wrong column and leaks one
tenant's data to another, or one hub's staff into a company's booking data. The tables are cheap;
the bug class isn't worth risking.

### 3. `CollectionBooking`/`CollectionRoute`/`CollectionStop` are new models — not a reuse of `Shipment`/`TransportRun`/`TransportManifest`

Fulfilment's transport domain models one vehicle on one **fixed, scheduled route between two known
Faira-owned hubs**, carrying a manifest assembled in advance. Collect UK's domain is the opposite
shape: a driver visiting **N dynamically-determined customer addresses** in a given shift, with no
fixed origin/destination pair, discovered fresh from that day's bookings. These are genuinely
different problems wearing similar words ("route", "manifest"). Modeling Collect UK's routing by
overloading `TransportRun` would mean treating every customer address as a one-parcel hub (absurd)
or bolting an address-sequence concept onto a model whose entire design assumes two fixed
endpoints.

**Decision**: new models (`CollectUkCollectionBooking`, `CollectUkCollectionRoute`,
`CollectUkCollectionStop`), sharing the *pattern* — atomic `updateMany`-guarded status transitions,
a `canTransition`/`displayStatus`-style state machine once implementation reaches that ticket — but
not the rows or the tables.

### 4. `CollectUkCompanyWarehouse` is new — not a reuse of `Hub`

Fulfilment's `Hub` is a location Faira owns and operates end to end (staff, opening hours, RBAC
scoping all assume Faira operational control). A Collect UK company's warehouse belongs to *that
company* — Faira delivers to it and hands over, but never operates it. Modeling it as a `Hub` would
either require adding tenant-ownership semantics to a table whose every existing user (Fulfilment
hub staff) assumes Faira ownership, or silently blur that line. A separate, tenant-owned model
avoids that ambiguity from day one.

### 5. Payments: new provider (Stripe), behind the same abstraction shape the Fulfilment ADR proposed

Zimbabwe Fulfilment's `FulfilmentPaymentMethod` (EcoCash/OneMoney/ZimSwitch) and Paynow integration
cannot process UK company subscription billing. **Decision**: Stripe as the Collect UK payment/
subscription provider (mature UK support, first-class Subscriptions API matching "logistics
companies subscribe to Faira Collect," and already named in the steering document's own UX
references). `CollectUkSubscription.providerReference` holds the Stripe subscription id; the actual
`PaymentProvider`-interface work (`initiate`/`pollStatus`/`handleWebhook`, per the Fulfilment ADR's
already-proposed shape) is scoped to the Payments epic (SCRUM-168), not built in this schema-only
pass.

### 6. Notifications: implement the existing unused `NotificationTemplate`/`Notification` schema, new SMS/WhatsApp providers

The schema already has `NotificationTemplate`/`Notification`/`NotificationChannel` models with zero
code referencing them — designed ahead, never implemented, exactly like `CollectionEvent` sat
unused for a session before Fulfilment implemented it. **Decision**: this is the abstraction layer
Collect UK's Notifications epic (SCRUM-167) implements a `NotificationService.notify(...)` against,
with Twilio (SMS) and Meta Cloud API (WhatsApp) as the UK-suitable providers — Africa's Talking
remains Fulfilment-only, since its core market is Africa, not the UK. Email reuses whatever
provider Fulfilment eventually picks (currently unimplemented there too, per the memory note on the
email-provider gap) rather than choosing a second one.

### 7. Route optimisation: explicit build-vs-buy decision deferred to its own ticket, not assumed

Nothing in the repo does multi-stop dynamic routing today. Recommend evaluating Google Routes
API / Mapbox Optimization API against a pilot-scale heuristic (e.g. nearest-neighbour ordering a
dispatcher can manually override) as the **first ticket** in the Route Optimisation epic
(SCRUM-164), with a cost/complexity comparison, before any routing code is written. Not decided
here — flagging it as a decision this ADR deliberately does not make, so it isn't skipped by
default in favour of "just build something."

### 8. Multi-tenancy enforcement stays in the application layer; RLS is defense-in-depth only

Same finding and same decision as the Fulfilment ADR, for the identical underlying reason: Prisma
connects to Postgres with a role that bypasses Row Level Security, and the app never routes
queries through Supabase's PostgREST layer with an end-user JWT. **Decision**: tenant isolation is
enforced by a planned `requireCompanyRole` Express middleware checking `companyId` before any
Prisma call touches `CollectUk*` tables, mirroring the existing `requireFulfilmentRole`/
`isAssignedToHub` pattern. RLS policies may be added on the most sensitive Collect UK tables
(bookings, payment references) as an additional safety net, but the API-layer check is the source
of truth — stated explicitly so it isn't later assumed that RLS alone isolates one company's data
from another's.

## Major trade-offs accepted

1. A fourth new model family (`CollectUk*`) rather than any reuse of Fulfilment's transport/hub
   models — more total tables than a maximal-reuse approach, accepted because the domains are
   genuinely different (see decisions 2–4) and a forced shared model would be more fragile than
   two clean ones.
2. Route optimisation is an open build-vs-buy question, not resolved here — accepted risk: the
   Collection Scheduling and Driver Mobile epics can proceed with a manual/heuristic dispatcher
   ordering in the meantime; a real optimizer isn't a hard blocker for pilot scale.
3. No workspace/monorepo tooling introduced for a "logistics engine" package — accepted risk: if a
   second backend process (e.g. a future routing worker) is ever needed, this decision will need
   revisiting; not pre-built speculatively.
