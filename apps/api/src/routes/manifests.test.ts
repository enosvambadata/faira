import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const userRoleFindManyMock = vi.fn();
const auditLogCreateMock = vi.fn();
const transactionMock = vi.fn();

const manifestFindUniqueMock = vi.fn();
const manifestFindFirstMock = vi.fn();
const manifestCreateMock = vi.fn();
const manifestUpdateMock = vi.fn();

const runFindUniqueMock = vi.fn();
const shipmentFindUniqueMock = vi.fn();
const shipmentUpdateManyMock = vi.fn();
const trackingEventCreateMock = vi.fn();

const manifestParcelFindUniqueMock = vi.fn();
const manifestParcelFindFirstMock = vi.fn();
const manifestParcelFindManyMock = vi.fn();
const manifestParcelCreateMock = vi.fn();
const manifestParcelDeleteMock = vi.fn();
const manifestParcelUpdateMock = vi.fn();
const manifestParcelCountMock = vi.fn();
const runUpdateManyMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    userRole: { findMany: (...args: unknown[]) => userRoleFindManyMock(...args) },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    transportManifest: {
      findUnique: (...args: unknown[]) => manifestFindUniqueMock(...args),
      findFirst: (...args: unknown[]) => manifestFindFirstMock(...args),
      create: (...args: unknown[]) => manifestCreateMock(...args),
      update: (...args: unknown[]) => manifestUpdateMock(...args),
    },
    transportRun: {
      findUnique: (...args: unknown[]) => runFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => runUpdateManyMock(...args),
    },
    shipment: {
      findUnique: (...args: unknown[]) => shipmentFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => shipmentUpdateManyMock(...args),
    },
    trackingEvent: { create: (...args: unknown[]) => trackingEventCreateMock(...args) },
    manifestParcel: {
      findUnique: (...args: unknown[]) => manifestParcelFindUniqueMock(...args),
      findFirst: (...args: unknown[]) => manifestParcelFindFirstMock(...args),
      findMany: (...args: unknown[]) => manifestParcelFindManyMock(...args),
      create: (...args: unknown[]) => manifestParcelCreateMock(...args),
      delete: (...args: unknown[]) => manifestParcelDeleteMock(...args),
      update: (...args: unknown[]) => manifestParcelUpdateMock(...args),
      count: (...args: unknown[]) => manifestParcelCountMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const SUPERVISOR_ID = 'supervisor-1';
const HARARE_ID = '11111111-1111-4111-8111-111111111111';
const BULAWAYO_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';
const SHIPMENT_ID = '44444444-4444-4444-8444-444444444444';

const ROUTE = { id: 'route-1', originHubId: HARARE_ID, destinationHubId: BULAWAYO_ID };
const RUN = { id: RUN_ID, routeId: 'route-1', route: ROUTE, vehicleReference: 'TRK-1', scheduledDeparture: new Date('2026-08-01T08:00:00Z') };

const OPEN_MANIFEST = { id: 'manifest-1', runId: RUN_ID, run: RUN, status: 'OPEN', finalizedAt: null, finalizedById: null, createdAt: new Date() };
const FINALIZED_MANIFEST = { ...OPEN_MANIFEST, status: 'FINALIZED', finalizedAt: new Date(), finalizedById: SUPERVISOR_ID };

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: SUPERVISOR_ID } }, error: null });
  userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_SUPERVISOR', hubId: HARARE_ID }]);
  auditLogCreateMock.mockResolvedValue({});
  shipmentUpdateManyMock.mockResolvedValue({ count: 1 });
  trackingEventCreateMock.mockResolvedValue({});
  manifestParcelCreateMock.mockResolvedValue({});
  manifestParcelDeleteMock.mockResolvedValue({});
  manifestParcelUpdateMock.mockResolvedValue({});
  manifestParcelCountMock.mockResolvedValue(0);
  runUpdateManyMock.mockResolvedValue({ count: 1 });
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      shipment: { updateMany: (...args: unknown[]) => shipmentUpdateManyMock(...args) },
      trackingEvent: { create: (...args: unknown[]) => trackingEventCreateMock(...args) },
      manifestParcel: {
        create: (...args: unknown[]) => manifestParcelCreateMock(...args),
        delete: (...args: unknown[]) => manifestParcelDeleteMock(...args),
        update: (...args: unknown[]) => manifestParcelUpdateMock(...args),
      },
    }),
  );
});

