import { describe, it, expect, vi, beforeEach } from 'vitest';

const orderFindUniqueMock = vi.fn();
const orderUpdateManyMock = vi.fn();
const paymentUpdateMock = vi.fn();
const escrowCreateMock = vi.fn();
const transactionMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => orderFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => orderUpdateManyMock(...args),
    },
    payment: {
      update: (...args: unknown[]) => paymentUpdateMock(...args),
    },
    escrowLedgerEntry: {
      create: (...args: unknown[]) => escrowCreateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { confirmOrderPayment } = await import('./paymentConfirmation');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirmOrderPayment', () => {
  it('holds funds in escrow and confirms the payment for a PENDING order', async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: 'order-1',
      status: 'PENDING',
      priceAtPurchase: 45.5,
      listing: { sellerId: 'seller-1' },
      payments: [{ id: 'payment-1', paynowReference: null }],
    });
    orderUpdateManyMock.mockResolvedValue({ count: 1 });

    await confirmOrderPayment('order-1', 'PN-REF-1');

    expect(orderUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'PENDING' },
      data: { status: 'PAID' },
    });
    expect(transactionMock).toHaveBeenCalled();
    expect(escrowCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'HOLD', sellerId: 'seller-1' }) }),
    );
  });

  it('does not confirm a stray pending payment on an order that is no longer PENDING', async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: 'order-2',
      status: 'CANCELLED',
      priceAtPurchase: 45.5,
      listing: { sellerId: 'seller-1' },
      payments: [{ id: 'payment-2', paynowReference: null }],
    });

    await confirmOrderPayment('order-2', 'PN-REF-2');

    expect(orderUpdateManyMock).not.toHaveBeenCalled();
    expect(paymentUpdateMock).not.toHaveBeenCalled();
    expect(escrowCreateMock).not.toHaveBeenCalled();
  });

  it('is a no-op when there is no pending payment', async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: 'order-3',
      status: 'PAID',
      priceAtPurchase: 45.5,
      listing: { sellerId: 'seller-1' },
      payments: [],
    });

    await confirmOrderPayment('order-3', null);

    expect(orderUpdateManyMock).not.toHaveBeenCalled();
    expect(escrowCreateMock).not.toHaveBeenCalled();
  });

  it('returns null when the order does not exist', async () => {
    orderFindUniqueMock.mockResolvedValue(null);

    const result = await confirmOrderPayment('missing-order', null);

    expect(result).toBeNull();
  });
});
