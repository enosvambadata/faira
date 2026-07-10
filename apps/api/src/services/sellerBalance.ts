import { prisma } from '../prisma';

// Available balance = everything released to the seller minus everything
// already paid out. A failed payout's compensating RELEASE entry (see
// admin.ts's mark-failed handler) naturally nets back out here too, since
// it's just another RELEASE-type entry — no special-casing needed.
export async function getSellerAvailableBalance(sellerId: string): Promise<number> {
  const [releaseSum, payoutSum] = await Promise.all([
    prisma.escrowLedgerEntry.aggregate({ where: { sellerId, type: 'RELEASE' }, _sum: { amount: true } }),
    prisma.escrowLedgerEntry.aggregate({ where: { sellerId, type: 'PAYOUT' }, _sum: { amount: true } }),
  ]);

  const released = Number(releaseSum._sum.amount ?? 0);
  const paidOut = Number(payoutSum._sum.amount ?? 0);
  return Math.round((released - paidOut) * 100) / 100;
}
