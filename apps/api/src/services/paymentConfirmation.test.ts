import { describe, it, expect, vi, beforeEach } from 'vitest';

const orderFindUniqueMock = vi.fn();
const orderUpdateManyMock = vi.fn();
const paymentUpdateMock = vi.fn();
const escrowCreateMock = vi.fn();
const transactionMock = vi.fn();
const notifyOrderStatusChangeMock = vi.fn();

vi.mock('./orderNotifications', () => ({
  notifyOrderStatusChange: (...args: unknown[]) => notifyOrderStatusChangeMock(...args),
}));

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
  orderUpdateManyMock.mockResolvedValue({ count: 1 });
  // Interactive $transaction(cb): invoke the callback with a tx client whose
  // methods delegate to the same mocks. The array form still Promise.all's.
  transactionMock.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)({
          order: { updateMany: (...a: unknown[]) => orderUpdateManyMock(...a) },
          payment: { update: (...a: unknown[]) => paymentUpdateMock(...a) },
          escrowLedgerEntry: { create: (...a: unknown[]) => escrowCreateMock(...a) },
        })
      : Promise.all(arg as unknown[]),
  );
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

  it('does the PAID flip and the escrow HOLD in one transaction, not a standalone status commit', async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: 'order-1',
      status: 'PENDING',
      priceAtPurchase: 45.5,
      listing: { sellerId: 'seller-1' },
      payments: [{ id: 'payment-1', paynowReference: null }],
    });
    const txOrderUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txEscrowCreate = vi.fn().mockResolvedValue({});
    transactionMock.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)({
            order: { updateMany: txOrderUpdateMany },
            payment: { update: vi.fn().mockResolvedValue({}) },
            escrowLedgerEntry: { create: txEscrowCreate },
          })
        : Promise.all(arg as unknown[]),
    );

    await confirmOrderPayment('order-1', 'PN-REF-1');

    // The status flip is issued on the transaction client, never via the
    // auto-committing top-level prisma.order.updateMany.
    expect(txOrderUpdateMany).toHaveBeenCalledWith({ where: { id: 'order-1', status: 'PENDING' }, data: { status: 'PAID' } });
    expect(orderUpdateManyMock).not.toHaveBeenCalled();
    expect(txEscrowCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'HOLD' }) }),
    );
  });

  it('propagates a ledger write failure so the PAID flip cannot commit without the HOLD', async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: 'order-1',
      status: 'PENDING',
      priceAtPurchase: 45.5,
      listing: { sellerId: 'seller-1' },
      payments: [{ id: 'payment-1', paynowReference: null }],
    });
    transactionMock.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)({
            order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
            payment: { update: vi.fn().mockResolvedValue({}) },
            escrowLedgerEntry: { create: vi.fn().mockRejectedValue(new Error('ledger write failed')) },
          })
        : Promise.all(arg as unknown[]),
    );

    await expect(confirmOrderPayment('order-1', 'PN-REF-1')).rejects.toThrow();
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
