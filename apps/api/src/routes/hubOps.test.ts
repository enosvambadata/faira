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
const parcelEvidenceCreateManyMock = vi.fn();
const parcelEvidenceCountMock = vi.fn();
const parcelSealCreateMock = vi.fn();
const signParcelEvidenceUploadMock = vi.fn();
const hubFindUniqueMock = vi.fn();

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
    parcelEvidence: {
      createMany: (...args: unknown[]) => parcelEvidenceCreateManyMock(...args),
      count: (...args: unknown[]) => parcelEvidenceCountMock(...args),
    },
    parcelSeal: { create: (...args: unknown[]) => parcelSealCreateMock(...args) },
    hub: { findUnique: (...args: unknown[]) => hubFindUniqueMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

vi.mock('../services/fulfilmentNotifications', () => ({
  notifyDropoffRejected: (...args: unknown[]) => notifyDropoffRejectedMock(...args),
}));

vi.mock('../lib/cloudinary', () => ({
  signParcelEvidenceUpload: (...args: unknown[]) => signParcelEvidenceUploadMock(...args),
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
  parcelEvidenceCreateManyMock.mockResolvedValue({ count: 1 });
  parcelEvidenceCountMock.mockResolvedValue(1);
  parcelSealCreateMock.mockResolvedValue({});
  signParcelEvidenceUploadMock.mockReturnValue({
    signature: 'sig',
    timestamp: 123,
    apiKey: 'key',
    cloudName: 'cloud',
    folder: 'parcel-evidence',
    transformation: 'w_1600,h_1600,c_limit',
    type: 'authenticated',
  });
  hubFindUniqueMock.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(
      where.id === HARARE_ID
        ? { id: HARARE_ID, name: 'Faira Harare Hub' }
        : where.id === BULAWAYO_ID
          ? { id: BULAWAYO_ID, name: 'Faira Bulawayo Hub' }
          : null,
    ),
  );
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      shipment: { updateMany: (...args: unknown[]) => shipmentUpdateManyMock(...args) },
      trackingEvent: { create: (...args: unknown[]) => trackingEventCreateMock(...args) },
      parcelEvidence: { createMany: (...args: unknown[]) => parcelEvidenceCreateManyMock(...args) },
      parcelSeal: { create: (...args: unknown[]) => parcelSealCreateMock(...args) },
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

describe('GET /api/v1/fulfilment/hub-ops/evidence-upload-params', () => {
  it('returns signed Cloudinary params for any hub-scoped caller', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/hub-ops/evidence-upload-params').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({ folder: 'parcel-evidence', type: 'authenticated' }),
    );
  });

  it('403s when the caller has no hub-scoped role', async () => {
    userRoleFindManyMock.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/hub-ops/evidence-upload-params').set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });
});

const VALID_INSPECT_BODY = {
  weightKg: 2.5,
  dimensions: '30x20x10cm',
  condition: 'GOOD',
  photoPublicIds: ['parcel-evidence/abc123'],
};

describe('POST /api/v1/fulfilment/hub-ops/shipments/:id/inspect', () => {
  it('records weight/dimensions/condition, stores evidence, and transitions to INSPECTED', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'RECEIVED_AT_ORIGIN', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/inspect')
      .set(AUTH_HEADER)
      .send(VALID_INSPECT_BODY);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('INSPECTED');
    expect(shipmentUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'shipment-1', status: 'RECEIVED_AT_ORIGIN' },
      data: { status: 'INSPECTED', weightKg: 2.5, dimensions: '30x20x10cm', condition: 'GOOD' },
    });
    expect(parcelEvidenceCreateManyMock).toHaveBeenCalledWith({
      data: [{ shipmentId: 'shipment-1', type: 'PARCEL_PHOTO', imageUrl: 'parcel-evidence/abc123', capturedById: AGENT_ID }],
    });
  });

  it('400s (missing-photo) when no photos are provided', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'RECEIVED_AT_ORIGIN', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/inspect')
      .set(AUTH_HEADER)
      .send({ ...VALID_INSPECT_BODY, photoPublicIds: [] });

    expect(res.status).toBe(400);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('400s when weight/dimensions/condition are missing', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'RECEIVED_AT_ORIGIN', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/inspect')
      .set(AUTH_HEADER)
      .send({ photoPublicIds: ['parcel-evidence/abc123'] });

    expect(res.status).toBe(400);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s when the shipment has not been received at this hub', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'AWAITING_DROPOFF', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/inspect')
      .set(AUTH_HEADER)
      .send(VALID_INSPECT_BODY);

    expect(res.status).toBe(409);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('403s (wrong-hub) when the agent is assigned to a different hub', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'RECEIVED_AT_ORIGIN', originHubId: BULAWAYO_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/inspect')
      .set(AUTH_HEADER)
      .send(VALID_INSPECT_BODY);

    expect(res.status).toBe(403);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('404s for a nonexistent shipment', async () => {
    shipmentFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/inspect')
      .set(AUTH_HEADER)
      .send(VALID_INSPECT_BODY);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/fulfilment/hub-ops/shipments/:id/seal', () => {
  it('applies a seal and transitions to SEALED', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'INSPECTED', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/seal')
      .set(AUTH_HEADER)
      .send({ sealNumber: 'SEAL-000123' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SEALED');
    expect(parcelSealCreateMock).toHaveBeenCalledWith({
      data: { shipmentId: 'shipment-1', sealNumber: 'SEAL-000123', appliedById: AGENT_ID },
    });
  });

  it('400s when no seal number is given', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'INSPECTED', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/seal').set(AUTH_HEADER).send({});

    expect(res.status).toBe(400);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s when the shipment has not been inspected yet', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'RECEIVED_AT_ORIGIN', originHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/seal')
      .set(AUTH_HEADER)
      .send({ sealNumber: 'SEAL-000123' });

    expect(res.status).toBe(409);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s (evidence required) when no photo evidence has been recorded for this shipment', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'INSPECTED', originHubId: HARARE_ID });
    parcelEvidenceCountMock.mockResolvedValue(0);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/seal')
      .set(AUTH_HEADER)
      .send({ sealNumber: 'SEAL-000123' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVIDENCE_REQUIRED');
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('403s (wrong-hub) when the agent is assigned to a different hub', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'INSPECTED', originHubId: BULAWAYO_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/seal')
      .set(AUTH_HEADER)
      .send({ sealNumber: 'SEAL-000123' });

    expect(res.status).toBe(403);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('404s for a nonexistent shipment', async () => {
    shipmentFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/seal')
      .set(AUTH_HEADER)
      .send({ sealNumber: 'SEAL-000123' });

    expect(res.status).toBe(404);
  });
});

describe('full happy path: accept -> inspect -> seal', () => {
  it('walks a shipment from AWAITING_DROPOFF through to SEALED', async () => {
    const app = createApp();

    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'AWAITING_DROPOFF', originHubId: HARARE_ID });
    const acceptRes = await request(app).post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/accept-dropoff').set(AUTH_HEADER);
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe('RECEIVED_AT_ORIGIN');

    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'RECEIVED_AT_ORIGIN', originHubId: HARARE_ID });
    const inspectRes = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/inspect')
      .set(AUTH_HEADER)
      .send(VALID_INSPECT_BODY);
    expect(inspectRes.status).toBe(200);
    expect(inspectRes.body.data.status).toBe('INSPECTED');

    shipmentFindUniqueMock.mockResolvedValue({ id: 'shipment-1', status: 'INSPECTED', originHubId: HARARE_ID });
    const sealRes = await request(app)
      .post('/api/v1/fulfilment/hub-ops/shipments/shipment-1/seal')
      .set(AUTH_HEADER)
      .send({ sealNumber: 'SEAL-000123' });
    expect(sealRes.status).toBe(200);
    expect(sealRes.body.data.status).toBe('SEALED');
  });
});

const SEALED_SHIPMENT = {
  id: 'shipment-1',
  status: 'SEALED',
  originHubId: HARARE_ID,
  destinationHubId: BULAWAYO_ID,
  reference: 'FF-HRE-000001',
  qrCodeUrl: 'data:image/png;base64,abc123',
  sizeTier: 'MEDIUM',
  declaredValue: { toString: () => '100.00' },
};

describe('GET /api/v1/fulfilment/hub-ops/shipments/:id/label', () => {
  it('returns an SVG label with the reference, QR, hubs, size, and value', async () => {
    shipmentFindUniqueMock.mockResolvedValue(SEALED_SHIPMENT);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/hub-ops/shipments/shipment-1/label').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
    const body = Buffer.isBuffer(res.body) ? res.body.toString('utf-8') : res.text;
    expect(body).toContain('FF-HRE-000001');
    expect(body).toContain('Faira Harare Hub');
    expect(body).toContain('Faira Bulawayo Hub');
    expect(body).toContain('MEDIUM');
  });

  it('logs every generation to AuditLog, including reprints', async () => {
    shipmentFindUniqueMock.mockResolvedValue(SEALED_SHIPMENT);

    const app = createApp();
    await request(app).get('/api/v1/fulfilment/hub-ops/shipments/shipment-1/label').set(AUTH_HEADER);
    await request(app).get('/api/v1/fulfilment/hub-ops/shipments/shipment-1/label').set(AUTH_HEADER);

    expect(auditLogCreateMock).toHaveBeenCalledTimes(2);
    expect(auditLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'FULFILMENT_LABEL_PRINTED',
        details: expect.objectContaining({ shipmentId: 'shipment-1', reference: 'FF-HRE-000001' }),
      }),
    });
  });

  it.each(['DRAFT', 'AWAITING_DROPOFF', 'RECEIVED_AT_ORIGIN', 'INSPECTED'])(
    '409s (not yet sealed) when the shipment is still %s',
    async status => {
      shipmentFindUniqueMock.mockResolvedValue({ ...SEALED_SHIPMENT, status });

      const app = createApp();
      const res = await request(app).get('/api/v1/fulfilment/hub-ops/shipments/shipment-1/label').set(AUTH_HEADER);

      expect(res.status).toBe(409);
      expect(auditLogCreateMock).not.toHaveBeenCalled();
    },
  );

  it('allows printing for statuses after SEALED too (e.g. DISPATCHED)', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ ...SEALED_SHIPMENT, status: 'DISPATCHED' });

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/hub-ops/shipments/shipment-1/label').set(AUTH_HEADER);

    expect(res.status).toBe(200);
  });

  it('403s (wrong-hub) when the agent is assigned to a different hub', async () => {
    shipmentFindUniqueMock.mockResolvedValue({ ...SEALED_SHIPMENT, originHubId: BULAWAYO_ID });

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/hub-ops/shipments/shipment-1/label').set(AUTH_HEADER);

    expect(res.status).toBe(403);
    // A denial IS logged (FULFILMENT_HUB_ASSIGNMENT_DENIED, from
    // loadAssignedShipment) -- just never the label-printed action.
    expect(auditLogCreateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'FULFILMENT_LABEL_PRINTED' }) }),
    );
  });

  it('404s for a nonexistent shipment', async () => {
    shipmentFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/hub-ops/shipments/shipment-1/label').set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});
