# Shipment State Machine Specification

Mirrors the pattern in `apps/api/src/lib/orderStateMachine.ts` (marketplace): a single `canTransition(from, to)` source of truth, atomic `updateMany({ where: { id, status: currentStatus } })` writes so concurrent requests can't double-process a transition, and every transition creates an immutable `TrackingEvent` row.

## Statuses

| Status | Meaning |
|---|---|
| `DRAFT` | Seller started a shipment, hasn't confirmed it yet |
| `AWAITING_PAYMENT` | Confirmed, delivery fee unpaid (if seller pays) |
| `AWAITING_DROPOFF` | Payment resolved (or buyer-pays selected); seller has a drop-off deadline |
| `DROPOFF_OVERDUE` | Deadline passed, parcel not yet dropped off |
| `RECEIVED_AT_ORIGIN` | Hub agent accepted the drop-off |
| `REJECTED_AT_ORIGIN` | Hub agent rejected it (reason recorded) |
| `INSPECTED` | Weight/dimensions/condition/photos recorded |
| `SEALED` | Tamper-evident seal applied, seal number recorded |
| `AWAITING_DISPATCH` | Sealed, waiting for a transport run assignment |
| `ASSIGNED_TO_RUN` | Added to a `TransportManifest` |
| `DISPATCHED` | Departure-scanned out of the origin hub |
| `IN_TRANSIT` | Between hubs |
| `DELAYED` | Transport run reported a delay |
| `RECEIVED_AT_DESTINATION` | Arrival-scanned into the destination hub |
| `READY_FOR_COLLECTION` | Buyer notified, collection code issued |
| `COLLECTION_OVERDUE` | Collection window passed, buyer hasn't collected |
| `COLLECTED` | Buyer collection confirmed |
| `RETURN_REQUESTED` | Return initiated (seller or system-triggered after overdue collection) |
| `RETURN_APPROVED` | Admin/support approved the return |
| `RETURNING_TO_SELLER` | Return shipment in transit back to origin |
| `RETURNED_TO_SELLER` | Return collected/confirmed at origin |
| `CANCELLED` | Cancelled before dropoff (seller-eligible cancellation window) |
| `LOST` | Reconciliation found it missing |
| `DAMAGED` | Reported damaged (evidence attached) |
| `DISPUTED` | A dispute is open against this shipment |
| `CLOSED` | Terminal — fully resolved (collected & settled, or returned & closed, or cancelled) |

## Allowed transitions

```
DRAFT                 -> AWAITING_PAYMENT, AWAITING_DROPOFF, CANCELLED
AWAITING_PAYMENT       -> AWAITING_DROPOFF, CANCELLED
AWAITING_DROPOFF       -> RECEIVED_AT_ORIGIN, DROPOFF_OVERDUE, CANCELLED
DROPOFF_OVERDUE        -> RECEIVED_AT_ORIGIN, CANCELLED
RECEIVED_AT_ORIGIN     -> INSPECTED, REJECTED_AT_ORIGIN
REJECTED_AT_ORIGIN     -> CLOSED                                    (terminal; seller re-creates a new shipment)
INSPECTED              -> SEALED, DAMAGED
SEALED                 -> AWAITING_DISPATCH
AWAITING_DISPATCH      -> ASSIGNED_TO_RUN
ASSIGNED_TO_RUN        -> DISPATCHED, AWAITING_DISPATCH             (manifest can be pulled before departure scan)
DISPATCHED             -> IN_TRANSIT
IN_TRANSIT             -> RECEIVED_AT_DESTINATION, DELAYED, LOST, DAMAGED
DELAYED                -> IN_TRANSIT, RECEIVED_AT_DESTINATION, LOST
RECEIVED_AT_DESTINATION-> READY_FOR_COLLECTION
READY_FOR_COLLECTION   -> COLLECTED, COLLECTION_OVERDUE, DISPUTED
COLLECTION_OVERDUE     -> COLLECTED, RETURN_REQUESTED
RETURN_REQUESTED       -> RETURN_APPROVED, CLOSED                  (rejected return request just closes)
RETURN_APPROVED        -> RETURNING_TO_SELLER
RETURNING_TO_SELLER    -> RETURNED_TO_SELLER, LOST
RETURNED_TO_SELLER     -> CLOSED
COLLECTED              -> CLOSED, DISPUTED
DISPUTED               -> CLOSED, RETURN_REQUESTED                 (dispute resolves into a normal close or a return)
CANCELLED              -> (terminal)
LOST                   -> DISPUTED, CLOSED                         (closed once claim/refund resolved)
DAMAGED                -> DISPUTED, RETURN_REQUESTED, CLOSED
CLOSED                 -> (terminal)
```

