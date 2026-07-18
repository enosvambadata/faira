# Spec: vehicle fitment ("My Garage") for the auto-parts vertical

**Status:** Proposed — building v1 backend.
**Date:** 2026-07-18
**Context:** Marketplace pivot from a general marketplace to a **car parts & accessories** vertical (new parts from China + used engines/gearboxes and everything cars). This is the one build that makes the vertical sharp.

## The one-line goal
A buyer enters their car once (**make → model → year**) and the entire marketplace filters to **only the parts that fit it**. Nobody on WhatsApp or Facebook Marketplace can answer "will this fit my 2005 Toyota Vitz?" as a filter. We can.

## Why the existing attribute table can't do this
Listings already carry flexible `ListingAttribute` (key/value) rows powering `brand` and `size`, filtered via `attributes: { some: { key, value } }` (`apps/api/src/routes/listings.ts`). It is the wrong tool for fitment for two structural reasons:

1. **`@@unique([listingId, key])`** (`schema.prisma`) allows one `make` value per listing. A single part (e.g. a brake pad) fits *many* vehicles — one part → many vehicles. Key/value can't represent that.
2. **Fitment is a year *range* test**, not equality: "fits Corolla 2002–2007" needs `yearFrom ≤ target ≤ yearTo`. Free-text can't express it.

Also decisive: a fitment *filter* only works if make/model are **canonical**. Free-text `brand` was fine for fuzzy search, but "Toyota" vs "toyota" vs "Toyata" would silently drop matches here and kill the feature. Make/model must come from a controlled, seeded list.

So fitment is a small dedicated subsystem, not a reuse of attributes.

## Data model
Three new pieces + one flag. Follows repo conventions (`@db.Uuid`, `@map` snake_case columns, `@@map` tables).

### 1. Curated vehicle reference (seeded)
Zimbabwe's fleet is overwhelmingly ex-Japan, so ~20 makes + their common models covers the vast majority. Curated, not free-text — this is what guarantees the filter works.

```prisma
model VehicleMake {
  id     String         @id @default(uuid()) @db.Uuid
  name   String         @unique          // "Toyota"
  models VehicleModel[]
  @@map("vehicle_makes")
}

model VehicleModel {
  id       String @id @default(uuid()) @db.Uuid
  makeId   String @map("make_id") @db.Uuid
  name     String                        // "Vitz"
  make     VehicleMake      @relation(fields: [makeId], references: [id], onDelete: Cascade)
  fitments ListingFitment[]
  garaged  GarageVehicle[]
  @@unique([makeId, name])
  @@map("vehicle_models")
}
```

### 2. Fitment join (one listing → many vehicles, each a year range)
```prisma
model ListingFitment {
  id        String  @id @default(uuid()) @db.Uuid
  listingId String  @map("listing_id") @db.Uuid
  modelId   String  @map("model_id") @db.Uuid
  yearFrom  Int?    @map("year_from")   // null = "any year"
  yearTo    Int?    @map("year_to")
  note      String?                     // free-text: "1.3L 2NZ engine only"
  listing   Listing      @relation(fields: [listingId], references: [id], onDelete: Cascade)
  model     VehicleModel @relation(fields: [modelId], references: [id], onDelete: Restrict)
  @@index([listingId])
  @@index([modelId])
  @@map("listing_fitments")
}
```

### 3. Universal-fit flag on `Listing`
```prisma
universalFit Boolean @default(false) @map("universal_fit")
```
For genuinely fit-anything items (tools, generic oil, a phone mount) so they still surface under a garage filter. A listing is valid if it is `universalFit` **or** has ≥1 fitment row (enforced in the sell flow, not the DB).

### 4. "My Garage" on the buyer
```prisma
model GarageVehicle {
  id      String @id @default(uuid()) @db.Uuid
  userId  String @map("user_id") @db.Uuid
  modelId String @map("model_id") @db.Uuid
  year    Int?
  user    User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  model   VehicleModel @relation(fields: [modelId], references: [id], onDelete: Restrict)
  createdAt DateTime @default(now()) @map("created_at")
  @@index([userId])
  @@map("garage_vehicles")
}
```

## Matching logic
For a target `{ modelId, year }`, a listing matches if it is universal, or has a fitment row for that model whose (open-ended) year range contains the target. Drops into the existing `where` builder in `listings.ts`:

```ts
OR: [
  { universalFit: true },
  { fitments: { some: {
      modelId,
      AND: [
        { OR: [{ yearFrom: null }, { yearFrom: { lte: year } }] },
        { OR: [{ yearTo:   null }, { yearTo:   { gte: year } }] },
      ],
  } } },
]
```
Composes cleanly with all current filters (category, price, city, condition). If `year` is omitted, drop the year clauses (model-only match).

## API surface
| Endpoint | Purpose |
|---|---|
| `GET /vehicles/makes` | List seeded makes (id, name). Cascading dropdown step 1. |
| `GET /vehicles/makes/:id/models` | Models for a make. Dropdown step 2. |
| `GET /listings?modelId=&year=` | Add fitment filter to the existing browse query. |
| `POST /listings` (extend) | Accept `fitments: [{ modelId, yearFrom?, yearTo? }]` **or** `universalFit: true`; write rows in the create txn. Reject a non-universal parts listing with no fitment. |
| `GET /me/garage` | Buyer's saved vehicles. |
| `POST /me/garage` | Add `{ modelId, year? }`. |
| `DELETE /me/garage/:id` | Remove. |

Garage endpoints mirror the wishlist route shape (thin, `requireAuth`).

## Mobile UI (Phase 2 — after backend lands; app is currently paused)
- **Sell:** fitment picker on `SellScreen` — Make → Model → year range, "add another vehicle", plus a "Fits all vehicles" toggle for universal parts.
- **Buy:** garage setup + a persistent **"Fits my [car] ✓"** filter chip on Home. This is the moment the feature clicks.

## Phasing
**v1 (this build):** vehicle seed, fitment on listings, make/model/year filter, garage, universal-fit flag, `note` free-text for engine/variant. Backend + tests first (durable); mobile UI when the app un-pauses.

**Later:** formal engine/variant codes (start as `note`); VIN decode (real integration, skip now); seller-side fitment auto-suggested from the title; admin CRUD for the vehicle catalogue (v1 maintains it via the seed).

## Open decision (recommendation baked in)
**Curated vehicle list (recommended) vs seller free-type.** Curated wins: the whole feature depends on canonical make/model, Zim's fleet is small enough to seed (~20 makes / ~150 models — see `apps/api/src/data/vehicleCatalogue.ts`), and it gives clean cascading dropdowns. Cost: we maintain the list (cheap, seed-file edit). Free-text degrades the filter the moment two sellers spell a make differently — which defeats the purpose. A nullable `note` covers the long tail without polluting the canonical fields.
