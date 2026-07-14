import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma';
import { getSellerAvailableBalance } from './sellerBalance';

// Real-Postgres integration (runs only in the CI `integration` job with a
// Postgres service, NOT in the mocked unit run). These prove the guarantees
// the mocked unit tests cannot: that a Prisma interactive transaction actually
// rolls back on throw -- the exact database behaviour the B1 escrow-atomicity
// fix depends on -- and that the real escrow aggregate query is correct.
//
// escrow_ledger.order_id is nullable, so we can exercise the ledger + the
// transaction without seeding orders/listings/users.
describe('escrow ledger — real Postgres integration', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rolls back every write when an interactive transaction throws', async () => {
    const sellerId = randomUUID();

    await expect(
      prisma.$transaction(async tx => {
        await tx.escrowLedgerEntry.create({ data: { sellerId, type: 'RELEASE', amount: 10 } });
        // Simulate a mid-transaction failure (e.g. a second ledger write dying).
        throw new Error('boom');
      }),
    ).rejects.toThrow();

    // The RELEASE write must NOT have committed -- this is the rollback that
    // keeps a status flip and its ledger entries all-or-nothing.
    expect(await prisma.escrowLedgerEntry.count({ where: { sellerId } })).toBe(0);
  });

  it('commits every write when the transaction succeeds, and the balance query reads them', async () => {
    const sellerId = randomUUID();

    await prisma.$transaction(async tx => {
      await tx.escrowLedgerEntry.create({ data: { sellerId, type: 'RELEASE', amount: 95 } });
      await tx.escrowLedgerEntry.create({ data: { sellerId, type: 'COMMISSION', amount: 5 } });
    });

    expect(await prisma.escrowLedgerEntry.count({ where: { sellerId } })).toBe(2);
    // Real aggregate against Postgres: available = RELEASE(95) - PAYOUT(0).
    expect(await getSellerAvailableBalance(sellerId)).toBe(95);

    await prisma.escrowLedgerEntry.deleteMany({ where: { sellerId } });
  });
});
