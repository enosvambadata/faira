import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const shipmentFindUniqueMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    shipment: { findUnique: (...args: unknown[]) => shipmentFindUniqueMock(...args) },
  },
}));

const { createApp } = await import('../app');
const { generateTrackingToken } = await import('../lib/trackingToken');

const SHIPMENT_ID = '44444444-4444-4444-8444-444444444444';

const ORIGIN_HUB = { name: 'Harare Hub', city: 'Harare', address: '1 Origin Rd', openingHours: '8am-5pm' };
const DESTINATION_HUB = { name: 'Bulawayo Hub', city: 'Bulawayo', address: '2 Destination Rd', openingHours: '8am-5pm' };

function shipment(overrides: Partial<{ status: string; collectionWindowEndsAt: Date | null }> = {}) {
  return {
    id: SHIPMENT_ID,
    reference: 'FF-HRE-000123',
    buyerName: 'Jane Buyer',
    buyerContact: '+263771234567',
    declaredValue: '150.00',
    sellerId: 'seller-1',
    status: overrides.status ?? 'IN_TRANSIT',
    collectionWindowEndsAt: overrides.collectionWindowEndsAt ?? null,
    originHub: ORIGIN_HUB,
    destinationHub: DESTINATION_HUB,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TRACKING_TOKEN_SECRET = 'test-tracking-secret';
});

describe('GET /api/v1/fulfilment/tracking/:token', () => {
  it('returns buyer-safe tracking info for a valid token, excluding seller PII', async () => {
    shipmentFindUniqueMock.mockResolvedValue(shipment({ status: 'IN_TRANSIT' }));
    const token = generateTrackingToken(SHIPMENT_ID);

    const app = createApp();
    const res = await request(app).get(`/api/v1/fulfilment/tracking/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      status: 'On its way',
      originHub: { name: 'Harare Hub', city: 'Harare' },
      destinationHub: {
        name: 'Bulawayo Hub',
        city: 'Bulawayo',
        address: '2 Destination Rd',
        openingHours: '8am-5pm',
      },
      estimatedCollectionDate: null,
      paymentComplete: true,
    });

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('FF-HRE-000123');
    expect(serialized).not.toContain('Jane Buyer');
    expect(serialized).not.toContain('+263771234567');
    expect(serialized).not.toContain('150.00');
    expect(serialized).not.toContain('seller-1');
  });

  it('404s for a malformed token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/tracking/not-a-real-token');

    expect(res.status).toBe(404);
    expect(shipmentFindUniqueMock).not.toHaveBeenCalled();
  });

  it('404s for an expired token', async () => {
    const realNow = Date.now;
    Date.now = () => new Date('2020-01-01T00:00:00Z').getTime();
    const token = generateTrackingToken(SHIPMENT_ID);
    Date.now = realNow;

    const app = createApp();
    const res = await request(app).get(`/api/v1/fulfilment/tracking/${token}`);

    expect(res.status).toBe(404);
  });

  it('404s when the token is valid but the shipment no longer exists', async () => {
    shipmentFindUniqueMock.mockResolvedValue(null);
    const token = generateTrackingToken(SHIPMENT_ID);

    const app = createApp();
    const res = await request(app).get(`/api/v1/fulfilment/tracking/${token}`);

    expect(res.status).toBe(404);
  });

  it('reports paymentComplete: false while still DRAFT or AWAITING_PAYMENT', async () => {
    const token = generateTrackingToken(SHIPMENT_ID);
    const app = createApp();

    shipmentFindUniqueMock.mockResolvedValue(shipment({ status: 'DRAFT' }));
    const draftRes = await request(app).get(`/api/v1/fulfilment/tracking/${token}`);
    expect(draftRes.body.data.paymentComplete).toBe(false);

    shipmentFindUniqueMock.mockResolvedValue(shipment({ status: 'AWAITING_PAYMENT' }));
    const awaitingRes = await request(app).get(`/api/v1/fulfilment/tracking/${token}`);
    expect(awaitingRes.body.data.paymentComplete).toBe(false);
  });

  it('surfaces estimatedCollectionDate once the parcel has arrived', async () => {
    const collectBy = new Date('2026-08-15T00:00:00Z');
    shipmentFindUniqueMock.mockResolvedValue(shipment({ status: 'READY_FOR_COLLECTION', collectionWindowEndsAt: collectBy }));
    const token = generateTrackingToken(SHIPMENT_ID);

    const app = createApp();
    const res = await request(app).get(`/api/v1/fulfilment/tracking/${token}`);

    expect(res.body.data.estimatedCollectionDate).toBe(collectBy.toISOString());
  });

  it('rate-limits repeated requests from the same client', async () => {
    shipmentFindUniqueMock.mockResolvedValue(shipment());
    const token = generateTrackingToken(SHIPMENT_ID);
    const app = createApp();

    let lastStatus = 200;
    for (let i = 0; i < 25; i++) {
      const res = await request(app).get(`/api/v1/fulfilment/tracking/${token}`);
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});
