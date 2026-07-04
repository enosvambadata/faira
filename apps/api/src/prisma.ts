import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
});

export const prisma = new PrismaClient({ adapter });
