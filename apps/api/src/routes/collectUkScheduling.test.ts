import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';

const userFindUniqueMock = vi.fn();
const driverCreateMock = vi.fn();
const driverFindManyMock = vi.fn();
const driverFindUniqueMock = vi.fn();
const routeCreateMock = vi.fn();
const routeFindUniqueMock = vi.fn();
const bookingFindUniqueMock = vi.fn();
const bookingFindManyMock = vi.fn();
const bookingUpdateManyMock = vi.fn();
const stopFindFirstMock = vi.fn();
const stopCreateMock = vi.fn();
const bookingUpdateMock = vi.fn();
const stopUpdateMock = vi.fn();
const routeUpdateMock = vi.fn();
const auditLogCreateMock = vi.fn();
const transactionMock = vi.fn();
const notifyCollectionScheduledMock = vi.fn();
const geocodePostcodeMock = vi.fn();

// Only the network-touching geocoder is mocked -- the distance maths and
// nearest-neighbour ordering run for real so these tests exercise the
// actual optimisation behaviour.
vi.mock('../lib/collectUkGeo', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/collectUkGeo')>()),
  geocodePostcode: (...args: unknown[]) => geocodePostcodeMock(...args),
}));

vi.mock('../services/collectUkNotifications', () => ({
  notifyBookingConfirmed: vi.fn(),
  notifyCollectionScheduled: (...args: unknown[]) => notifyCollectionScheduledMock(...args),
  notifyParcelCollected: vi.fn(),
  notifyUnableToCollect: vi.fn(),
  notifyArrivedAtWarehouse: vi.fn(),
  notifyHandedOver: vi.fn(),
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUniqueMock(...args) },
    collectUkDriver: {
      create: (...args: unknown[]) => driverCreateMock(...args),
      findMany: (...args: unknown[]) => driverFindManyMock(...args),
      findUnique: (...args: unknown[]) => driverFindUniqueMock(...args),
    },
    collectUkCollectionRoute: {
      create: (...args: unknown[]) => routeCreateMock(...args),
      findUnique: (...args: unknown[]) => routeFindUniqueMock(...args),
      update: (...args: unknown[]) => routeUpdateMock(...args),
    },
    collectUkCollectionBooking: {
      findUnique: (...args: unknown[]) => bookingFindUniqueMock(...args),
      findMany: (...args: unknown[]) => bookingFindManyMock(...args),
      updateMany: (...args: unknown[]) => bookingUpdateManyMock(...args),
      update: (...args: unknown[]) => bookingUpdateMock(...args),
    },
    collectUkCollectionStop: {
      findFirst: (...args: unknown[]) => stopFindFirstMock(...args),
      create: (...args: unknown[]) => stopCreateMock(...args),
      update: (...args: unknown[]) => stopUpdateMock(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');

const ADMIN_TOKEN = 'test-admin-secret';
const ADMIN_HEADER = { 'x-admin-token': ADMIN_TOKEN };
const USER_ID = '11111111-1111-4111-8111-111111111111';
const DRIVER_ID = '22222222-2222-4222-8222-222222222222';
const ROUTE_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';

const DRIVER = { id: DRIVER_ID, userId: USER_ID, vehicleReference: 'VAN-1', capacityParcels: 20, status: 'ACTIVE' };
const ROUTE = { id: ROUTE_ID, driverId: DRIVER_ID, routeDate: new Date('2026-08-01'), status: 'PLANNED', driver: DRIVER };
const BOOKING = { id: BOOKING_ID, status: 'REQUESTED' };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  userFindUniqueMock.mockResolvedValue({ id: USER_ID });
  driverFindUniqueMock.mockResolvedValue(DRIVER);
  routeFindUniqueMock.mockResolvedValue(ROUTE);
  bookingFindUniqueMock.mockResolvedValue(BOOKING);
  bookingUpdateManyMock.mockResolvedValue({ count: 1 });
  stopFindFirstMock.mockResolvedValue(null);
  auditLogCreateMock.mockResolvedValue({});
  notifyCollectionScheduledMock.mockResolvedValue(undefined);
  bookingUpdateMock.mockResolvedValue({});
  stopUpdateMock.mockResolvedValue({});
  routeUpdateMock.mockResolvedValue({});
  geocodePostcodeMock.mockResolvedValue(null);
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      collectUkCollectionBooking: { updateMany: (...args: unknown[]) => bookingUpdateManyMock(...args) },
      collectUkCollectionStop: {
        create: (...args: unknown[]) => stopCreateMock(...args),
        update: (...args: unknown[]) => stopUpdateMock(...args),
      },
      collectUkCollectionRoute: { update: (...args: unknown[]) => routeUpdateMock(...args) },
    }),
  );
});

