import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const userRoleFindManyMock = vi.fn();
const hubFindUniqueMock = vi.fn();
const verificationFindFirstMock = vi.fn();
const systemConfigFindManyMock = vi.fn();
const shipmentCreateMock = vi.fn();
const shipmentFindUniqueMock = vi.fn();
const shipmentDeleteMock = vi.fn();
const shipmentUpdateMock = vi.fn();
const auditLogCreateMock = vi.fn();
const routeFindUniqueMock = vi.fn();
const pricingRuleFindUniqueMock = vi.fn();
const quoteConfigFindUniqueMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    userRole: { findMany: (...args: unknown[]) => userRoleFindManyMock(...args) },
    hub: { findUnique: (...args: unknown[]) => hubFindUniqueMock(...args) },
    fulfilmentVerificationRequest: { findFirst: (...args: unknown[]) => verificationFindFirstMock(...args) },
    systemConfiguration: {
      findMany: (...args: unknown[]) => systemConfigFindManyMock(...args),
      findUnique: (...args: unknown[]) => quoteConfigFindUniqueMock(...args),
    },
    shipment: {
      create: (...args: unknown[]) => shipmentCreateMock(...args),
      findUnique: (...args: unknown[]) => shipmentFindUniqueMock(...args),
      update: (...args: unknown[]) => shipmentUpdateMock(...args),
      delete: (...args: unknown[]) => shipmentDeleteMock(...args),
    },
    transportRoute: { findUnique: (...args: unknown[]) => routeFindUniqueMock(...args) },
    pricingRule: { findUnique: (...args: unknown[]) => pricingRuleFindUniqueMock(...args) },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const SELLER_ID = 'seller-1';
const HARARE_ID = '11111111-1111-4111-8111-111111111111';
const BULAWAYO_ID = '22222222-2222-4222-8222-222222222222';

const VALID_BODY = {
  buyerName: 'Tendai Moyo',
  buyerContact: '+263771234567',
  originHubId: HARARE_ID,
  destinationHubId: BULAWAYO_ID,
  category: 'Electronics',
  declaredValue: 100,
  sizeTier: 'MEDIUM',
};

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
  userRoleFindManyMock.mockResolvedValue([{ role: 'SELLER', hubId: null }]);
  hubFindUniqueMock.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(
      where.id === HARARE_ID
        ? { id: HARARE_ID, isActive: true }
        : where.id === BULAWAYO_ID
          ? { id: BULAWAYO_ID, isActive: true }
          : null,
    ),
  );
  verificationFindFirstMock.mockResolvedValue(null);
  systemConfigFindManyMock.mockResolvedValue([
    { key: 'declared_value_limit_unverified', value: '200' },
    { key: 'declared_value_limit_verified', value: '2000' },
  ]);
  routeFindUniqueMock.mockResolvedValue(null);
  pricingRuleFindUniqueMock.mockResolvedValue(null);
  quoteConfigFindUniqueMock.mockResolvedValue({ value: '15' });
});

