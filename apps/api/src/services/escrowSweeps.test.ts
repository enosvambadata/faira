import { describe, it, expect, vi, beforeEach } from 'vitest';

const orderFindManyMock = vi.fn();
const orderUpdateMock = vi.fn();
const orderUpdateManyMock = vi.fn();
const escrowLedgerEntryCreateMock = vi.fn();
const transactionMock = vi.fn();
const releaseEscrowFundsMock = vi.fn();
const notifyOrderStatusChangeMock = vi.fn();
const sendPushNotificationMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    order: {
      findMany: (...a: unknown[]) => orderFindManyMock(...a),
      update: (...a: unknown[]) => orderUpdateMock(...a),
      updateMany: (...a: unknown[]) => orderUpdateManyMock(...a),
    },
    escrowLedgerEntry: { create: (...a: unknown[]) => escrowLedgerEntryCreateMock(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}));
vi.mock('./escrowRelease', () => ({ releaseEscrowFunds: (...a: unknown[]) => releaseEscrowFundsMock(...a) }));
vi.mock('./orderNotifications', () => ({ notifyOrderStatusChange: (...a: unknown[]) => notifyOrderStatusChangeMock(...a) }));
vi.mock('../lib/push', () => ({ sendPushNotification: (...a: unknown[]) => sendPushNotificationMock(...a) }));

const { runAutoReleaseSweep, runAutoRefundSweep } = await import('./escrowSweeps');

const NOW = new Date('2026-07-19T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  orderUpdateMock.mockResolvedValue({});
  // Default: run the refund transaction callback against a fake tx.
  transactionMock.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb({ order: { updateMany: orderUpdateManyMock }, escrowLedgerEntry: { create: escrowLedgerEntryCreateMock } }),
  );
});

describe('runAutoReleaseSweep (Sweep A)', () => {
  it('only ever looks at SHIPPED courier/postal orders — MEETUP is excluded', async () => {
    orderFindManyMock.mockResolvedValue([]);
    await runAutoReleaseSweep(NOW);

    for (const call of orderFindManyMock.mock.calls) {
      expect(call[0].where.status).toBe('SHIPPED');
      expect(call[0].where.shippingMethod).toEqual({ in: ['COURIER', 'POSTAL'] });
    }
  });

  it('sends a day-5 grace reminder to the buyer and stamps it', async () => {
    orderFindManyMock
      .mockResolvedValueOnce([
        { id: 'o1', listing: { title: 'Gearbox' }, buyer: { expoPushToken: 'tok', pushNotificationsEnabled: true } },
      ]) // toRemind
      .mockResolvedValueOnce([]); // toRelease

    const res = await runAutoReleaseSweep(NOW);

    expect(sendPushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'tok', data: { orderId: 'o1' } }));
    expect(orderUpdateMock).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { autoReleaseReminderAt: expect.any(Date) } });
    expect(res).toEqual({ remindersSent: 1, actioned: 0 });
  });

  it('releases due orders through the atomic releaseEscrowFunds, not a parallel path', async () => {
    orderFindManyMock
      .mockResolvedValueOnce([]) // toRemind
      .mockResolvedValueOnce([{ id: 'o2' }, { id: 'o3' }]); // toRelease
    releaseEscrowFundsMock.mockResolvedValueOnce({ released: true }).mockResolvedValueOnce({ released: true });

    const res = await runAutoReleaseSweep(NOW);

    expect(releaseEscrowFundsMock).toHaveBeenCalledWith('o2');
    expect(releaseEscrowFundsMock).toHaveBeenCalledWith('o3');
    expect(res.actioned).toBe(2);
  });

  it('does not count an order releaseEscrowFunds refuses (e.g. now DISPUTED)', async () => {
    orderFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'o4' }]);
    releaseEscrowFundsMock.mockResolvedValue({ released: false }); // dispute re-checked at fire time, skipped

    const res = await runAutoReleaseSweep(NOW);
    expect(res.actioned).toBe(0);
  });
});

describe('runAutoRefundSweep (Sweep B)', () => {
  const paidOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'p1',
    priceAtPurchase: 120,
    autoRefundReminderAt: null,
    listing: { title: 'Bumper', sellerId: 'seller-1', seller: { expoPushToken: 'stok', pushNotificationsEnabled: true } },
    payments: [{ status: 'CONFIRMED', confirmedAt: new Date(NOW.getTime() - 5 * DAY) }],
    ...overrides,
  });

  it('selects only PAID, never-shipped orders', async () => {
    orderFindManyMock.mockResolvedValue([]);
    await runAutoRefundSweep(NOW);

    expect(orderFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PAID', shippedAt: null }) }),
    );
  });

  it('reminds the seller at day 2 (ship or lose it) without refunding yet', async () => {
    orderFindManyMock.mockResolvedValue([
      paidOrder({ payments: [{ status: 'CONFIRMED', confirmedAt: new Date(NOW.getTime() - 3 * DAY) }] }),
    ]);

    const res = await runAutoRefundSweep(NOW);

    expect(sendPushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'stok' }));
    expect(orderUpdateMock).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { autoRefundReminderAt: expect.any(Date) } });
    expect(orderUpdateManyMock).not.toHaveBeenCalled();
    expect(res).toEqual({ remindersSent: 1, actioned: 0 });
  });

  it('refunds the buyer via the escrow REFUND path once past the window', async () => {
    orderFindManyMock.mockResolvedValue([paidOrder()]); // confirmed 5 days ago > 4-day window
    orderUpdateManyMock.mockResolvedValue({ count: 1 });

    const res = await runAutoRefundSweep(NOW);

    expect(orderUpdateManyMock).toHaveBeenCalledWith({ where: { id: 'p1', status: 'PAID' }, data: { status: 'REFUNDED' } });
    expect(escrowLedgerEntryCreateMock).toHaveBeenCalledWith({
      data: { orderId: 'p1', sellerId: 'seller-1', type: 'REFUND', amount: 120 },
    });
    expect(notifyOrderStatusChangeMock).toHaveBeenCalledWith('p1', 'REFUNDED');
    expect(res.actioned).toBe(1);
  });

  it('a late SHIPPED transition beats the refund timer — count===0 skips it, no double-handling', async () => {
    orderFindManyMock.mockResolvedValue([paidOrder()]);
    orderUpdateManyMock.mockResolvedValue({ count: 0 }); // order moved to SHIPPED/DISPUTED under us

    const res = await runAutoRefundSweep(NOW);

    expect(escrowLedgerEntryCreateMock).not.toHaveBeenCalled();
    expect(notifyOrderStatusChangeMock).not.toHaveBeenCalled();
    expect(res.actioned).toBe(0);
  });
});
