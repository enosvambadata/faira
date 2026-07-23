import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SYSTEM_CONFIG_KEYS } from '../src/lib/systemConfigKeys';
import { VEHICLE_CATALOGUE, VEHICLE_MODEL_COUNT } from '../src/data/vehicleCatalogue';
import { AUTO_PARTS_TAXONOMY, CategoryNode } from '../src/data/categoryTaxonomy';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });


// Mirrors apps/mobile/src/data/cities.ts — kept as a literal list here
// rather than importing across the app boundary.
const ZIMBABWE_CITIES = [
  'Harare',
  'Bulawayo',
  'Chitungwiza',
  'Mutare',
  'Gweru',
  'Kwekwe',
  'Kadoma',
  'Masvingo',
  'Chinhoyi',
  'Marondera',
  'Norton',
  'Ruwa',
  'Victoria Falls',
  'Bindura',
  'Beitbridge',
];

// Placeholder starting rates (SCRUM-64) — the two largest metros are
// cheapest to reach, everything else in range is a flat mid tier, and the
// three most remote/border towns cost more. Admins adjust these via the
// admin API; there's no dashboard, per this app's established pattern.
const METRO_CITIES = new Set(['Harare', 'Bulawayo']);
const REMOTE_CITIES = new Set(['Victoria Falls', 'Bindura', 'Beitbridge']);
const BASE_FEE_BY_ZONE = { metro: 2, standard: 3, remote: 5 } as const;
const WEIGHT_TIER_MULTIPLIER = { LIGHT: 1, MEDIUM: 1.5, HEAVY: 2.5 } as const;

function baseFeeForCity(city: string): number {
  if (METRO_CITIES.has(city)) return BASE_FEE_BY_ZONE.metro;
  if (REMOTE_CITIES.has(city)) return BASE_FEE_BY_ZONE.remote;
  return BASE_FEE_BY_ZONE.standard;
}

async function seedDeliveryFeeRates(): Promise<number> {
  let count = 0;
  for (const city of ZIMBABWE_CITIES) {
    for (const weightTier of Object.keys(WEIGHT_TIER_MULTIPLIER) as (keyof typeof WEIGHT_TIER_MULTIPLIER)[]) {
      const fee = Math.round(baseFeeForCity(city) * WEIGHT_TIER_MULTIPLIER[weightTier] * 100) / 100;
      await prisma.deliveryFeeRate.upsert({
        where: { city_weightTier: { city, weightTier } },
        update: { fee },
        create: { city, weightTier, fee },
      });
      count += 1;
    }
  }
  return count;
}

async function upsertNode(node: CategoryNode, parentId: string | null): Promise<number> {
  const category = await prisma.category.upsert({
    where: { slug: node.slug },
    update: { name: node.name, icon: node.icon, parentId: parentId ?? undefined },
    create: { slug: node.slug, name: node.name, icon: node.icon, parentId: parentId ?? undefined },
  });

  let count = 1;
  for (const child of node.children ?? []) {
    count += await upsertNode(child, category.id);
  }
  return count;
}

// Pilot pricing (SCRUM-128) — placeholder figures for the Harare<->Bulawayo
// pilot, tunable later via the admin pricing UI (SCRUM-152) rather than a
// migration. Deliberately not hardcoded into any route/service code —
// this seed is the only place these numbers live.
const FULFILMENT_PARCEL_SIZE_FEES: Record<'SMALL' | 'MEDIUM' | 'LARGE' | 'EXTRA_LARGE', number> = {
  SMALL: 8,
  MEDIUM: 12,
  LARGE: 18,
  EXTRA_LARGE: 25,
};