describe('POST /api/v1/fulfilment/shipments', () => {
  it('creates a DRAFT shipment for an unverified seller under the limit', async () => {
    shipmentCreateMock.mockResolvedValue({
      id: 'shipment-1',
      status: 'DRAFT',
      buyerName: VALID_BODY.buyerName,
      buyerContact: VALID_BODY.buyerContact,
      originHubId: HARARE_ID,
      destinationHubId: BULAWAYO_ID,
      category: 'Electronics',
      description: null,
      declaredValue: { toString: () => '100' },
      sizeTier: 'MEDIUM',
      createdAt: new Date('2026-07-11T00:00:00Z'),
    });

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/shipments').set(AUTH_HEADER).send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(shipmentCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sellerId: SELLER_ID, buyerName: 'Tendai Moyo', declaredValue: 100 }),
    });
  });

  it('400s when declared value exceeds the unverified limit', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/shipments')
      .set(AUTH_HEADER)
      .send({ ...VALID_BODY, declaredValue: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DECLARED_VALUE_EXCEEDS_LIMIT');
    expect(shipmentCreateMock).not.toHaveBeenCalled();
  });

  it('allows a higher declared value for a verified seller', async () => {
    verificationFindFirstMock.mockResolvedValue({ id: 'v1', status: 'APPROVED' });
    shipmentCreateMock.mockResolvedValue({
      id: 'shipment-2',
      status: 'DRAFT',
      buyerName: VALID_BODY.buyerName,
      buyerContact: VALID_BODY.buyerContact,
      originHubId: HARARE_ID,
      destinationHubId: BULAWAYO_ID,
      category: 'Electronics',
      description: null,
      declaredValue: { toString: () => '1500' },
      sizeTier: 'MEDIUM',
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/shipments')
      .set(AUTH_HEADER)
      .send({ ...VALID_BODY, declaredValue: 1500 });

    expect(res.status).toBe(201);
  });

  it('404s when the origin hub does not exist', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/shipments')
      .set(AUTH_HEADER)
      .send({ ...VALID_BODY, originHubId: '33333333-3333-4333-8333-333333333333' });

    expect(res.status).toBe(404);
    expect(shipmentCreateMock).not.toHaveBeenCalled();
  });

  it('400s when origin and destination hub are the same', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/shipments')
      .set(AUTH_HEADER)
      .send({ ...VALID_BODY, destinationHubId: HARARE_ID });

    expect(res.status).toBe(400);
    expect(shipmentCreateMock).not.toHaveBeenCalled();
  });

  it('403s when the caller does not have the SELLER role', async () => {
    userRoleFindManyMock.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/shipments').set(AUTH_HEADER).send(VALID_BODY);

    expect(res.status).toBe(403);
    expect(shipmentCreateMock).not.toHaveBeenCalled();
  });

  it('400s on an invalid buyer contact format', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/shipments')
      .set(AUTH_HEADER)
      .send({ ...VALID_BODY, buyerContact: '0771234567' });

    expect(res.status).toBe(400);
    expect(shipmentCreateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/fulfilment/shipments/:id', () => {
  it('returns the shipment to its owning seller', async () => {
    shipmentFindUniqueMock.mockResolvedValue({
      id: 'shipment-1',
      sellerId: SELLER_ID,
      status: 'DRAFT',
      buyerName: 'Tendai Moyo',
      buyerContact: '+263771234567',
      originHubId: HARARE_ID,
      destinationHubId: BULAWAYO_ID,
      category: 'Electronics',
      description: null,
      declaredValue: { toString: () => '100' },
      sizeTier: 'MEDIUM',
      feePayer: null,
      deliveryFee: null,
      reference: null,
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/shipments/shipment-1').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('shipment-1');
  });

  it("403s when the shipment belongs to a different seller", async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', sellerId: 'someone-else' });

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/shipments/shipment-1').set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });

  it('404s for a nonexistent shipment', async () => {
    shipmentFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/shipments/nonexistent').set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/fulfilment/shipments/:id/quote', () => {
  it('returns the exact-match pricing rule fee for a draft shipment', async () => {
    shipmentFindUniqueMock.mockResolvedValue({
      id: 'shipment-1',
      sellerId: SELLER_ID,
      status: 'DRAFT',
      originHubId: HARARE_ID,
      destinationHubId: BULAWAYO_ID,
      sizeTier: 'MEDIUM',
    });
    routeFindUniqueMock.mockResolvedValue({ id: 'route-1' });
    pricingRuleFindUniqueMock.mockResolvedValue({ fee: { toString: () => '12.5' } });

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/shipments/shipment-1/quote').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ fee: 12.5, source: 'pricing_rule', sizeTier: 'MEDIUM' });
  });

  it('falls back to the configured default when no pricing rule exists', async () => {
    shipmentFindUniqueMock.mockResolvedValue({
      id: 'shipment-1',
      sellerId: SELLER_ID,
      status: 'DRAFT',
      originHubId: HARARE_ID,
      destinationHubId: BULAWAYO_ID,
      sizeTier: 'MEDIUM',
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/shipments/shipment-1/quote').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ fee: 15, source: 'fallback_default', sizeTier: 'MEDIUM' });
  });

  it('409s when the shipment is no longer a draft', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', sellerId: SELLER_ID, status: 'AWAITING_DROPOFF' });

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/shipments/shipment-1/quote').set(AUTH_HEADER);

    expect(res.status).toBe(409);
  });

  it('403s when the shipment belongs to a different seller', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', sellerId: 'someone-else', status: 'DRAFT' });

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/shipments/shipment-1/quote').set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/fulfilment/shipments/:id/quote', () => {
  it('persists the quoted fee and chosen fee-payer', async () => {
    shipmentFindUniqueMock.mockResolvedValue({
      id: 'shipment-1',
      sellerId: SELLER_ID,
      status: 'DRAFT',
      originHubId: HARARE_ID,
      destinationHubId: BULAWAYO_ID,
      sizeTier: 'MEDIUM',
    });
    routeFindUniqueMock.mockResolvedValue({ id: 'route-1' });
    pricingRuleFindUniqueMock.mockResolvedValue({ fee: { toString: () => '12.5' } });
    shipmentUpdateMock.mockResolvedValue({
      id: 'shipment-1',
      status: 'DRAFT',
      feePayer: 'BUYER',
      deliveryFee: { toString: () => '12.5' },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/shipments/shipment-1/quote')
      .set(AUTH_HEADER)
      .send({ feePayer: 'BUYER' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: 'shipment-1',
      status: 'DRAFT',
      feePayer: 'BUYER',
      deliveryFee: '12.5',
      quoteSource: 'pricing_rule',
    });
    expect(shipmentUpdateMock).toHaveBeenCalledWith({
      where: { id: 'shipment-1' },
      data: { deliveryFee: 12.5, feePayer: 'BUYER' },
    });
  });

  it('400s on an invalid feePayer value', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', sellerId: SELLER_ID, status: 'DRAFT' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/shipments/shipment-1/quote')
      .set(AUTH_HEADER)
      .send({ feePayer: 'HUB' });

    expect(res.status).toBe(400);
    expect(shipmentUpdateMock).not.toHaveBeenCalled();
  });

  it('409s when the shipment is no longer a draft', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', sellerId: SELLER_ID, status: 'AWAITING_DROPOFF' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/shipments/shipment-1/quote')
      .set(AUTH_HEADER)
      .send({ feePayer: 'SELLER' });

    expect(res.status).toBe(409);
    expect(shipmentUpdateMock).not.toHaveBeenCalled();
  });

  it('403s when the shipment belongs to a different seller', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', sellerId: 'someone-else', status: 'DRAFT' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/shipments/shipment-1/quote')
      .set(AUTH_HEADER)
      .send({ feePayer: 'SELLER' });

    expect(res.status).toBe(403);
    expect(shipmentUpdateMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/fulfilment/shipments/:id', () => {
  it('abandons a draft shipment', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', sellerId: SELLER_ID, status: 'DRAFT' });

    const app = createApp();
    const res = await request(app).delete('/api/v1/fulfilment/shipments/shipment-1').set(AUTH_HEADER);

    expect(res.status).toBe(204);
    expect(shipmentDeleteMock).toHaveBeenCalledWith({ where: { id: 'shipment-1' } });
  });

  it('409s when the shipment is no longer a draft', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', sellerId: SELLER_ID, status: 'AWAITING_DROPOFF' });

    const app = createApp();
    const res = await request(app).delete('/api/v1/fulfilment/shipments/shipment-1').set(AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(shipmentDeleteMock).not.toHaveBeenCalled();
  });

  it('403s when the shipment belongs to a different seller', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', sellerId: 'someone-else', status: 'DRAFT' });

    const app = createApp();
    const res = await request(app).delete('/api/v1/fulfilment/shipments/shipment-1').set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(shipmentDeleteMock).not.toHaveBeenCalled();
  });
});
