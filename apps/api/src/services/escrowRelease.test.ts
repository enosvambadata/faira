import { describe, it, expect, vi, beforeEach } from 'vitest';

const orderFindUniqueMock = vi.fn();
const orderUpdateManyMock = vi.fn();
const escrowCreateMock = vi.fn();
const transactionMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => orderFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => orderUpdateManyMock(...args),
    },
    escrowLedgerEntry: {
      create: (...args: unknown[]) => escrowCreateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { releaseEscrowFunds } = await import('./escrowRelease');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('releaseEscrowFunds', () => {
  it('splits 95% to the seller and 5% commission, rounded to the cent', async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: 'order-1',
      status: 'PAID',
      priceAtPurchase: 100,
      listing: { sellerId: 'seller-1' },
      disputes: [],
    });
    orderUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await releaseEscrowFunds('order-1');

    expect(result.released).toBe(true);
    // The order row was fetched before the DB update — the returned object
    // must reflect the new status, not the stale pre-update one.
    expect(result.order?.status).toBe('DELIVERED');
    expect(orderUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'PAID' },
      data: { status: 'DELIVERED' },
    });
    expect(escrowCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RELEASE', amount: 95, sellerId: 'seller-1' }) }),
    );
    expect(escrowCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'COMMISSION', amount: 5, sellerId: 'seller-1' }) }),
    );
  });

  it('allows releasing directly from SHIPPED', async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: 'order-2',
      status: 'SHIPPED',
      priceAtPurchase: 50,
      listing: { sellerId: 'seller-1' },
      disputes: [],
    });
    orderUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await releaseEscrowFunds('order-2');

    expect(result.released).toBe(true);
  });

  it('does not release funds for an order that is not PAID or SHIPPED', async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: 'order-3',
      status: 'PENDING',
      priceAtPurchase: 50,
      listing: { sellerId: 'seller-1' },
      disputes: [],
    });

    const result = await releaseEscrowFunds('order-3');

    expect(result.released).toBe(false);
    expect(orderUpdateManyMock).not.toHaveBeenCalled();
    expect(escrowCreateMock).not.toHaveBeenCalled();
  });

  it('does not double-release when it loses the race (order already transitioned)', async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: 'order-4',
      status: 'PAID',
      priceAtPurchase: 50,
      listing: { sellerId: 'seller-1' },
      disputes: [],
    });
    orderUpdateManyMock.mockResolvedValue({ count: 0 });

    const result = await releaseEscrowFunds('order-4');

    expect(result.released).toBe(false);
    expect(escrowCreateMock).not.toHaveBeenCalled();
  });

  it('does not release funds while an open dispute exists', async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: 'order-5',
      status: 'PAID',
      priceAtPurchase: 50,
      listing: { sellerId: 'seller-1' },
      disputes: [{ id: 'dispute-1', status: 'OPEN' }],
    });

    const result = await releaseEscrowFunds('order-5');

    expect(result.released).toBe(false);
    expect(orderUpdateManyMock).not.toHaveBeenCalled();
    expect(escrowCreateMock).not.toHaveBeenCalled();
  });

  it('returns released: false and a null order when the order does not exist', async () => {
    orderFindUniqueMock.mockResolvedValue(null);

    const result = await releaseEscrowFunds('missing-order');

    expect(result).toEqual({ released: false, order: null });
  });
});
