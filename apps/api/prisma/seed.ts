import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Mirrors apps/mobile/src/data/interests.ts so onboarding interests and
// listing categories use the same taxonomy.
const CATEGORIES = [
  { slug: 'fashion', name: 'Fashion & Clothing' },
  { slug: 'electronics', name: 'Electronics' },
  { slug: 'home', name: 'Home & Furniture' },
  { slug: 'beauty', name: 'Beauty & Health' },
  { slug: 'kids', name: 'Kids & Baby' },
  { slug: 'sports', name: 'Sports & Outdoors' },
  { slug: 'vehicles', name: 'Vehicles & Parts' },
  { slug: 'books', name: 'Books & Media' },
];

async function main() {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories.`);
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