async function seedFulfilmentPilot(): Promise<{ hubs: number; routes: number; pricingRules: number }> {
  const harare = await prisma.hub.upsert({
    where: { name: 'Faira Harare Hub' },
    update: {},
    create: {
      name: 'Faira Harare Hub',
      code: 'HRE',
      city: 'Harare',
      address: 'Cnr Julius Nyerere Way & Robert Mugabe Rd, Harare CBD',
      openingHours: 'Mon-Fri 8am-5pm, Sat 8am-1pm',
    },
  });
  const bulawayo = await prisma.hub.upsert({
    where: { name: 'Faira Bulawayo Hub' },
    update: {},
    create: {
      name: 'Faira Bulawayo Hub',
      code: 'BUL',
      city: 'Bulawayo',
      address: 'Cnr Fife St & 9th Ave, Bulawayo CBD',
      openingHours: 'Mon-Fri 8am-5pm, Sat 8am-1pm',
    },
  });

  const routePairs: [string, string][] = [
    [harare.id, bulawayo.id],
    [bulawayo.id, harare.id],
  ];

  let pricingRuleCount = 0;
  let routeCount = 0;
  for (const [originHubId, destinationHubId] of routePairs) {
    const route = await prisma.transportRoute.upsert({
      where: { originHubId_destinationHubId: { originHubId, destinationHubId } },
      update: {},
      create: { originHubId, destinationHubId },
    });
    routeCount += 1;

    for (const sizeTier of Object.keys(FULFILMENT_PARCEL_SIZE_FEES) as (keyof typeof FULFILMENT_PARCEL_SIZE_FEES)[]) {
      await prisma.pricingRule.upsert({
        where: { routeId_sizeTier: { routeId: route.id, sizeTier } },
        update: { fee: FULFILMENT_PARCEL_SIZE_FEES[sizeTier] },
        create: { routeId: route.id, sizeTier, fee: FULFILMENT_PARCEL_SIZE_FEES[sizeTier] },
      });
      pricingRuleCount += 1;
    }
  }

  return { hubs: 2, routes: routeCount, pricingRules: pricingRuleCount };
}

// Pilot defaults — an unverified seller can only declare low-value
// parcels; verification (SCRUM-131) raises the ceiling. Tunable later via
// the admin dashboard (SCRUM-152) rather than a migration.
async function seedSystemConfiguration(): Promise<number> {
  const entries: [string, string][] = [
    [SYSTEM_CONFIG_KEYS.DECLARED_VALUE_LIMIT_UNVERIFIED, '200'],
    [SYSTEM_CONFIG_KEYS.DECLARED_VALUE_LIMIT_VERIFIED, '2000'],
    [SYSTEM_CONFIG_KEYS.SHIPMENT_QUOTE_FALLBACK_FEE, '15'],
    [SYSTEM_CONFIG_KEYS.SHIPMENT_DROPOFF_DEADLINE_HOURS, '48'],
    [SYSTEM_CONFIG_KEYS.COLLECTION_CODE_EXPIRY_DAYS, '30'],
    [SYSTEM_CONFIG_KEYS.MANIFEST_RECONCILIATION_THRESHOLD_HOURS, '24'],
    [SYSTEM_CONFIG_KEYS.COLLECTION_CODE_MAX_ATTEMPTS, '5'],
    [SYSTEM_CONFIG_KEYS.COLLECTION_ID_CHECK_VALUE_THRESHOLD, '500'],
  ];

  for (const [key, value] of entries) {
    await prisma.systemConfiguration.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  return entries.length;
}

// Curated vehicle reference for the auto-parts fitment filter (see
// docs/marketplace/00-vehicle-fitment-spec.md). Upserted so re-running the
// seed is idempotent and adding models later just tops up the table.
async function seedVehicleCatalogue(): Promise<{ makes: number; models: number }> {
  for (const { make, models } of VEHICLE_CATALOGUE) {
    const makeRow = await prisma.vehicleMake.upsert({
      where: { name: make },
      update: {},
      create: { name: make },
    });
    for (const model of models) {
      await prisma.vehicleModel.upsert({
        where: { makeId_name: { makeId: makeRow.id, name: model } },
        update: {},
        create: { makeId: makeRow.id, name: model },
      });
    }
  }
  return { makes: VEHICLE_CATALOGUE.length, models: VEHICLE_MODEL_COUNT };
}

async function main() {
  let total = 0;
  for (const topLevel of AUTO_PARTS_TAXONOMY) {
    total += await upsertNode(topLevel, null);
  }
  console.log(`Seeded ${total} auto-parts categories across ${AUTO_PARTS_TAXONOMY.length} top-level branches.`);

  const vehicles = await seedVehicleCatalogue();
  console.log(`Seeded ${vehicles.makes} vehicle makes and ${vehicles.models} models.`);

  const feeRateCount = await seedDeliveryFeeRates();
  console.log(`Seeded ${feeRateCount} delivery fee rates across ${ZIMBABWE_CITIES.length} cities.`);

  const fulfilment = await seedFulfilmentPilot();
  console.log(
    `Seeded Faira Fulfilment pilot: ${fulfilment.hubs} hubs, ${fulfilment.routes} routes, ${fulfilment.pricingRules} pricing rules.`,
  );

  const configCount = await seedSystemConfiguration();
  console.log(`Seeded ${configCount} system configuration values.`);
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
