import { describe, it, expect, vi, beforeEach } from 'vitest';

const aggregateMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: { escrowLedgerEntry: { aggregate: (...a: unknown[]) => aggregateMock(...a) } },
}));

const { getSellerAvailableBalance } = await import('./sellerBalance');

// aggregate resolves the sum based on the `type` filter in the where clause.
function ledger({ release, payout }: { release: number | null; payout: number | null }) {
  aggregateMock.mockImplementation((args: { where: { type: string } }) =>
    Promise.resolve({ _sum: { amount: args.where.type === 'RELEASE' ? release : payout } }),
  );
}

beforeEach(() => vi.clearAllMocks());

describe('getSellerAvailableBalance', () => {
  it('is total released minus total paid out', async () => {
    ledger({ release: 100, payout: 30 });
    expect(await getSellerAvailableBalance('seller-1')).toBe(70);
  });

  it('is 0 when the seller has no ledger entries', async () => {
    ledger({ release: null, payout: null });
    expect(await getSellerAvailableBalance('seller-1')).toBe(0);
  });

  it('treats a null payout sum as 0', async () => {
    ledger({ release: 55.5, payout: null });
    expect(await getSellerAvailableBalance('seller-1')).toBe(55.5);
  });

  it('rounds to the cent, absorbing binary-float drift', async () => {
    ledger({ release: 0.3, payout: 0.1 }); // 0.3 - 0.1 = 0.199999... as an IEEE-754 float
    expect(await getSellerAvailableBalance('seller-1')).toBe(0.2);
  });

  it('aggregates RELEASE and PAYOUT scoped to the seller', async () => {
    ledger({ release: 10, payout: 0 });
    await getSellerAvailableBalance('seller-9');
    expect(aggregateMock).toHaveBeenCalledWith({ where: { sellerId: 'seller-9', type: 'RELEASE' }, _sum: { amount: true } });
    expect(aggregateMock).toHaveBeenCalledWith({ where: { sellerId: 'seller-9', type: 'PAYOUT' }, _sum: { amount: true } });
  });
});