describe('POST /api/v1/admin/collect-uk/drivers', () => {
  it('creates a driver profile', async () => {
    driverCreateMock.mockResolvedValue(DRIVER);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/collect-uk/drivers')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, vehicleReference: 'VAN-1' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(DRIVER_ID);
  });

  it('404s for a nonexistent user', async () => {
    userFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/collect-uk/drivers').set(ADMIN_HEADER).send({ userId: USER_ID });

    expect(res.status).toBe(404);
  });

  it('409s when the user is already a driver', async () => {
    driverCreateMock.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'x' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/collect-uk/drivers').set(ADMIN_HEADER).send({ userId: USER_ID });

    expect(res.status).toBe(409);
  });

  it('fails closed without a valid admin token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/admin/collect-uk/drivers').send({ userId: USER_ID });

    expect(res.status).toBe(401);
    expect(driverCreateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/collect-uk/drivers', () => {
  it('lists drivers', async () => {
    driverFindManyMock.mockResolvedValue([DRIVER]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/collect-uk/drivers').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('POST /api/v1/admin/collect-uk/routes', () => {
  it('creates a route for a driver', async () => {
    routeCreateMock.mockResolvedValue(ROUTE);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/collect-uk/routes')
      .set(ADMIN_HEADER)
      .send({ driverId: DRIVER_ID, routeDate: '2026-08-01' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(ROUTE_ID);
  });

  it('404s for a nonexistent driver', async () => {
    driverFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/collect-uk/routes')
      .set(ADMIN_HEADER)
      .send({ driverId: DRIVER_ID, routeDate: '2026-08-01' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/admin/collect-uk/routes/:id', () => {
  it('returns the route with ordered stops', async () => {
    routeFindUniqueMock.mockResolvedValue({
      ...ROUTE,
      driver: DRIVER,
      stops: [
        {
          id: 'stop-1',
          sequenceOrder: 0,
          status: 'PENDING',
          bookingId: BOOKING_ID,
          booking: {
            reference: 'FC-abc-000001',
            company: { name: 'ABC Logistics' },
            customerName: 'Jane Customer',
            collectionAddress: '10 Test St',
            collectionPostcode: 'E1 6AN',
          },
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}`).set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.stops).toHaveLength(1);
    expect(res.body.data.stops[0].bookingReference).toBe('FC-abc-000001');
  });

  it('404s for a nonexistent route', async () => {
    routeFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}`).set(ADMIN_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/admin/collect-uk/bookings/unscheduled', () => {
  it('lists REQUESTED bookings across all companies', async () => {
    bookingFindManyMock.mockResolvedValue([
      {
        id: BOOKING_ID,
        reference: 'FC-abc-000001',
        company: { name: 'ABC Logistics' },
        customerName: 'Jane Customer',
        collectionAddress: '10 Test St',
        collectionPostcode: 'E1 6AN',
        preferredDate: new Date('2026-08-01'),
        parcelSizeTier: 'MEDIUM',
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/collect-uk/bookings/unscheduled').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'REQUESTED' } }));
  });
});

describe('POST /api/v1/admin/collect-uk/routes/:id/stops', () => {
  it('assigns a booking to a route, auto-sequencing and transitioning it to DRIVER_ASSIGNED', async () => {
    stopCreateMock.mockResolvedValue({ id: 'stop-1', routeId: ROUTE_ID, bookingId: BOOKING_ID, driverId: DRIVER_ID, sequenceOrder: 0 });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/stops`)
      .set(ADMIN_HEADER)
      .send({ bookingId: BOOKING_ID });

    expect(res.status).toBe(201);
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({ where: { id: BOOKING_ID, status: 'REQUESTED' }, data: { status: 'DRIVER_ASSIGNED' } });
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: { routeId: ROUTE_ID, bookingId: BOOKING_ID, driverId: DRIVER_ID, sequenceOrder: 0 },
    });
    expect(notifyCollectionScheduledMock).toHaveBeenCalledWith(BOOKING_ID, ROUTE.routeDate);
  });

  it('increments sequenceOrder from the last stop on the route when not provided', async () => {
    stopFindFirstMock.mockResolvedValue({ sequenceOrder: 2 });
    stopCreateMock.mockResolvedValue({});

    const app = createApp();
    await request(app).post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/stops`).set(ADMIN_HEADER).send({ bookingId: BOOKING_ID });

    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ sequenceOrder: 3 }) });
  });

  it('respects an explicit sequenceOrder', async () => {
    stopCreateMock.mockResolvedValue({});

    const app = createApp();
    await request(app)
      .post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/stops`)
      .set(ADMIN_HEADER)
      .send({ bookingId: BOOKING_ID, sequenceOrder: 5 });

    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ sequenceOrder: 5 }) });
  });

  it('404s for a nonexistent route', async () => {
    routeFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/stops`)
      .set(ADMIN_HEADER)
      .send({ bookingId: BOOKING_ID });

    expect(res.status).toBe(404);
  });

  it('404s for a nonexistent booking', async () => {
    bookingFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/stops`)
      .set(ADMIN_HEADER)
      .send({ bookingId: BOOKING_ID });

    expect(res.status).toBe(404);
  });

  it('409s when the booking is not awaiting scheduling', async () => {
    bookingFindUniqueMock.mockResolvedValue({ ...BOOKING, status: 'DRIVER_ASSIGNED' });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/stops`)
      .set(ADMIN_HEADER)
      .send({ bookingId: BOOKING_ID });

    expect(res.status).toBe(409);
    expect(stopCreateMock).not.toHaveBeenCalled();
    expect(notifyCollectionScheduledMock).not.toHaveBeenCalled();
  });

  it('409s (already assigned) on a unique-constraint race for the same booking', async () => {
    stopCreateMock.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'x' }));

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/stops`)
      .set(ADMIN_HEADER)
      .send({ bookingId: BOOKING_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_ASSIGNED');
  });

  it('409s when two simultaneous assignment attempts race for the same booking -- only one succeeds', async () => {
    bookingUpdateManyMock.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    stopCreateMock.mockResolvedValue({});

    const app = createApp();
    const [first, second] = await Promise.all([
      request(app).post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/stops`).set(ADMIN_HEADER).send({ bookingId: BOOKING_ID }),
      request(app).post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/stops`).set(ADMIN_HEADER).send({ bookingId: BOOKING_ID }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
  });
});

describe('POST /api/v1/admin/collect-uk/routes/:id/optimise', () => {
  const LONDON = { latitude: 51.5074, longitude: -0.1278 };
  const BIRMINGHAM = { latitude: 52.4796, longitude: -1.9026 };
  const WOLVERHAMPTON = { latitude: 52.585, longitude: -2.134 };

  const STOP_LONDON = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    bookingId: 'booking-london',
    booking: {
      id: 'booking-london',
      reference: 'FC-x-000001',
      customerName: 'London Customer',
      collectionPostcode: 'SW1A 1AA',
      collectionLatitude: LONDON.latitude,
      collectionLongitude: LONDON.longitude,
    },
  };
  const STOP_BIRMINGHAM = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    bookingId: 'booking-birmingham',
    booking: {
      id: 'booking-birmingham',
      reference: 'FC-x-000002',
      customerName: 'Birmingham Customer',
      collectionPostcode: 'B1 1AA',
      collectionLatitude: BIRMINGHAM.latitude,
      collectionLongitude: BIRMINGHAM.longitude,
    },
  };

  const PLANNED_ROUTE = {
    ...ROUTE,
    status: 'PLANNED',
    stops: [STOP_LONDON, STOP_BIRMINGHAM],
  };

  it('orders stops nearest-neighbour from the start postcode and records per-leg + total mileage', async () => {
    routeFindUniqueMock.mockResolvedValue(PLANNED_ROUTE);
    geocodePostcodeMock.mockResolvedValue(WOLVERHAMPTON); // start postcode

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/optimise`)
      .set(ADMIN_HEADER)
      .send({ startPostcode: 'WV1 1AA' });

    expect(res.status).toBe(200);
    // From Wolverhampton: Birmingham first, then London.
    expect(res.body.data.stops.map((s: { bookingId: string }) => s.bookingId)).toEqual([
      'booking-birmingham',
      'booking-london',
    ]);
    expect(res.body.data.stops[0].distanceFromPreviousMiles).toBeGreaterThan(10);
    expect(res.body.data.stops[1].distanceFromPreviousMiles).toBeGreaterThan(100);
    expect(res.body.data.totalDistanceMiles).toBeCloseTo(
      res.body.data.stops[0].distanceFromPreviousMiles + res.body.data.stops[1].distanceFromPreviousMiles,
      1,
    );
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: STOP_BIRMINGHAM.id },
      data: { sequenceOrder: 0, distanceFromPreviousMiles: expect.any(Number) },
    });
    expect(routeUpdateMock).toHaveBeenCalledWith({
      where: { id: ROUTE_ID },
      data: { totalDistanceMiles: res.body.data.totalDistanceMiles },
    });
  });

  it('leaves the first leg null when no start postcode is given', async () => {
    routeFindUniqueMock.mockResolvedValue(PLANNED_ROUTE);

    const app = createApp();
    const res = await request(app).post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/optimise`).set(ADMIN_HEADER).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.stops[0].distanceFromPreviousMiles).toBeNull();
    expect(res.body.data.stops[1].distanceFromPreviousMiles).toBeGreaterThan(0);
  });

  it('geocodes and persists coordinates for bookings that are missing them', async () => {
    const ungeocodedStop = {
      ...STOP_LONDON,
      booking: { ...STOP_LONDON.booking, collectionLatitude: null, collectionLongitude: null },
    };
    routeFindUniqueMock.mockResolvedValue({ ...PLANNED_ROUTE, stops: [ungeocodedStop, STOP_BIRMINGHAM] });
    geocodePostcodeMock.mockResolvedValue(LONDON);

    const app = createApp();
    const res = await request(app).post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/optimise`).set(ADMIN_HEADER).send({});

    expect(res.status).toBe(200);
    expect(bookingUpdateMock).toHaveBeenCalledWith({
      where: { id: 'booking-london' },
      data: { collectionLatitude: LONDON.latitude, collectionLongitude: LONDON.longitude },
    });
  });

  it('422s listing postcodes that cannot be geocoded', async () => {
    const ungeocodedStop = {
      ...STOP_LONDON,
      booking: { ...STOP_LONDON.booking, collectionLatitude: null, collectionLongitude: null },
    };
    routeFindUniqueMock.mockResolvedValue({ ...PLANNED_ROUTE, stops: [ungeocodedStop] });
    geocodePostcodeMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/optimise`).set(ADMIN_HEADER).send({});

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNGEOCODABLE_STOPS');
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it('409s for a route that has already started', async () => {
    routeFindUniqueMock.mockResolvedValue({ ...PLANNED_ROUTE, status: 'IN_PROGRESS' });

    const app = createApp();
    const res = await request(app).post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/optimise`).set(ADMIN_HEADER).send({});

    expect(res.status).toBe(409);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it('409s for a route with no stops', async () => {
    routeFindUniqueMock.mockResolvedValue({ ...PLANNED_ROUTE, stops: [] });

    const app = createApp();
    const res = await request(app).post(`/api/v1/admin/collect-uk/routes/${ROUTE_ID}/optimise`).set(ADMIN_HEADER).send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMPTY_ROUTE');
  });
});