describe('POST /api/v1/fulfilment/manifests', () => {
  it('creates a manifest for a run at the supervisor\'s hub', async () => {
    runFindUniqueMock.mockResolvedValue(RUN);
    manifestFindFirstMock.mockResolvedValue(null);
    manifestCreateMock.mockResolvedValue(OPEN_MANIFEST);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/manifests').set(AUTH_HEADER).send({ runId: RUN_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('OPEN');
  });

  it('409s when the run already has an open manifest', async () => {
    runFindUniqueMock.mockResolvedValue(RUN);
    manifestFindFirstMock.mockResolvedValue(OPEN_MANIFEST);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/manifests').set(AUTH_HEADER).send({ runId: RUN_ID });

    expect(res.status).toBe(409);
    expect(manifestCreateMock).not.toHaveBeenCalled();
  });

  it('409s (returning the existing manifest id) when the run already has a FINALIZED manifest', async () => {
    // A run should only ever have one manifest -- re-picking an
    // already-dispatched run (e.g. to scan parcels out) must surface the
    // existing finalized manifest, not silently create a second, empty one.
    runFindUniqueMock.mockResolvedValue(RUN);
    manifestFindFirstMock.mockResolvedValue(FINALIZED_MANIFEST);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/manifests').set(AUTH_HEADER).send({ runId: RUN_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.details.manifestId).toBe(FINALIZED_MANIFEST.id);
    expect(manifestCreateMock).not.toHaveBeenCalled();
  });

  it('404s when the run does not exist', async () => {
    runFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/manifests').set(AUTH_HEADER).send({ runId: RUN_ID });

    expect(res.status).toBe(404);
  });

  it('403s (wrong-hub) when the supervisor is assigned to a different hub', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_SUPERVISOR', hubId: BULAWAYO_ID }]);
    runFindUniqueMock.mockResolvedValue(RUN);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/manifests').set(AUTH_HEADER).send({ runId: RUN_ID });

    expect(res.status).toBe(403);
    expect(manifestCreateMock).not.toHaveBeenCalled();
  });

  it('403s (wrong-role) for a Hub Agent', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_AGENT', hubId: HARARE_ID }]);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/manifests').set(AUTH_HEADER).send({ runId: RUN_ID });

    expect(res.status).toBe(403);
    expect(manifestCreateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/fulfilment/manifests/:id', () => {
  it('returns the manifest with its parcels', async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);
    manifestParcelFindManyMock.mockResolvedValue([
      {
        shipmentId: SHIPMENT_ID,
        shipment: { reference: 'FF-HRE-000001', destinationHubId: BULAWAYO_ID, sizeTier: 'MEDIUM', status: 'ASSIGNED_TO_RUN' },
        scannedOutAt: null,
        scannedInAt: null,
        shortShipped: false,
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/manifests/manifest-1').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.parcels).toHaveLength(1);
    expect(res.body.data.parcels[0].reference).toBe('FF-HRE-000001');
  });

  it('404s for a nonexistent manifest', async () => {
    manifestFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/manifests/manifest-1').set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/fulfilment/manifests/:id/parcels', () => {
  const SEALED_SHIPMENT = { id: SHIPMENT_ID, status: 'SEALED', originHubId: HARARE_ID, destinationHubId: BULAWAYO_ID };

  it('assigns a sealed shipment, cascading SEALED -> AWAITING_DISPATCH -> ASSIGNED_TO_RUN', async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);
    runFindUniqueMock.mockResolvedValue(RUN);
    shipmentFindUniqueMock.mockResolvedValue(SEALED_SHIPMENT);
    manifestParcelFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/parcels')
      .set(AUTH_HEADER)
      .send({ shipmentId: SHIPMENT_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ASSIGNED_TO_RUN');
    expect(trackingEventCreateMock).toHaveBeenCalledTimes(2);
    expect(trackingEventCreateMock).toHaveBeenNthCalledWith(1, {
      data: { shipmentId: SHIPMENT_ID, fromStatus: 'SEALED', toStatus: 'AWAITING_DISPATCH', actorUserId: SUPERVISOR_ID, hubId: HARARE_ID },
    });
    expect(trackingEventCreateMock).toHaveBeenNthCalledWith(2, {
      data: { shipmentId: SHIPMENT_ID, fromStatus: 'AWAITING_DISPATCH', toStatus: 'ASSIGNED_TO_RUN', actorUserId: SUPERVISOR_ID, hubId: HARARE_ID },
    });
    expect(manifestParcelCreateMock).toHaveBeenCalledWith({ data: { manifestId: 'manifest-1', shipmentId: SHIPMENT_ID } });
  });

  it('409s (only sealed parcels) when the shipment is not sealed', async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);
    runFindUniqueMock.mockResolvedValue(RUN);
    shipmentFindUniqueMock.mockResolvedValue({ ...SEALED_SHIPMENT, status: 'AWAITING_DROPOFF' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/parcels')
      .set(AUTH_HEADER)
      .send({ shipmentId: SHIPMENT_ID });

    expect(res.status).toBe(409);
    expect(manifestParcelCreateMock).not.toHaveBeenCalled();
  });

  it("400s when the shipment's route does not match the run's route", async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);
    runFindUniqueMock.mockResolvedValue(RUN);
    shipmentFindUniqueMock.mockResolvedValue({ ...SEALED_SHIPMENT, destinationHubId: HARARE_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/parcels')
      .set(AUTH_HEADER)
      .send({ shipmentId: SHIPMENT_ID });

    expect(res.status).toBe(400);
    expect(manifestParcelCreateMock).not.toHaveBeenCalled();
  });

  it('409s when the shipment is already assigned to a manifest', async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);
    runFindUniqueMock.mockResolvedValue(RUN);
    shipmentFindUniqueMock.mockResolvedValue(SEALED_SHIPMENT);
    manifestParcelFindUniqueMock.mockResolvedValue({ id: 'existing-mp', manifestId: 'other-manifest', shipmentId: SHIPMENT_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/parcels')
      .set(AUTH_HEADER)
      .send({ shipmentId: SHIPMENT_ID });

    expect(res.status).toBe(409);
    expect(manifestParcelCreateMock).not.toHaveBeenCalled();
  });

  it('409s (edit-after-finalization) when the manifest is already finalized', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/parcels')
      .set(AUTH_HEADER)
      .send({ shipmentId: SHIPMENT_ID });

    expect(res.status).toBe(409);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
    expect(manifestParcelCreateMock).not.toHaveBeenCalled();
  });

  it('404s for a nonexistent shipment', async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);
    runFindUniqueMock.mockResolvedValue(RUN);
    shipmentFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/parcels')
      .set(AUTH_HEADER)
      .send({ shipmentId: SHIPMENT_ID });

    expect(res.status).toBe(404);
  });

  it('403s (wrong-hub) when the supervisor is assigned to a different hub', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_SUPERVISOR', hubId: BULAWAYO_ID }]);
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/parcels')
      .set(AUTH_HEADER)
      .send({ shipmentId: SHIPMENT_ID });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/fulfilment/manifests/:id/parcels/:shipmentId', () => {
  it('removes a parcel, reverting ASSIGNED_TO_RUN -> AWAITING_DISPATCH', async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);
    manifestParcelFindFirstMock.mockResolvedValue({ id: 'mp-1', manifestId: 'manifest-1', shipmentId: SHIPMENT_ID });

    const app = createApp();
    const res = await request(app).delete(`/api/v1/fulfilment/manifests/manifest-1/parcels/${SHIPMENT_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(204);
    expect(shipmentUpdateManyMock).toHaveBeenCalledWith({
      where: { id: SHIPMENT_ID, status: 'ASSIGNED_TO_RUN' },
      data: { status: 'AWAITING_DISPATCH' },
    });
    expect(manifestParcelDeleteMock).toHaveBeenCalledWith({ where: { id: 'mp-1' } });
  });

  it('409s (edit-after-finalization) when the manifest is already finalized', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);

    const app = createApp();
    const res = await request(app).delete(`/api/v1/fulfilment/manifests/manifest-1/parcels/${SHIPMENT_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(manifestParcelDeleteMock).not.toHaveBeenCalled();
  });

  it('404s when the shipment is not on this manifest', async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);
    manifestParcelFindFirstMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).delete(`/api/v1/fulfilment/manifests/manifest-1/parcels/${SHIPMENT_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/fulfilment/manifests/:id/finalize', () => {
  it('finalizes an open manifest', async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);
    manifestUpdateMock.mockResolvedValue(FINALIZED_MANIFEST);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/manifests/manifest-1/finalize').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FINALIZED');
    expect(manifestUpdateMock).toHaveBeenCalledWith({
      where: { id: 'manifest-1' },
      data: { status: 'FINALIZED', finalizedAt: expect.any(Date), finalizedById: SUPERVISOR_ID },
    });
  });

  it('409s when already finalized', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/manifests/manifest-1/finalize').set(AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(manifestUpdateMock).not.toHaveBeenCalled();
  });

  it('403s (wrong-role) for a Hub Agent', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_AGENT', hubId: HARARE_ID }]);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/manifests/manifest-1/finalize').set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(manifestUpdateMock).not.toHaveBeenCalled();
  });

  it('403s (wrong-hub) when the supervisor is assigned to a different hub', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_SUPERVISOR', hubId: BULAWAYO_ID }]);
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/manifests/manifest-1/finalize').set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(manifestUpdateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/fulfilment/manifests/:id/document', () => {
  it('returns a plain-text manifest document listing its parcels', async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);
    runFindUniqueMock.mockResolvedValue({
      ...RUN,
      route: { ...ROUTE, originHub: { name: 'Faira Harare Hub' }, destinationHub: { name: 'Faira Bulawayo Hub' } },
    });
    manifestParcelFindManyMock.mockResolvedValue([
      { shipment: { reference: 'FF-HRE-000001', sizeTier: 'MEDIUM' } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/manifests/manifest-1/document').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    const body = Buffer.isBuffer(res.body) ? res.body.toString('utf-8') : res.text;
    expect(body).toContain('FF-HRE-000001');
    expect(body).toContain('Faira Harare Hub');
    expect(body).toContain('Faira Bulawayo Hub');
  });
});

const ASSIGNED_SHIPMENT = { id: SHIPMENT_ID, reference: 'FF-HRE-000001', status: 'ASSIGNED_TO_RUN', originHubId: HARARE_ID };
const MANIFEST_PARCEL_PENDING = { id: 'mp-1', manifestId: 'manifest-1', shipmentId: SHIPMENT_ID, scannedOutAt: null, shortShipped: false };

describe('POST /api/v1/fulfilment/manifests/:id/scan-out', () => {
  beforeEach(() => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_AGENT', hubId: HARARE_ID }]);
  });

  it('scans out an assigned parcel, transitioning ASSIGNED_TO_RUN -> DISPATCHED', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);
    shipmentFindUniqueMock.mockResolvedValue(ASSIGNED_SHIPMENT);
    manifestParcelFindFirstMock.mockResolvedValue(MANIFEST_PARCEL_PENDING);
    manifestParcelCountMock.mockResolvedValue(2); // other parcels still pending -- run should not depart yet

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/scan-out')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DISPATCHED');
    expect(res.body.data.runDeparted).toBe(false);
    expect(shipmentUpdateManyMock).toHaveBeenCalledWith({
      where: { id: SHIPMENT_ID, status: 'ASSIGNED_TO_RUN' },
      data: { status: 'DISPATCHED' },
    });
    expect(manifestParcelUpdateMock).toHaveBeenCalledWith({ where: { id: 'mp-1' }, data: { scannedOutAt: expect.any(Date) } });
    expect(runUpdateManyMock).not.toHaveBeenCalled();
  });

  it('marks the run departed once every parcel is scanned or short-shipped', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);
    shipmentFindUniqueMock.mockResolvedValue(ASSIGNED_SHIPMENT);
    manifestParcelFindFirstMock.mockResolvedValue(MANIFEST_PARCEL_PENDING);
    manifestParcelCountMock.mockResolvedValue(0); // this was the last one

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/scan-out')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001' });

    expect(res.status).toBe(200);
    expect(res.body.data.runDeparted).toBe(true);
    expect(runUpdateManyMock).toHaveBeenCalledWith({
      where: { id: RUN_ID, status: 'SCHEDULED' },
      data: { status: 'DEPARTED', actualDeparture: expect.any(Date) },
    });
  });

  it('404s (not-on-manifest) when the parcel is not on this manifest', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);
    shipmentFindUniqueMock.mockResolvedValue(ASSIGNED_SHIPMENT);
    manifestParcelFindFirstMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/scan-out')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_ON_MANIFEST');
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s when the manifest is not finalized yet', async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/scan-out')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001' });

    expect(res.status).toBe(409);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s (already-scanned) when the parcel was already scanned out', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);
    shipmentFindUniqueMock.mockResolvedValue(ASSIGNED_SHIPMENT);
    manifestParcelFindFirstMock.mockResolvedValue({ ...MANIFEST_PARCEL_PENDING, scannedOutAt: new Date() });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/scan-out')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_SCANNED');
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s when the parcel was marked short-shipped', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);
    shipmentFindUniqueMock.mockResolvedValue(ASSIGNED_SHIPMENT);
    manifestParcelFindFirstMock.mockResolvedValue({ ...MANIFEST_PARCEL_PENDING, shortShipped: true });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/scan-out')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001' });

    expect(res.status).toBe(409);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('404s when the reference does not match any shipment', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);
    shipmentFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/scan-out')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-999999' });

    expect(res.status).toBe(404);
  });

  it('403s (wrong-hub) when the agent is assigned to a different hub', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_AGENT', hubId: BULAWAYO_ID }]);
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/scan-out')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001' });

    expect(res.status).toBe(403);
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s when two simultaneous scans race -- only one succeeds', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);
    shipmentFindUniqueMock.mockResolvedValue(ASSIGNED_SHIPMENT);
    manifestParcelFindFirstMock.mockResolvedValue(MANIFEST_PARCEL_PENDING);
    shipmentUpdateManyMock.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const app = createApp();
    const [first, second] = await Promise.all([
      request(app).post('/api/v1/fulfilment/manifests/manifest-1/scan-out').set(AUTH_HEADER).send({ reference: 'FF-HRE-000001' }),
      request(app).post('/api/v1/fulfilment/manifests/manifest-1/scan-out').set(AUTH_HEADER).send({ reference: 'FF-HRE-000001' }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });
});

describe('POST /api/v1/fulfilment/manifests/:id/short-ship', () => {
  beforeEach(() => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_AGENT', hubId: HARARE_ID }]);
  });

  it('marks a parcel short-shipped without changing the shipment status', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);
    shipmentFindUniqueMock.mockResolvedValue(ASSIGNED_SHIPMENT);
    manifestParcelFindFirstMock.mockResolvedValue(MANIFEST_PARCEL_PENDING);
    manifestParcelCountMock.mockResolvedValue(0);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/short-ship')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001', reason: 'Not at the hub, presumed lost in inspection queue' });

    expect(res.status).toBe(200);
    expect(res.body.data.shortShipped).toBe(true);
    expect(res.body.data.runDeparted).toBe(true);
    expect(manifestParcelUpdateMock).toHaveBeenCalledWith({ where: { id: 'mp-1' }, data: { shortShipped: true } });
    expect(shipmentUpdateManyMock).not.toHaveBeenCalled();
  });

  it('400s when no reason is given', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/short-ship')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001' });

    expect(res.status).toBe(400);
    expect(manifestParcelUpdateMock).not.toHaveBeenCalled();
  });

  it('409s (not-on-manifest -> already-scanned) when the parcel was already scanned out', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);
    shipmentFindUniqueMock.mockResolvedValue(ASSIGNED_SHIPMENT);
    manifestParcelFindFirstMock.mockResolvedValue({ ...MANIFEST_PARCEL_PENDING, scannedOutAt: new Date() });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/short-ship')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001', reason: 'Too late' });

    expect(res.status).toBe(409);
    expect(manifestParcelUpdateMock).not.toHaveBeenCalled();
  });

  it('409s when already marked short-shipped', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);
    shipmentFindUniqueMock.mockResolvedValue(ASSIGNED_SHIPMENT);
    manifestParcelFindFirstMock.mockResolvedValue({ ...MANIFEST_PARCEL_PENDING, shortShipped: true });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/short-ship')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001', reason: 'Already flagged' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_SHORT_SHIPPED');
  });

  it('404s (not-on-manifest) when the parcel is not on this manifest', async () => {
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);
    shipmentFindUniqueMock.mockResolvedValue(ASSIGNED_SHIPMENT);
    manifestParcelFindFirstMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/short-ship')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001', reason: 'Missing' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_ON_MANIFEST');
  });

  it('409s when the manifest is not finalized yet', async () => {
    manifestFindUniqueMock.mockResolvedValue(OPEN_MANIFEST);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/short-ship')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001', reason: 'Too early' });

    expect(res.status).toBe(409);
    expect(manifestParcelUpdateMock).not.toHaveBeenCalled();
  });

  it('403s (wrong-hub) when the agent is assigned to a different hub', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_AGENT', hubId: BULAWAYO_ID }]);
    manifestFindUniqueMock.mockResolvedValue(FINALIZED_MANIFEST);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/manifests/manifest-1/short-ship')
      .set(AUTH_HEADER)
      .send({ reference: 'FF-HRE-000001', reason: 'Wrong hub' });

    expect(res.status).toBe(403);
    expect(manifestParcelUpdateMock).not.toHaveBeenCalled();
  });
});
