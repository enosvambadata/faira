import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const userRoleFindManyMock = vi.fn();
const shipmentFindUniqueMock = vi.fn();
const shipmentUpdateManyMock = vi.fn();
const trackingEventCreateMock = vi.fn();
const auditLogCreateMock = vi.fn();
const transactionMock = vi.fn();
const notifyDropoffRejectedMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    userRole: { findMany: (...args: unknown[]) => userRoleFindManyMock(...args) },
    shipment: {
      findUnique: (...args: unknown[]) => shipmentFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => shipmentUpdateManyMock(...args),
    },
    trackingEvent: { create: (...args: unknown[]) => trackingEventCreateMock(...args) },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

vi.mock('../services/fulfilmentNotifications', () => ({
  notifyDropoffRejected: (...args: unknown[]) => notifyDropoffRejectedMock(...args),
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const AGENT_ID = 'agent-1';
const HARARE_ID = '11111111-1111-4111-8111-111111111111';
const BULAWAYO_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: AGENT_ID } }, error: null });
  userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_AGENT', hubId: HARARE_ID }]);
  shipmentUpdateManyMock.mockResolvedValue({ count: 1 });
  trackingEventCreateMock.mockResolvedValue({});
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      shipment: { updateMany: (...args: unknown[]) => shipmentUpdateManyMock(...args) },
      trackingEvent: { create: (...args: unknown[]) => trackingEventCreateMock(...args) },
    }),
  );
});

describe('GET /api/v1/fulfilment/hub-ops/shipments/search', () => {
  it('returns the shipment when the agent is assigned to its origin hub', async () => {
    shipmentFindUniqueMock.mockResolvedValue({
      id: 'shipment-1',
      reference: 'FF-HRE-000001',
      status: 'AWAITING_DROPOFF',
      buyerName: 'Tendai Moyo',
      buyerContact: '+263771234567',
      category: 'Electronics',
      description: null,
      declaredValue: { toString: () => '100' },
      sizeTier: 'MEDIUM',
      originHubId: HARARE_ID,
      destinationHubId: BULAWAYO_ID,
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/fulfilment/hub-ops/shipments/search')
      .query({ reference: 'FF-HRE-000001' })
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.reference).toBe('FF-HRE-000001');
  });

  it('403s when the agent is not assigned to the shipment origin hub', async () => {
    shipmentFindUniqueMock.mockResolvedValue({
      id: 'shipment-1',
      reference: 'FF-BUL-000001',
      status: 'AWAITING_DROPOFF',
      originHubId: BULAWAYO_ID,
      destinationHubId: HARARE_ID,
      declaredValue: { toString: () => '100' },
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/fulfilment/hub-ops/shipments/search')
      .query({ reference: 'FF-BUL-000001' })
      .set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });

  it('404s when no shipment matches the reference', async () => {
    shipmentFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/fulfilment/hub-ops/shipments/search')
      .query({ reference: 'FF-HRE-999999' })
      .set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  it('400s when reference is missing', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/hub-ops/shipments/search').set(AUTH_HEADER);

    expect(res.status).toBe(400);
  });

  it('403s when the caller has no hub-scoped role', async () => {
    userRoleFindManyMock.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/fulfilment/hub-ops/shipments/search')
      .query({ reference: 'FF-HRE-000001' })
      .set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/fulfilment/hub-ops/shipments/:id/accept-dropoff', () => {
  it('accepts a drop-off from AWAITING_DROPOFF', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'AWAITING_DROPOFF', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/accept-dropoff').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RECEIVED_AT_ORIGIN');
    expect(trackingEventCreateMock).toHaveBeenCalledWith({
      data: {
        shipmentId: 'shipment-1',
        fromStatus: 'AWAITING_DROPOFF',
        toStatus: 'RECEIVED_AT_ORIGIN',
        actorUserId: AGENT_ID,
        hubId: HARARE_ID,
      },
    });
  });

  it('accepts a drop-off from DROPOFF_OVERDUE', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'DROPOFF_OVERDUE', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/accept-dropoff').set(AUTH_HEADER);

    expect(res.status).toBe(200);
  });

  it('409s (invalid-source-status) when the shipment is not awaiting drop-off', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'DRAFT', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/accept-dropoff').set(AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('403s (assignment-mismatch) when the agent is assigned to a different hub', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'AWAITING_DROPOFF', originHubId: BULAWAYO_ID });

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/accept-dropoff').set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('404s for a nonexistent shipment', async () => {
    shipmentFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/accept-dropoff').set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  it('409s when two simultaneous accepts race — only one succeeds', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'AWAITING_DROPOFF', originHubId: HARARE_ID });
    shipmentUpdateManyMock.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const app = createApp();
    const [first, second] = await Promise.all([
      request(app).post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/accept-dropoff').set(AUTH_HEADER),
      request(app).post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/accept-dropoff').set(AUTH_HEADER),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });
});

describe('POST /api/v1/fulfilment/hub-ops/shipments/:id/reject-dropoff', () => {
  it('rejects a drop-off with a reason and notifies the seller', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'AWAITING_DROPOFF', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/reject-dropoff')
      .set(AUTH_HEADER)
      .send({ reason: 'Parcel arrived already damaged' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED_AT_ORIGIN');
    expect(trackingEventCreateMock).toHaveBeenCalledWith({
      data: {
        shipmentId: 'shipment-1',
        fromStatus: 'AWAITING_DROPOFF',
        toStatus: 'REJECTED_AT_ORIGIN',
        actorUserId: AGENT_ID,
        hubId: HARARE_ID,
        notes: 'Parcel arrived already damaged',
      },
    });
    expect(notifyDropoffRejectedMock).toHaveBeenCalledWith('shipment-1', 'Parcel arrived already damaged');
  });

  it('rejects a drop-off from DROPOFF_OVERDUE', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'DROPOFF_OVERDUE', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/reject-dropoff')
      .set(AUTH_HEADER)
      .send({ reason: 'Wrong parcel' });

    expect(res.status).toBe(200);
  });

  it('400s (reason-required) when no reason is given', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'AWAITING_DROPOFF', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/reject-dropoff').set(AUTH_HEADER).send({});

    expect(res.status).toBe(400);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
    expect(notifyDropoffRejectedMock).not.toHaveBeenCalled();
  });

  it('400s (reason-required) when the reason is an empty string', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'AWAITING_DROPOFF', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/reject-dropoff')
      .set(AUTH_HEADER)
      .send({ reason: '   ' });

    expect(res.status).toBe(400);
  });

  it('409s (invalid-source-status) when the shipment is not awaiting drop-off', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'COLLECTED', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/reject-dropoff')
      .set(AUTH_HEADER)
      .send({ reason: 'Too late' });

    expect(res.status).toBe(409);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('403s (assignment-mismatch) when the agent is assigned to a different hub', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'AWAITING_DROPOFF', originHubId: BULAWAYO_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/reject-dropoff')
      .set(AUTH_HEADER)
      .send({ reason: 'Not mine to reject' });

    expect(res.status).toBe(403);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('404s for a nonexistent shipment', async () => {
    shipmentFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/reject-dropoff')
      .set(AUTH_HEADER)
      .send({ reason: 'Does not exist' });

    expect(res.status).toBe(404);
  });
});
