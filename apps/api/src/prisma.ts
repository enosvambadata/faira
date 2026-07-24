// Thin re-export shim: the Prisma client now lives in the shared @faira/db
// package (one schema + one migration owner across the monorepo). Kept so the
// many `from '../prisma'` imports across routes/services/tests keep working.
export { prisma } from '@faira/db';
