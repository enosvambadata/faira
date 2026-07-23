import { describe, it, expect, vi, beforeEach } from 'vitest';

const shipmentFindUniqueMock = vi.fn();
const milestoneFindUniqueMock = vi.fn();
const sendSmsMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    collectUkShipment: { findUnique: (...args: unknown[]) => shipmentFindUniqueMock(...args) },
    collectUkShipmentMilestone: { findUnique: (...args: unknown[]) => milestoneFindUniqueMock(...args) },
  },
}));

vi.mock('../lib/sms', () => ({ sendSms: (...args: unknown[]) => sendSmsMock(...args) }));

vi.mock('../lib/collectUkShipmentToken', () => ({
  generateShipmentTrackingToken: (recipientId: string) => `tok-${recipientId}`,
}));

const { notifyShipmentMilestone } = await import('./collectUkShipmentNotifications');

const SHIPMENT = {
  id: 's-1',
  reference: 'Container to Harare - Jul',
  company: { name: 'ABC Logistics' },
  recipients: [
    { id: 'r-1', customerContact: '+447700900001' },
    { id: 'r-2', customerContact: '+447700900002' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEB_APP_URL = 'https://app.example.com';
  shipmentFindUniqueMock.mockResolvedValue(SHIPMENT);
  sendSmsMock.mockResolvedValue(undefined);
});

describe('notifyShipmentMilestone', () => {
  it('texts every recipient a per-recipient tracking link and returns the count', async () => {
    milestoneFindUniqueMock.mockResolvedValue({
      stage: 'Arrived at Walvis Bay',
      location: 'Walvis Bay',
      note: null,
      pickupAddress: null,
      pickupFrom: null,
      pickupTo: null,
    });

    const count = await notifyShipmentMilestone('s-1', 'm-1');

    expect(count).toBe(2);
    expect(sendSmsMock).toHaveBeenCalledTimes(2);
    expect(sendSmsMock).toHaveBeenNthCalledWith(
      1,
      '+447700900001',
      'ABC Logistics: Container to Harare - Jul -- Arrived at Walvis Bay (Walvis Bay). Track: https://app.example.com/collect-uk/track-shipment/tok-r-1',
    );
    expect(sendSmsMock).toHaveBeenNthCalledWith(
      2,
      '+447700900002',
      'ABC Logistics: Container to Harare - Jul -- Arrived at Walvis Bay (Walvis Bay). Track: https://app.example.com/collect-uk/track-shipment/tok-r-2',
    );
  });

  it('includes storage address and pickup window on the final milestone', async () => {
    milestoneFindUniqueMock.mockResolvedValue({
      stage: 'At our Harare storage',
      location: null,
      note: null,
      pickupAddress: '12 Samora Machel Ave, Harare',
      pickupFrom: new Date('2026-08-20T00:00:00Z'),
      pickupTo: new Date('2026-08-25T00:00:00Z'),
    });

    await notifyShipmentMilestone('s-1', 'm-1');

    expect(sendSmsMock).toHaveBeenNthCalledWith(
      1,
      '+447700900001',
      'ABC Logistics: Container to Harare - Jul -- At our Harare storage. Ready for collection at 12 Samora Machel Ave, Harare between 20 Aug 2026 and 25 Aug 2026. Track: https://app.example.com/collect-uk/track-shipment/tok-r-1',
    );
  });

  it('returns 0 without sending when the shipment is missing', async () => {
    shipmentFindUniqueMock.mockResolvedValue(null);
    const count = await notifyShipmentMilestone('s-1', 'm-1');
    expect(count).toBe(0);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});
