import { describe, it, expect, vi, beforeEach } from 'vitest';

const orderFindUniqueMock = vi.fn();
const sendPushNotificationMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    order: { findUnique: (...args: unknown[]) => orderFindUniqueMock(...args) },
  },
}));

vi.mock('../lib/push', () => ({
  sendPushNotification: (...args: unknown[]) => sendPushNotificationMock(...args),
}));

const { notifyOrderStatusChange } = await import('./orderNotifications');

function fakeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-1',
    listing: {
      title: 'Nike Air Max',
      seller: { expoPushToken: 'ExponentPushToken[seller]', pushNotificationsEnabled: true },
    },
    buyer: { expoPushToken: 'ExponentPushToken[buyer]', pushNotificationsEnabled: true },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notifyOrderStatusChange', () => {
  it('sends plain-language push notifications to both buyer and seller on PAID', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder());

    await notifyOrderStatusChange('order-1', 'PAID');

    expect(sendPushNotificationMock).toHaveBeenCalledTimes(2);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ExponentPushToken[buyer]', body: expect.stringContaining('Nike Air Max') }),
    );
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ExponentPushToken[seller]', body: expect.stringContaining('Nike Air Max') }),
    );
    // Plain language — no raw status enum names leaking into the copy.
    const bodies = sendPushNotificationMock.mock.calls.map(call => call[0].body);
    for (const body of bodies) {
      expect(body).not.toMatch(/PAID|SHIPPED|COMPLETED|DISPUTED|REFUNDED/);
    }
  });

  it('has copy for every reachable status transition', async () => {
    for (const status of ['PAID', 'SHIPPED', 'COMPLETED', 'DISPUTED', 'REFUNDED'] as const) {
      orderFindUniqueMock.mockResolvedValue(fakeOrder());
      sendPushNotificationMock.mockClear();

      await notifyOrderStatusChange('order-1', status);

      expect(sendPushNotificationMock).toHaveBeenCalledTimes(2);
    }
  });

  it('skips a recipient with push notifications disabled', async () => {
    orderFindUniqueMock.mockResolvedValue(
      fakeOrder({ buyer: { expoPushToken: 'ExponentPushToken[buyer]', pushNotificationsEnabled: false } }),
    );

    await notifyOrderStatusChange('order-1', 'PAID');

    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'ExponentPushToken[seller]' }));
  });

  it('skips a recipient with no push token', async () => {
    orderFindUniqueMock.mockResolvedValue(
      fakeOrder({ buyer: { expoPushToken: null, pushNotificationsEnabled: true } }),
    );

    await notifyOrderStatusChange('order-1', 'PAID');

    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a status with no defined copy (e.g. PENDING)', async () => {
    await notifyOrderStatusChange('order-1', 'PENDING');

    expect(orderFindUniqueMock).not.toHaveBeenCalled();
    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });

  it('does nothing when the order does not exist', async () => {
    orderFindUniqueMock.mockResolvedValue(null);

    await notifyOrderStatusChange('missing-order', 'PAID');

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });
});
