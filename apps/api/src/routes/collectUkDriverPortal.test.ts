import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const driverFindUniqueMock = vi.fn();
const routeFindManyMock = vi.fn();
const routeFindUniqueMock = vi.fn();
const routeUpdateManyMock = vi.fn();
const stopFindUniqueMock = vi.fn();
const stopUpdateManyMock = vi.fn();
const stopCountMock = vi.fn();
const bookingUpdateManyMock = vi.fn();
const auditLogCreateMock = vi.fn();
const transactionMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    collectUkDriver: { findUnique: (...args: unknown[]) => driverFindUniqueMock(...args) },
    collectUkCollectionRoute: {
      findMany: (...args: unknown[]) => routeFindManyMock(...args),
      findUnique: (...args: unknown[]) => routeFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => routeUpdateManyMock(...args),
    },
    collectUkCollectionStop: {
      findUnique: (...args: unknown[]) => stopFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => stopUpdateManyMock(...args),
      count: (...args: unknown[]) => stopCountMock(...args),
    },
    collectUkCollectionBooking: { updateMany: (...args: unknown[]) => bookingUpdateManyMock(...args) },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

vi.mock('../lib/cloudinary', () => ({
  signCollectUkProofUpload: () => ({
    signature: 'sig',
    timestamp: 123,
    apiKey: 'key',
    cloudName: 'cloud',
    folder: 'collect-uk-proof',
    transformation: 'w_1600,h_1600,c_limit',
    type: 'authenticated',
  }),
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const USER_ID = 'user-1';
const DRIVER_ID = '11111111-1111-4111-8111-111111111111';
const ROUTE_ID = '22222222-2222-4222-8222-222222222222';
const STOP_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';

const DRIVER = { id: DRIVER_ID, userId: USER_ID, vehicleReference: 'VAN-1', capacityParcels: 20, status: 'ACTIVE' };
const STOP = { id: STOP_ID, routeId: ROUTE_ID, bookingId: BOOKING_ID, driverId: DRIVER_ID, sequenceOrder: 0, status: 'PENDING' };
const ROUTE = { id: ROUTE_ID, driverId: DRIVER_ID, routeDate: new Date('2026-08-01'), status: 'PLANNED' };

function txStub() {
  return {
    collectUkCollectionStop: {
      updateMany: (...args: unknown[]) => stopUpdateManyMock(...args),
      count: (...args: unknown[]) => stopCountMock(...args),
    },
    collectUkCollectionBooking: { updateMany: (...args: unknown[]) => bookingUpdateManyMock(...args) },
    collectUkCollectionRoute: {
      findUnique: (...args: unknown[]) => routeFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => routeUpdateManyMock(...args),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  driverFindUniqueMock.mockResolvedValue(DRIVER);
  routeFindManyMock.mockResolvedValue([ROUTE]);
  routeFindUniqueMock.mockResolvedValue(ROUTE);
  routeUpdateManyMock.mockResolvedValue({ count: 1 });
  stopFindUniqueMock.mockResolvedValue(STOP);
  stopUpdateManyMock.mockResolvedValue({ count: 1 });
  stopCountMock.mockResolvedValue(0);
  bookingUpdateManyMock.mockResolvedValue({ count: 1 });
  auditLogCreateMock.mockResolvedValue({});
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(txStub()));
});

describe('GET /api/v1/collect-uk/driver/me', () => {
  it("returns the caller's driver profile", async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/driver/me').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(DRIVER_ID);
  });

  it('403s when the caller has no driver profile', async () => {
    driverFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/driver/me').set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/collect-uk/driver/routes', () => {
  it("lists the driver's own routes", async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/driver/routes').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(routeFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { driverId: DRIVER_ID } }));
  });
});

describe('GET /api/v1/collect-uk/driver/routes/:id', () => {
  it('returns the route with ordered stops for the owning driver', async () => {
    routeFindUniqueMock.mockResolvedValue({
      ...ROUTE,
      stops: [
        {
          id: STOP_ID,
          sequenceOrder: 0,
          status: 'PENDING',
          bookingId: BOOKING_ID,
          booking: {
            reference: 'FC-abc-000001',
            customerName: 'Jane Customer',
            customerContact: '+447700900000',
            collectionAddress: '10 Test St',
            collectionPostcode: 'E1 6AN',
            destinationCountry: 'Zimbabwe',
            parcelSizeTier: 'MEDIUM',
            specialInstructions: null,
            company: { name: 'ABC Logistics' },
          },
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/driver/routes/${ROUTE_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.stops).toHaveLength(1);
    expect(res.body.data.stops[0].customerContact).toBe('+447700900000');
  });

  it("404s for another driver's route", async () => {
    routeFindUniqueMock.mockResolvedValue({ ...ROUTE, driverId: 'someone-elses-driver-id', stops: [] });

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/driver/routes/${ROUTE_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  it('404s for a nonexistent route', async () => {
    routeFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/driver/routes/${ROUTE_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/collect-uk/driver/stops/:id/collect', () => {
  it('marks the stop collected and the booking COLLECTED', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/collect`)
      .set(AUTH_HEADER)
      .send({ proofPhotoUrl: 'collect-uk-proof/abc123' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COLLECTED');
    expect(stopUpdateManyMock).toHaveBeenCalledWith({
      where: { id: STOP_ID, status: 'PENDING' },
      data: { status: 'COLLECTED', proofPhotoUrl: 'collect-uk-proof/abc123', signatureUrl: undefined, completedAt: expect.any(Date) },
    });
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: BOOKING_ID, status: { in: ['DRIVER_ASSIGNED', 'EN_ROUTE'] } },
      data: { status: 'COLLECTED' },
    });
  });

  it('works without a proof photo (optional)', async () => {
    const app = createApp();
    const res = await request(app).post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/collect`).set(AUTH_HEADER).send({});

    expect(res.status).toBe(200);
  });

  it("404s trying to resolve another driver's stop", async () => {
    stopFindUniqueMock.mockResolvedValue({ ...STOP, driverId: 'someone-elses-driver-id' });

    const app = createApp();
    const res = await request(app).post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/collect`).set(AUTH_HEADER).send({});

    expect(res.status).toBe(404);
    expect(stopUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s when the stop has already been resolved', async () => {
    stopFindUniqueMock.mockResolvedValue({ ...STOP, status: 'COLLECTED' });

    const app = createApp();
    const res = await request(app).post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/collect`).set(AUTH_HEADER).send({});

    expect(res.status).toBe(409);
    expect(stopUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s when two simultaneous collect attempts race -- only one succeeds', async () => {
    stopUpdateManyMock.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const app = createApp();
    const [first, second] = await Promise.all([
      request(app).post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/collect`).set(AUTH_HEADER).send({}),
      request(app).post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/collect`).set(AUTH_HEADER).send({}),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  it('advances the route to IN_PROGRESS on the first resolved stop', async () => {
    stopCountMock.mockResolvedValue(1); // still one other pending stop on the route

    const app = createApp();
    await request(app).post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/collect`).set(AUTH_HEADER).send({});

    expect(routeUpdateManyMock).toHaveBeenCalledWith({ where: { id: ROUTE_ID, status: 'PLANNED' }, data: { status: 'IN_PROGRESS' } });
    expect(routeUpdateManyMock).not.toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'COMPLETED' } }));
  });

  it('advances the route to COMPLETED once the last pending stop is resolved', async () => {
    routeFindUniqueMock.mockResolvedValue({ ...ROUTE, status: 'IN_PROGRESS' });
    stopCountMock.mockResolvedValue(0); // no more pending stops

    const app = createApp();
    await request(app).post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/collect`).set(AUTH_HEADER).send({});

    expect(routeUpdateManyMock).toHaveBeenCalledWith({ where: { id: ROUTE_ID, status: 'IN_PROGRESS' }, data: { status: 'COMPLETED' } });
  });
});

describe('POST /api/v1/collect-uk/driver/stops/:id/unable-to-collect', () => {
  it('marks the stop and booking UNABLE_TO_COLLECT with a reason', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/unable-to-collect`)
      .set(AUTH_HEADER)
      .send({ failureReason: 'No answer at the door' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNABLE_TO_COLLECT');
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: BOOKING_ID, status: { in: ['DRIVER_ASSIGNED', 'EN_ROUTE'] } },
      data: { status: 'UNABLE_TO_COLLECT' },
    });
  });

  it('400s without a reason', async () => {
    const app = createApp();
    const res = await request(app).post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/unable-to-collect`).set(AUTH_HEADER).send({});

    expect(res.status).toBe(400);
    expect(stopUpdateManyMock).not.toHaveBeenCalled();
  });

  it("404s trying to resolve another driver's stop", async () => {
    stopFindUniqueMock.mockResolvedValue({ ...STOP, driverId: 'someone-elses-driver-id' });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/unable-to-collect`)
      .set(AUTH_HEADER)
      .send({ failureReason: 'No answer' });

    expect(res.status).toBe(404);
  });

  it('409s when the stop has already been resolved', async () => {
    stopFindUniqueMock.mockResolvedValue({ ...STOP, status: 'UNABLE_TO_COLLECT' });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/unable-to-collect`)
      .set(AUTH_HEADER)
      .send({ failureReason: 'No answer' });

    expect(res.status).toBe(409);
  });
});
