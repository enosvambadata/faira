import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma';
import { getSellerAvailableBalance } from './sellerBalance';

// Real-Postgres integration (runs only in the CI `integration` job with a
// Postgres service, NOT in the mocked unit run). These prove the guarantees
// the mocked unit tests cannot: that a Prisma interactive transaction actually
// rolls back on throw -- the exact database behaviour the B1 escrow-atomicity
// fix depends on -- and that the real escrow aggregate query is correct.
//
// escrow_ledger.seller_id → users.id → auth.users.id, so we seed one real
// seller (auth.users is Supabase-managed; the CI job stubs the schema/table).
describe('escrow ledger — real Postgres integration', () => {
  const SELLER_ID = randomUUID();

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`INSERT INTO auth.users (id) VALUES ('${SELLER_ID}') ON CONFLICT DO NOTHING`);
    await prisma.user.create({ data: { id: SELLER_ID } });
  });

  afterAll(async () => {
    await prisma.escrowLedgerEntry.deleteMany({ where: { sellerId: SELLER_ID } });
    await prisma.user.delete({ where: { id: SELLER_ID } }).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM auth.users WHERE id = '${SELLER_ID}'`);
    await prisma.$disconnect();
  });

  it('rolls back every write when an interactive transaction throws', async () => {
    await expect(
      prisma.$transaction(async tx => {
        await tx.escrowLedgerEntry.create({ data: { sellerId: SELLER_ID, type: 'RELEASE', amount: 10 } });
        // Simulate a mid-transaction failure (e.g. a second ledger write dying).
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // The RELEASE write must NOT have committed -- this is the rollback that
    // keeps a status flip and its ledger entries all-or-nothing.
    expect(await prisma.escrowLedgerEntry.count({ where: { sellerId: SELLER_ID } })).toBe(0);
  });

  it('commits every write when the transaction succeeds, and the balance query reads them', async () => {
    await prisma.$transaction(async tx => {
      await tx.escrowLedgerEntry.create({ data: { sellerId: SELLER_ID, type: 'RELEASE', amount: 95 } });
      await tx.escrowLedgerEntry.create({ data: { sellerId: SELLER_ID, type: 'COMMISSION', amount: 5 } });
    });

    expect(await prisma.escrowLedgerEntry.count({ where: { sellerId: SELLER_ID } })).toBe(2);
    // Real aggregate against Postgres: available = RELEASE(95) - PAYOUT(0).
    expect(await getSellerAvailableBalance(SELLER_ID)).toBe(95);

    await prisma.escrowLedgerEntry.deleteMany({ where: { sellerId: SELLER_ID } });
  });
});
