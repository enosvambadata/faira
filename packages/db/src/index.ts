import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// The single Prisma client for the whole monorepo. Every app (parts-api,
// fulfilment-api, collect-api) imports it from @faira/db so there is exactly one
// schema binding against the one shared DATABASE_URL. Migrations live and run
// from this package (see the `migrate` script) — the single migration owner.
const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
});

export const prisma = new PrismaClient({ adapter });

export { supabaseAdmin, supabasePublic } from './supabase';
