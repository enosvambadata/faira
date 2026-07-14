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
const stopFindManyMock = vi.fn();
const companyRoleFindFirstMock = vi.fn();
const driverCreateMock = vi.fn();
const vehicleDeleteManyMock = vi.fn();
const vehicleCreateManyMock = vi.fn();
const driverUpdateMock = vi.fn();
const notifyParcelCollectedMock = vi.fn();
const notifyUnableToCollectMock = vi.fn();
const notifyArrivedAtWarehouseMock = vi.fn();

vi.mock('../services/collectUkNotifications', () => ({
  notifyBookingConfirmed: vi.fn(),
  notifyCollectionScheduled: vi.fn(),
  notifyBookingCancelled: vi.fn(),
  notifyCollectionWillBeRescheduled: vi.fn(),
  notifyParcelCollected: (...args: unknown[]) => notifyParcelCollectedMock(...args),
  notifyUnableToCollect: (...args: unknown[]) => notifyUnableToCollectMock(...args),
  notifyArrivedAtWarehouse: (...args: unknown[]) => notifyArrivedAtWarehouseMock(...args),
  notifyHandedOver: vi.fn(),
}));
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
    collectUkDriver: {
      findUnique: (...args: unknown[]) => driverFindUniqueMock(...args),
      create: (...args: unknown[]) => driverCreateMock(...args),
      update: (...args: unknown[]) => driverUpdateMock(...args),
    },
    collectUkCollectionRoute: {
      findMany: (...args: unknown[]) => routeFindManyMock(...args),
      findUnique: (...args: unknown[]) => routeFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => routeUpdateManyMock(...args),
    },
    collectUkCollectionStop: {
      findUnique: (...args: unknown[]) => stopFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => stopUpdateManyMock(...args),
      count: (...args: unknown[]) => stopCountMock(...args),
      findMany: (...args: unknown[]) => stopFindManyMock(...args),
    },
    collectUkCollectionBooking: { updateMany: (...args: unknown[]) => bookingUpdateManyMock(...args) },
    collectUkCompanyRole: { findFirst: (...args: unknown[]) => companyRoleFindFirstMock(...args) },
    collectUkDriverVehicle: {
      deleteMany: (...args: unknown[]) => vehicleDeleteManyMock(...args),
      createMany: (...args: unknown[]) => vehicleCreateManyMock(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

vi.mock('../lib/cloudinary', () => ({
  signCollectUkDriverDocUpload: () => ({
    signature: 'sig',
    timestamp: 123,
    apiKey: 'key',
    cloudName: 'cloud',
    folder: 'collect-uk-driver-docs',
    transformation: 'w_2000,h_2000,c_limit',
    type: 'authenticated',
  }),
  getCollectUkDriverDocViewUrl: (id: string) => 'https://signed.example/' + id,
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
      findMany: (...args: unknown[]) => stopFindManyMock(...args),
    },
    collectUkCollectionBooking: { updateMany: (...args: unknown[]) => bookingUpdateManyMock(...args) },
    collectUkCollectionRoute: {
      findUnique: (...args: unknown[]) => routeFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => routeUpdateManyMock(...args),
    },
    collectUkDriver: {
      create: (...args: unknown[]) => driverCreateMock(...args),
      update: (...args: unknown[]) => driverUpdateMock(...args),
    },
    collectUkDriverVehicle: {
      deleteMany: (...args: unknown[]) => vehicleDeleteManyMock(...args),
      createMany: (...args: unknown[]) => vehicleCreateManyMock(...args),
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
  stopFindManyMock.mockResolvedValue([]);
  companyRoleFindFirstMock.mockResolvedValue(null);
  driverCreateMock.mockResolvedValue({ id: DRIVER_ID, status: 'APPLIED' });
  vehicleDeleteManyMock.mockResolvedValue({ count: 0 });
  vehicleCreateManyMock.mockResolvedValue({ count: 1 });
  driverUpdateMock.mockResolvedValue({ id: DRIVER_ID, status: 'APPLIED' });
  notifyParcelCollectedMock.mockResolvedValue(undefined);
  notifyUnableToCollectMock.mockResolvedValue(undefined);
  notifyArrivedAtWarehouseMock.mockResolvedValue(undefined);
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

  it('returns null (200) when the caller has never applied', async () => {
    driverFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/driver/me').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
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
    expect(notifyParcelCollectedMock).toHaveBeenCalledWith(BOOKING_ID);
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
    expect(notifyParcelCollectedMock).not.toHaveBeenCalled();
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

  it('bulk-transitions every COLLECTED booking on the route to AT_WAREHOUSE once the route completes', async () => {
    routeFindUniqueMock.mockResolvedValue({ ...ROUTE, status: 'IN_PROGRESS' });
    stopCountMock.mockResolvedValue(0); // no more pending stops
    routeUpdateManyMock.mockResolvedValue({ count: 1 }); // COMPLETED transition actually matched
    const otherBookingId = '55555555-5555-4555-8555-555555555555';
    stopFindManyMock.mockResolvedValue([{ bookingId: BOOKING_ID }, { bookingId: otherBookingId }]);

    const app = createApp();
    await request(app).post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/collect`).set(AUTH_HEADER).send({});

    expect(stopFindManyMock).toHaveBeenCalledWith({
      where: { routeId: ROUTE_ID, status: 'COLLECTED' },
      select: { bookingId: true },
    });
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: BOOKING_ID, status: 'COLLECTED' },
      data: { status: 'AT_WAREHOUSE' },
    });
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: otherBookingId, status: 'COLLECTED' },
      data: { status: 'AT_WAREHOUSE' },
    });
    expect(notifyArrivedAtWarehouseMock).toHaveBeenCalledWith(BOOKING_ID);
    expect(notifyArrivedAtWarehouseMock).toHaveBeenCalledWith(otherBookingId);
  });

  it('does not bulk-transition bookings when the route does not complete', async () => {
    stopCountMock.mockResolvedValue(1); // still a pending stop -- route stays IN_PROGRESS

    const app = createApp();
    await request(app).post(`/api/v1/collect-uk/driver/stops/${STOP_ID}/collect`).set(AUTH_HEADER).send({});

    expect(stopFindManyMock).not.toHaveBeenCalled();
    expect(notifyArrivedAtWarehouseMock).not.toHaveBeenCalled();
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
    expect(notifyUnableToCollectMock).toHaveBeenCalledWith(BOOKING_ID, 'No answer at the door');
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

describe('POST /api/v1/collect-uk/driver/apply', () => {
  const APPLICATION = {
    fullName: 'Tendai Driver',
    phone: '+447700900001',
    basePostcode: 'M1 1AE',
    county: 'Greater Manchester',
    drivingLicenceUrl: 'collect-uk-driver-docs/licence',
    motorInsuranceUrl: 'collect-uk-driver-docs/motor',
    gitInsuranceUrl: 'collect-uk-driver-docs/git',
    liabilityUrl: 'collect-uk-driver-docs/liability',
    vehicles: [
      { makeModel: 'Ford Transit LWB', registrationPlate: 'AB12 CDE', capacityParcels: 30, photoUrl: 'collect-uk-driver-docs/van1' },
      { makeModel: 'Mercedes Sprinter', registrationPlate: 'CD34 EFG', photoUrl: 'collect-uk-driver-docs/van2' },
    ],
  };

  it('creates an APPLIED driver record with documents', async () => {
    driverFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/driver/apply').set(AUTH_HEADER).send(APPLICATION);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('APPLIED');
    expect(driverCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        status: 'APPLIED',
        drivingLicenceUrl: 'collect-uk-driver-docs/licence',
        gitInsuranceUrl: 'collect-uk-driver-docs/git',
        vehicleReference: 'AB12 CDE', // primary summary from vehicles[0]
        vehicleMakeModel: 'Ford Transit LWB',
        capacityParcels: 30,
      }),
    });
    // both vehicles stored
    expect(vehicleCreateManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ registrationPlate: 'AB12 CDE', capacityParcels: 30 }),
        expect.objectContaining({ registrationPlate: 'CD34 EFG', capacityParcels: 20 }), // default
      ],
    });
  });

  it('400s when no vehicle is provided', async () => {
    driverFindUniqueMock.mockResolvedValue(null);
    const { vehicles: _v, ...noVehicles } = APPLICATION;

    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/driver/apply').set(AUTH_HEADER).send({ ...noVehicles, vehicles: [] });

    expect(res.status).toBe(400);
    expect(driverCreateMock).not.toHaveBeenCalled();
  });

  it('400s when the driving licence is missing', async () => {
    driverFindUniqueMock.mockResolvedValue(null);
    const { drivingLicenceUrl: _l, ...noLicence } = APPLICATION;

    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/driver/apply').set(AUTH_HEADER).send(noLicence);

    expect(res.status).toBe(400);
    expect(driverCreateMock).not.toHaveBeenCalled();
  });

  it('409s when the caller already has a live driver record', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/driver/apply').set(AUTH_HEADER).send(APPLICATION);

    expect(res.status).toBe(409);
    expect(driverCreateMock).not.toHaveBeenCalled();
  });

  it('lets a REJECTED applicant resubmit (same row back to APPLIED)', async () => {
    driverFindUniqueMock.mockResolvedValue({ ...DRIVER, status: 'REJECTED' });

    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/driver/apply').set(AUTH_HEADER).send(APPLICATION);

    expect(res.status).toBe(201);
    expect(driverUpdateMock).toHaveBeenCalledWith({
      where: { id: DRIVER_ID },
      data: expect.objectContaining({ status: 'APPLIED', reviewNotes: null }),
    });
  });

  it('400s when a required insurance document is missing', async () => {
    driverFindUniqueMock.mockResolvedValue(null);
    const { gitInsuranceUrl: _omit, ...withoutGit } = APPLICATION;

    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/driver/apply').set(AUTH_HEADER).send(withoutGit);

    expect(res.status).toBe(400);
    expect(driverCreateMock).not.toHaveBeenCalled();
  });
});

describe('driver portal is gated to ACTIVE drivers', () => {
  it('403s an APPLIED applicant trying to list routes', async () => {
    driverFindUniqueMock.mockResolvedValue({ ...DRIVER, status: 'APPLIED' });

    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/driver/routes').set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });
});

describe('role exclusion: company members cannot apply as drivers', () => {
  it('409s a company member submitting a driver application', async () => {
    companyRoleFindFirstMock.mockResolvedValue({ id: 'role-1', companyId: 'c-1', role: 'COMPANY_ADMIN' });
    driverFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/driver/apply').set(AUTH_HEADER).send({
      fullName: 'Conflicted', phone: '+447700900001', basePostcode: 'M1 1AE', county: 'Gtr Manchester',
      drivingLicenceUrl: 'd/licence', motorInsuranceUrl: 'd/motor', gitInsuranceUrl: 'd/git', liabilityUrl: 'd/liab',
      vehicles: [{ makeModel: 'Transit', registrationPlate: 'AB12 CDE', photoUrl: 'd/van' }],
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROLE_CONFLICT');
    expect(driverCreateMock).not.toHaveBeenCalled();
  });
});
