import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SYSTEM_CONFIG_KEYS } from '../src/lib/systemConfigKeys';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface CategoryNode {
  slug: string;
  name: string;
  icon: string;
  children?: CategoryNode[];
}

// Top-level slugs/names mirror apps/mobile/src/data/interests.ts so
// onboarding interests and listing categories share the same taxonomy.
// Three levels deep, covering fashion and general/imported goods alike
// (Faira isn't fashion-only — see SCRUM-37), modeled after a general
// marketplace structure (Jiji-style) rather than a fashion-resale app.
const TAXONOMY: CategoryNode[] = [
  {
    slug: 'fashion',
    name: 'Fashion & Clothing',
    icon: '👗',
    children: [
      {
        slug: 'womens-clothing',
        name: "Women's Clothing",
        icon: '👚',
        children: [
          { slug: 'dresses', name: 'Dresses', icon: '👗' },
          { slug: 'tops-blouses', name: 'Tops & Blouses', icon: '👚' },
          { slug: 'skirts', name: 'Skirts', icon: '👗' },
          { slug: 'womens-jeans-trousers', name: 'Jeans & Trousers', icon: '👖' },
        ],
      },
      {
        slug: 'mens-clothing',
        name: "Men's Clothing",
        icon: '👔',
        children: [
          { slug: 'shirts', name: 'Shirts', icon: '👔' },
          { slug: 't-shirts', name: 'T-Shirts', icon: '👕' },
          { slug: 'mens-trousers', name: 'Trousers', icon: '👖' },
          { slug: 'suits', name: 'Suits', icon: '🤵' },
        ],
      },
      {
        slug: 'shoes',
        name: 'Shoes',
        icon: '👟',
        children: [
          { slug: 'womens-shoes', name: "Women's Shoes", icon: '👠' },
          { slug: 'mens-shoes', name: "Men's Shoes", icon: '👞' },
          { slug: 'kids-shoes', name: "Kids' Shoes", icon: '👟' },
        ],
      },
      {
        slug: 'bags-accessories',
        name: 'Bags & Accessories',
        icon: '👜',
        children: [
          { slug: 'handbags', name: 'Handbags', icon: '👜' },
          { slug: 'wallets', name: 'Wallets', icon: '👛' },
          { slug: 'jewelry', name: 'Jewelry', icon: '💍' },
          { slug: 'watches', name: 'Watches', icon: '⌚' },
        ],
      },
    ],
  },
  {
    slug: 'electronics',
    name: 'Electronics',
    icon: '📱',
    children: [
      {
        slug: 'phones-tablets',
        name: 'Phones & Tablets',
        icon: '📱',
        children: [
          { slug: 'smartphones', name: 'Smartphones', icon: '📱' },
          { slug: 'tablets', name: 'Tablets', icon: '📱' },
          { slug: 'phone-accessories', name: 'Phone Accessories', icon: '🔌' },
        ],
      },
      {
        slug: 'computers',
        name: 'Computers',
        icon: '💻',
        children: [
          { slug: 'laptops', name: 'Laptops', icon: '💻' },
          { slug: 'desktops', name: 'Desktops', icon: '🖥️' },
          { slug: 'computer-accessories', name: 'Computer Accessories', icon: '⌨️' },
        ],
      },
      {
        slug: 'tv-audio',
        name: 'TV & Audio',
        icon: '📺',
        children: [
          { slug: 'televisions', name: 'Televisions', icon: '📺' },
          { slug: 'speakers', name: 'Speakers', icon: '🔊' },
          { slug: 'headphones', name: 'Headphones', icon: '🎧' },
        ],
      },
    ],
  },
  {
    slug: 'home',
    name: 'Home & Furniture',
    icon: '🛋️',
    children: [
      {
        slug: 'furniture',
        name: 'Furniture',
        icon: '🛋️',
        children: [
          { slug: 'sofas', name: 'Sofas', icon: '🛋️' },
          { slug: 'beds', name: 'Beds', icon: '🛏️' },
          { slug: 'tables-chairs', name: 'Tables & Chairs', icon: '🪑' },
        ],
      },
      {
        slug: 'kitchen-dining',
        name: 'Kitchen & Dining',
        icon: '🍽️',
        children: [
          { slug: 'cookware', name: 'Cookware', icon: '🍳' },
          { slug: 'appliances', name: 'Appliances', icon: '🔌' },
          { slug: 'dinnerware', name: 'Dinnerware', icon: '🍽️' },
        ],
      },
      {
        slug: 'home-decor',
        name: 'Home Decor',
        icon: '🖼️',
        children: [
          { slug: 'rugs-carpets', name: 'Rugs & Carpets', icon: '🟫' },
          { slug: 'curtains', name: 'Curtains', icon: '🪟' },
          { slug: 'wall-art', name: 'Wall Art', icon: '🖼️' },
        ],
      },
    ],
  },
  {
    slug: 'beauty',
    name: 'Beauty & Health',
    icon: '💄',
    children: [
      {
        slug: 'skincare',
        name: 'Skincare',
        icon: '🧴',
        children: [
          { slug: 'moisturizers', name: 'Moisturizers', icon: '🧴' },
          { slug: 'cleansers', name: 'Cleansers', icon: '🧼' },
          { slug: 'sunscreen', name: 'Sunscreen', icon: '🧴' },
        ],
      },
      {
        slug: 'makeup',
        name: 'Makeup',
        icon: '💄',
        children: [
          { slug: 'face-makeup', name: 'Face', icon: '💄' },
          { slug: 'eyes-makeup', name: 'Eyes', icon: '💄' },
          { slug: 'lips-makeup', name: 'Lips', icon: '💄' },
        ],
      },
      {
        slug: 'haircare',
        name: 'Haircare',
        icon: '💇',
        children: [
          { slug: 'shampoo-conditioner', name: 'Shampoo & Conditioner', icon: '🧴' },
          { slug: 'styling-tools', name: 'Styling Tools', icon: '💇' },
          { slug: 'extensions-wigs', name: 'Extensions & Wigs', icon: '💇' },
        ],
      },
    ],
  },
  {
    slug: 'kids',
    name: 'Kids & Baby',
    icon: '🧸',
    children: [
      {
        slug: 'baby-gear',
        name: 'Baby Gear',
        icon: '👶',
        children: [
          { slug: 'strollers', name: 'Strollers', icon: '👶' },
          { slug: 'car-seats', name: 'Car Seats', icon: '👶' },
          { slug: 'carriers', name: 'Carriers', icon: '👶' },
        ],
      },
      {
        slug: 'kids-clothing',
        name: 'Kids Clothing',
        icon: '👕',
        children: [
          { slug: 'boys-clothing', name: 'Boys', icon: '👕' },
          { slug: 'girls-clothing', name: 'Girls', icon: '👗' },
          { slug: 'infant-clothing', name: 'Infant', icon: '👶' },
        ],
      },
      {
        slug: 'toys-games',
        name: 'Toys & Games',
        icon: '🧸',
        children: [
          { slug: 'educational-toys', name: 'Educational Toys', icon: '🧩' },
          { slug: 'outdoor-toys', name: 'Outdoor Toys', icon: '🪁' },
          { slug: 'board-games', name: 'Board Games', icon: '🎲' },
        ],
      },
    ],
  },
  {
    slug: 'sports',
    name: 'Sports & Outdoors',
    icon: '⚽',
    children: [
      {
        slug: 'fitness-equipment',
        name: 'Fitness Equipment',
        icon: '🏋️',
        children: [
          { slug: 'weights-dumbbells', name: 'Weights & Dumbbells', icon: '🏋️' },
          { slug: 'yoga-pilates', name: 'Yoga & Pilates', icon: '🧘' },
          { slug: 'cardio-machines', name: 'Cardio Machines', icon: '🚴' },
        ],
      },
      {
        slug: 'outdoor-camping',
        name: 'Outdoor & Camping',
        icon: '🏕️',
        children: [
          { slug: 'tents', name: 'Tents', icon: '⛺' },
          { slug: 'backpacks', name: 'Backpacks', icon: '🎒' },
          { slug: 'camping-gear', name: 'Camping Gear', icon: '🏕️' },
        ],
      },
      {
        slug: 'team-sports',
        name: 'Team Sports',
        icon: '⚽',
        children: [
          { slug: 'soccer', name: 'Soccer', icon: '⚽' },
          { slug: 'basketball', name: 'Basketball', icon: '🏀' },
          { slug: 'cricket', name: 'Cricket', icon: '🏏' },
        ],
      },
    ],
  },
  {
    slug: 'vehicles',
    name: 'Vehicles & Parts',
    icon: '🚗',
    children: [
      {
        slug: 'cars',
        name: 'Cars',
        icon: '🚗',
        children: [
          { slug: 'sedans', name: 'Sedans', icon: '🚗' },
          { slug: 'suvs', name: 'SUVs', icon: '🚙' },
          { slug: 'hatchbacks', name: 'Hatchbacks', icon: '🚗' },
        ],
      },
      {
        slug: 'motorbikes',
        name: 'Motorbikes',
        icon: '🏍️',
        children: [
          { slug: 'scooters', name: 'Scooters', icon: '🛵' },
          { slug: 'motorcycles', name: 'Motorcycles', icon: '🏍️' },
          { slug: 'motorbike-parts', name: 'Motorbike Parts', icon: '🔧' },
        ],
      },
      {
        slug: 'vehicle-parts',
        name: 'Vehicle Parts & Accessories',
        icon: '🔧',
        children: [
          { slug: 'tyres', name: 'Tyres', icon: '🛞' },
          { slug: 'batteries', name: 'Batteries', icon: '🔋' },
          { slug: 'car-electronics', name: 'Car Electronics', icon: '📻' },
        ],
      },
    ],
  },
  {
    slug: 'books',
    name: 'Books & Media',
    icon: '📚',
    children: [
      {
        slug: 'books-sub',
        name: 'Books',
        icon: '📖',
        children: [
          { slug: 'fiction', name: 'Fiction', icon: '📖' },
          { slug: 'non-fiction', name: 'Non-Fiction', icon: '📘' },
          { slug: 'textbooks', name: 'Textbooks', icon: '📗' },
        ],
      },
      {
        slug: 'movies-music',
        name: 'Movies & Music',
        icon: '🎬',
        children: [
          { slug: 'dvds-bluray', name: 'DVDs & Blu-ray', icon: '📀' },
          { slug: 'vinyl-cds', name: 'Vinyl & CDs', icon: '💿' },
        ],
      },
      {
        slug: 'games-media',
        name: 'Games',
        icon: '🎮',
        children: [
          { slug: 'video-games', name: 'Video Games', icon: '🎮' },
          { slug: 'board-games-media', name: 'Board Games', icon: '🎲' },
          { slug: 'consoles', name: 'Consoles', icon: '🕹️' },
        ],
      },
    ],
  },
];

// Mirrors apps/mobile/src/data/cities.ts — kept as a literal list here
// rather than importing across the app boundary, same tradeoff as the
// TAXONOMY mirroring interests.ts above.
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
  ];

  for (const [key, value] of entries) {
    await prisma.systemConfiguration.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  return entries.length;
}

async function main() {
  let total = 0;
  for (const topLevel of TAXONOMY) {
    total += await upsertNode(topLevel, null);
  }
  console.log(`Seeded ${total} categories across ${TAXONOMY.length} top-level branches.`);

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