## Transition permissions (who may trigger which transition)

| Transition target | Allowed actor |
|---|---|
| `AWAITING_PAYMENT`, `AWAITING_DROPOFF`, `CANCELLED` (pre-dropoff) | Seller (own shipment only) |
| `RECEIVED_AT_ORIGIN`, `REJECTED_AT_ORIGIN`, `INSPECTED`, `SEALED`, `DAMAGED` (at origin) | Hub Agent/Supervisor assigned to the **origin** hub |
| `AWAITING_DISPATCH`, `ASSIGNED_TO_RUN` | Hub Supervisor (origin) or Transport Operator |
| `DISPATCHED` | Hub Agent/Supervisor at origin, scanning manifest out |
| `IN_TRANSIT`, `DELAYED` | Transport Operator on the assigned run |
| `RECEIVED_AT_DESTINATION` | Hub Agent/Supervisor at **destination**, scanning manifest in |
| `READY_FOR_COLLECTION` | System (automatic once received + notification sent) |
| `COLLECTED` | Hub Agent at destination, after collection-code verification |
| `COLLECTION_OVERDUE` | System (scheduled job, window expiry) |
| `RETURN_REQUESTED` | Seller, Buyer (via support), or System (post-overdue) |
| `RETURN_APPROVED` | Customer Support or Operations Administrator |
| `RETURNING_TO_SELLER`, `RETURNED_TO_SELLER` | Hub Agent/Supervisor at origin |
| `LOST`, `DAMAGED` (mid-transit) | Transport Operator, Hub Supervisor, or Operations Administrator (reconciliation) |
| `DISPUTED` | Buyer (via support), Seller, or Customer Support |
| `CLOSED` | System (automatic on settlement) or Operations Administrator |
| Any transition, override | Super Administrator only, and only with a recorded reason (never a silent bypass) |

A transition additionally requires the actor's `HubStaffAssignment`/`TransportRun` assignment to match the hub/run in question — a Hub Agent assigned only to Bulawayo cannot accept a drop-off at Harare, and a Transport Operator can only scan a manifest for a run they're assigned to.

## Side effects per transition (non-exhaustive, illustrative)

- `RECEIVED_AT_ORIGIN` → `INSPECTED`: requires weight, dimensions, condition, ≥1 photo, and a `ParcelSeal` record before allowing `SEALED`.
- `-> DISPATCHED`: requires the shipment to be on a `TransportManifest` in `FINALIZED` state; triggers "Parcel dispatched" notification to buyer (SMS/WhatsApp) and seller (in-app).
- `-> RECEIVED_AT_DESTINATION`: triggers manifest reconciliation (does the scanned parcel match an expected manifest line?); mismatches are flagged, not silently accepted.
- `-> READY_FOR_COLLECTION`: generates a `CollectionCode`, sends buyer notification with tracking link + code.
- `-> COLLECTED`: requires a verified `CollectionCode` match (or supervisor override with recorded reason for high-value parcels needing ID check), creates `CollectionEvent` + proof-of-collection evidence, triggers `SellerSettlement` creation (pending, not immediately paid).
- `-> DISPUTED`: freezes any pending settlement for this shipment until resolved.
- Every transition, no exceptions: writes one `TrackingEvent` (shipment id, previous status, new status, timestamp, location/hub, actor user id, staff/role, notes, evidence references) and one `AuditLog` entry.

## Enforcement rule

The frontend (Next.js web app) never sets a shipment's status directly — every status change goes through a dedicated backend endpoint for that specific transition (e.g. `POST /shipments/:id/inspect`, `POST /manifests/:id/dispatch`), each of which: (1) loads current status, (2) checks `canTransition(current, target)`, (3) checks actor role + hub/run assignment, (4) applies the update via `updateMany({ where: { id, status: current } })` so a concurrent conflicting transition fails cleanly (`count === 0` → 409), (5) writes the `TrackingEvent` + `AuditLog` in the same Prisma transaction, (6) fires notifications/settlement side effects after commit. This is the same shape as every status-changing route in the existing `orders.ts` — extended, not reinvented.

## Testing requirements (per pivot brief's "unit tests designed")

- Table-driven test asserting every `(from, to)` pair against the allowed-transition table above (both directions where only one is valid — confirm the reverse is rejected).
- Permission tests: each transition rejected for every role *not* listed as allowed, per hub/run assignment mismatch.
- Concurrency test: two simultaneous requests attempting the same transition — exactly one succeeds, the other gets a 409, no double `TrackingEvent`.
- Side-effect tests: `-> READY_FOR_COLLECTION` always creates exactly one active `CollectionCode`; `-> COLLECTED` always creates exactly one `SellerSettlement` in `PENDING`.
