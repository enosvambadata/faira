import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const companyRoleFindManyMock = vi.fn();
const companyRoleCreateMock = vi.fn();
const companyFindUniqueMock = vi.fn();
const companyCreateMock = vi.fn();
const companyUpdateMock = vi.fn();
const warehouseFindManyMock = vi.fn();
const warehouseFindUniqueMock = vi.fn();
const warehouseCreateMock = vi.fn();
const warehouseUpdateMock = vi.fn();
const bookingFindManyMock = vi.fn();
const bookingFindUniqueMock = vi.fn();
const bookingUpdateManyMock = vi.fn();
const auditLogCreateMock = vi.fn();
const transactionMock = vi.fn();
const notifyHandedOverMock = vi.fn();
const notifyBookingCancelledMock = vi.fn();
const notifyWeekSetMock = vi.fn();
const stopDeleteMock = vi.fn();
const windowFindManyMock = vi.fn();
const rateFindUniqueMock = vi.fn();
const windowCreateMock = vi.fn();
const stopCountMock = vi.fn();
const stopFindManyMock = vi.fn();
const routeFindUniqueMock = vi.fn();
const routeUpdateManyMock = vi.fn();

vi.mock('../services/collectUkNotifications', () => ({
  notifyBookingConfirmed: vi.fn(),
  notifyCollectionScheduled: vi.fn(),
  notifyParcelCollected: vi.fn(),
  notifyUnableToCollect: vi.fn(),
  notifyArrivedAtWarehouse: vi.fn(),
  notifyHandedOver: (...args: unknown[]) => notifyHandedOverMock(...args),
  notifyBookingCancelled: (...args: unknown[]) => notifyBookingCancelledMock(...args),
  notifyCollectionWeekSet: (...args: unknown[]) => notifyWeekSetMock(...args),
  notifyCollectionWillBeRescheduled: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    collectUkCompanyRole: {
      findMany: (...args: unknown[]) => companyRoleFindManyMock(...args),
      create: (...args: unknown[]) => companyRoleCreateMock(...args),
    },
    collectUkCompany: {
      findUnique: (...args: unknown[]) => companyFindUniqueMock(...args),
      create: (...args: unknown[]) => companyCreateMock(...args),
      update: (...args: unknown[]) => companyUpdateMock(...args),
    },
    collectUkCompanyWarehouse: {
      findMany: (...args: unknown[]) => warehouseFindManyMock(...args),
      findUnique: (...args: unknown[]) => warehouseFindUniqueMock(...args),
      create: (...args: unknown[]) => warehouseCreateMock(...args),
      update: (...args: unknown[]) => warehouseUpdateMock(...args),
    },
    collectUkCollectionBooking: {
      findMany: (...args: unknown[]) => bookingFindManyMock(...args),
      findUnique: (...args: unknown[]) => bookingFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => bookingUpdateManyMock(...args),
    },
    collectUkCollectionStop: {
      delete: (...args: unknown[]) => stopDeleteMock(...args),
      count: (...args: unknown[]) => stopCountMock(...args),
      findMany: (...args: unknown[]) => stopFindManyMock(...args),
    },
    collectUkCollectionWindow: {
      findMany: (...args: unknown[]) => windowFindManyMock(...args),
      create: (...args: unknown[]) => windowCreateMock(...args),
    },
    collectUkCompanyRate: { findUnique: (...args: unknown[]) => rateFindUniqueMock(...args) },
    collectUkCollectionRoute: {
      findUnique: (...args: unknown[]) => routeFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => routeUpdateManyMock(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const USER_ID = 'user-1';
const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';

const COMPANY_A_ROW = {
  id: COMPANY_A,
  name: 'ABC Logistics',
  slug: 'abc-logistics',
  countriesServed: ['Zimbabwe'],
  isActive: true,
  createdAt: new Date('2026-07-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  companyRoleFindManyMock.mockResolvedValue([{ role: 'COMPANY_ADMIN', companyId: COMPANY_A }]);
  auditLogCreateMock.mockResolvedValue({});
  companyFindUniqueMock.mockResolvedValue(null);
  companyUpdateMock.mockResolvedValue({});
  warehouseFindManyMock.mockResolvedValue([]);
  warehouseCreateMock.mockResolvedValue({});
  warehouseUpdateMock.mockResolvedValue({});
  bookingFindManyMock.mockResolvedValue([]);
  bookingFindUniqueMock.mockResolvedValue(null);
  bookingUpdateManyMock.mockResolvedValue({ count: 1 });
  notifyHandedOverMock.mockResolvedValue(undefined);
  stopDeleteMock.mockResolvedValue({});
  windowFindManyMock.mockResolvedValue([]);
  rateFindUniqueMock.mockResolvedValue(null);
  windowCreateMock.mockResolvedValue({ id: 'w-1', companyId: COMPANY_A, startDate: new Date('2099-08-03'), endDate: new Date('2099-08-09') });
  notifyWeekSetMock.mockResolvedValue(undefined);
  stopCountMock.mockResolvedValue(0);
  stopFindManyMock.mockResolvedValue([]);
  routeFindUniqueMock.mockResolvedValue(null);
  routeUpdateManyMock.mockResolvedValue({ count: 0 });
  notifyBookingCancelledMock.mockResolvedValue(undefined);
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      collectUkCompany: { create: (...args: unknown[]) => companyCreateMock(...args) },
      collectUkCompanyRole: { create: (...args: unknown[]) => companyRoleCreateMock(...args) },
      collectUkCollectionBooking: {
        updateMany: (...args: unknown[]) => bookingUpdateManyMock(...args),
        findMany: (...args: unknown[]) => bookingFindManyMock(...args),
      },
      collectUkCollectionWindow: { create: (...args: unknown[]) => windowCreateMock(...args) },
      collectUkCollectionStop: {
        delete: (...args: unknown[]) => stopDeleteMock(...args),
        count: (...args: unknown[]) => stopCountMock(...args),
        findMany: (...args: unknown[]) => stopFindManyMock(...args),
      },
      collectUkCollectionRoute: {
        findUnique: (...args: unknown[]) => routeFindUniqueMock(...args),
        updateMany: (...args: unknown[]) => routeUpdateManyMock(...args),
      },
    }),
  );
});

describe('POST /api/v1/collect-uk/companies', () => {
  it('creates a company and auto-assigns the caller as COMPANY_ADMIN', async () => {
    companyFindUniqueMock.mockResolvedValue(null); // slug availability check
    companyCreateMock.mockResolvedValue(COMPANY_A_ROW);
    companyRoleCreateMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/collect-uk/companies')
      .set(AUTH_HEADER)
      .send({ name: 'ABC Logistics', countriesServed: ['Zimbabwe'] });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('ABC Logistics');
    expect(res.body.data.slug).toBe('abc-logistics');
    expect(companyCreateMock).toHaveBeenCalledWith({
      data: { name: 'ABC Logistics', slug: 'abc-logistics', countriesServed: ['Zimbabwe'] },
    });
    expect(companyRoleCreateMock).toHaveBeenCalledWith({
      data: { userId: USER_ID, companyId: COMPANY_A, role: 'COMPANY_ADMIN' },
    });
  });

  it('appends a numeric suffix when the slug is already taken', async () => {
    companyFindUniqueMock
      .mockResolvedValueOnce({ id: 'existing' }) // "abc-logistics" taken
      .mockResolvedValueOnce(null); // "abc-logistics-2" free
    companyCreateMock.mockResolvedValue({ ...COMPANY_A_ROW, slug: 'abc-logistics-2' });
    companyRoleCreateMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/collect-uk/companies')
      .set(AUTH_HEADER)
      .send({ name: 'ABC Logistics', countriesServed: ['Zimbabwe'] });

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('abc-logistics-2');
  });

  it('400s when countriesServed is empty', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/collect-uk/companies')
      .set(AUTH_HEADER)
      .send({ name: 'ABC Logistics', countriesServed: [] });

    expect(res.status).toBe(400);
    expect(companyCreateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/collect-uk/companies/mine', () => {
  it("lists the caller's companies with their role at each", async () => {
    companyRoleFindManyMock.mockResolvedValue([{ role: 'COMPANY_ADMIN', companyId: COMPANY_A, company: COMPANY_A_ROW }]);

    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/companies/mine').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ ...{
      id: COMPANY_A_ROW.id,
      name: COMPANY_A_ROW.name,
      slug: COMPANY_A_ROW.slug,
      countriesServed: COMPANY_A_ROW.countriesServed,
      isActive: COMPANY_A_ROW.isActive,
      createdAt: COMPANY_A_ROW.createdAt.toISOString(),
    }, role: 'COMPANY_ADMIN' }]);
  });
});

describe('GET /api/v1/collect-uk/companies/:id', () => {
  it('returns the company for an assigned COMPANY_ADMIN', async () => {
    companyFindUniqueMock.mockResolvedValue(COMPANY_A_ROW);

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_A}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(COMPANY_A);
  });

  it("403s (tenant isolation) when the caller isn't assigned to this company", async () => {
    companyFindUniqueMock.mockResolvedValue({ ...COMPANY_A_ROW, id: COMPANY_B });

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_B}`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });

  it('404s for a nonexistent company', async () => {
    companyFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/companies/nonexistent').set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  it('403s when the caller has no company role at all', async () => {
    companyRoleFindManyMock.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_A}`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(companyFindUniqueMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/collect-uk/companies/:id', () => {
  it('updates the profile for an assigned COMPANY_ADMIN', async () => {
    companyFindUniqueMock.mockResolvedValue(COMPANY_A_ROW);
    companyUpdateMock.mockResolvedValue({ ...COMPANY_A_ROW, name: 'ABC Logistics Ltd' });

    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}`)
      .set(AUTH_HEADER)
      .send({ name: 'ABC Logistics Ltd' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('ABC Logistics Ltd');
  });

  it('403s a DISPATCHER (not a COMPANY_ADMIN) attempting to update the profile', async () => {
    companyRoleFindManyMock.mockResolvedValue([{ role: 'DISPATCHER', companyId: COMPANY_A }]);

    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}`)
      .set(AUTH_HEADER)
      .send({ name: 'New Name' });

    expect(res.status).toBe(403);
    expect(companyUpdateMock).not.toHaveBeenCalled();
  });

  it("403s (tenant isolation) when the target company isn't the caller's", async () => {
    companyFindUniqueMock.mockResolvedValue({ ...COMPANY_A_ROW, id: COMPANY_B });

    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/collect-uk/companies/${COMPANY_B}`)
      .set(AUTH_HEADER)
      .send({ name: 'New Name' });

    expect(res.status).toBe(403);
    expect(companyUpdateMock).not.toHaveBeenCalled();
  });
});

describe('warehouse routes', () => {
  it('lists warehouses for an assigned company', async () => {
    warehouseFindManyMock.mockResolvedValue([
      { id: 'wh-1', companyId: COMPANY_A, name: 'Main Depot', address: '1 Road', city: 'London', postcode: 'E1 6AN', openingHours: '9-5', isActive: true },
    ]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_A}/warehouses`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Main Depot');
  });

  it("403s (tenant isolation) listing another company's warehouses", async () => {
    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_B}/warehouses`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(warehouseFindManyMock).not.toHaveBeenCalled();
  });

  it('creates a warehouse for an assigned COMPANY_ADMIN', async () => {
    warehouseCreateMock.mockResolvedValue({
      id: 'wh-1', companyId: COMPANY_A, name: 'Main Depot', address: '1 Road', city: 'London', postcode: 'E1 6AN', openingHours: '9-5', isActive: true,
    });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/warehouses`)
      .set(AUTH_HEADER)
      .send({ name: 'Main Depot', address: '1 Road', city: 'London', postcode: 'E1 6AN', openingHours: '9-5' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Main Depot');
  });

  it('403s a DISPATCHER creating a warehouse', async () => {
    companyRoleFindManyMock.mockResolvedValue([{ role: 'DISPATCHER', companyId: COMPANY_A }]);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/warehouses`)
      .set(AUTH_HEADER)
      .send({ name: 'Main Depot', address: '1 Road', city: 'London', postcode: 'E1 6AN', openingHours: '9-5' });

    expect(res.status).toBe(403);
    expect(warehouseCreateMock).not.toHaveBeenCalled();
  });

  it('updates a warehouse belonging to the assigned company', async () => {
    warehouseFindUniqueMock.mockResolvedValue({ id: 'wh-1', companyId: COMPANY_A });
    warehouseUpdateMock.mockResolvedValue({
      id: 'wh-1', companyId: COMPANY_A, name: 'Renamed Depot', address: '1 Road', city: 'London', postcode: 'E1 6AN', openingHours: '9-5', isActive: true,
    });

    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}/warehouses/wh-1`)
      .set(AUTH_HEADER)
      .send({ name: 'Renamed Depot' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed Depot');
  });

  it("404s updating a warehouse that belongs to a different company than the URL's", async () => {
    warehouseFindUniqueMock.mockResolvedValue({ id: 'wh-1', companyId: COMPANY_B });

    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}/warehouses/wh-1`)
      .set(AUTH_HEADER)
      .send({ name: 'Renamed Depot' });

    expect(res.status).toBe(404);
    expect(warehouseUpdateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/collect-uk/companies/:id/bookings', () => {
  it('lists bookings for an assigned company', async () => {
    bookingFindManyMock.mockResolvedValue([
      {
        id: 'booking-1',
        reference: 'FC-abc-logistics-000001',
        status: 'REQUESTED',
        customerName: 'Jane Customer',
        customerContact: '+447700900000',
        destinationCountry: 'Zimbabwe',
        collectionAddress: '10 Test St',
        collectionPostcode: 'E1 6AN',
        preferredDate: new Date('2026-08-01T00:00:00Z'),
        parcelSizeTier: 'MEDIUM',
        createdAt: new Date('2026-07-01T00:00:00Z'),
      },
    ]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].reference).toBe('FC-abc-logistics-000001');
  });

  it("403s (tenant isolation) listing another company's bookings", async () => {
    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_B}/bookings`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(bookingFindManyMock).not.toHaveBeenCalled();
  });

  it('allows a DISPATCHER (read-only) to list bookings', async () => {
    companyRoleFindManyMock.mockResolvedValue([{ role: 'DISPATCHER', companyId: COMPANY_A }]);
    bookingFindManyMock.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/collect-uk/companies/:id/bookings/:bookingId/confirm-handover', () => {
  const BOOKING_ID = 'booking-1';
  const AT_WAREHOUSE_BOOKING = { id: BOOKING_ID, companyId: COMPANY_A, status: 'AT_WAREHOUSE', itemTypes: ['DRUM'], parcelSizeTier: 'MEDIUM', numberOfParcels: 2 };

  it('confirms handover for a booking that has arrived at the warehouse', async () => {
    bookingFindUniqueMock.mockResolvedValue(AT_WAREHOUSE_BOOKING);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/${BOOKING_ID}/confirm-handover`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: BOOKING_ID, status: 'HANDED_OVER' });
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: BOOKING_ID, status: 'AT_WAREHOUSE' },
      data: { status: 'HANDED_OVER', chargePence: null },
    });
    expect(notifyHandedOverMock).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('allows a DISPATCHER (not just COMPANY_ADMIN) to confirm handover', async () => {
    companyRoleFindManyMock.mockResolvedValue([{ role: 'DISPATCHER', companyId: COMPANY_A }]);
    bookingFindUniqueMock.mockResolvedValue(AT_WAREHOUSE_BOOKING);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/${BOOKING_ID}/confirm-handover`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
  });

  it("403s (tenant isolation) confirming handover for another company's booking", async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_B}/bookings/${BOOKING_ID}/confirm-handover`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(bookingFindUniqueMock).not.toHaveBeenCalled();
  });

  it('404s when the booking does not belong to the company in the URL', async () => {
    bookingFindUniqueMock.mockResolvedValue({ id: BOOKING_ID, companyId: COMPANY_B, status: 'AT_WAREHOUSE' });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/${BOOKING_ID}/confirm-handover`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });

  it('404s for a nonexistent booking', async () => {
    bookingFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/nonexistent/confirm-handover`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  it('409s when the booking has not yet arrived at the warehouse', async () => {
    bookingFindUniqueMock.mockResolvedValue({ id: BOOKING_ID, companyId: COMPANY_A, status: 'DRIVER_ASSIGNED' });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/${BOOKING_ID}/confirm-handover`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
    expect(notifyHandedOverMock).not.toHaveBeenCalled();
  });

  it('409s when two simultaneous confirm attempts race -- only one succeeds', async () => {
    bookingFindUniqueMock.mockResolvedValue(AT_WAREHOUSE_BOOKING);
    bookingUpdateManyMock.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const app = createApp();
    const first = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/${BOOKING_ID}/confirm-handover`)
      .set(AUTH_HEADER);
    const second = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/${BOOKING_ID}/confirm-handover`)
      .set(AUTH_HEADER);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });
});

describe('POST /api/v1/collect-uk/companies/:id/bookings/:bookingId/cancel', () => {
  const BOOKING_ID = 'booking-1';
  const REQUESTED_BOOKING = { id: BOOKING_ID, companyId: COMPANY_A, status: 'REQUESTED', stop: null };

  it('cancels a booking that has not been scheduled yet', async () => {
    bookingFindUniqueMock.mockResolvedValue(REQUESTED_BOOKING);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/${BOOKING_ID}/cancel`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: BOOKING_ID, status: 'CANCELLED' });
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: BOOKING_ID, status: { in: ['REQUESTED', 'DRIVER_ASSIGNED', 'EN_ROUTE'] } },
      data: { status: 'CANCELLED' },
    });
    expect(stopDeleteMock).not.toHaveBeenCalled();
    expect(notifyBookingCancelledMock).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('releases the pending stop from its route when cancelling a scheduled booking', async () => {
    bookingFindUniqueMock.mockResolvedValue({
      ...REQUESTED_BOOKING,
      status: 'DRIVER_ASSIGNED',
      stop: { id: 'stop-1', routeId: 'route-1', status: 'PENDING' },
    });
    routeFindUniqueMock.mockResolvedValue({ id: 'route-1', status: 'PLANNED' });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/${BOOKING_ID}/cancel`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(stopDeleteMock).toHaveBeenCalledWith({ where: { id: 'stop-1' } });
  });

  it('409s once the parcel has been collected', async () => {
    bookingFindUniqueMock.mockResolvedValue({ ...REQUESTED_BOOKING, status: 'COLLECTED' });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/${BOOKING_ID}/cancel`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
    expect(notifyBookingCancelledMock).not.toHaveBeenCalled();
  });

  it("403s (tenant isolation) cancelling another company's booking", async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_B}/bookings/${BOOKING_ID}/cancel`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(bookingFindUniqueMock).not.toHaveBeenCalled();
  });
});

describe('collection windows', () => {
  it('lists windows for an assigned company', async () => {
    windowFindManyMock.mockResolvedValue([
      { id: 'w-1', companyId: COMPANY_A, startDate: new Date('2026-08-03'), endDate: new Date('2026-08-09') },
    ]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_A}/windows`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('creates a window for a COMPANY_ADMIN', async () => {
    windowCreateMock.mockResolvedValue({
      id: 'w-1',
      companyId: COMPANY_A,
      startDate: new Date('2099-08-03'),
      endDate: new Date('2099-08-09'),
    });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/windows`)
      .set(AUTH_HEADER)
      .send({ startDate: '2099-08-03', endDate: '2099-08-09' });

    expect(res.status).toBe(201);
    expect(windowCreateMock).toHaveBeenCalled();
  });

  it('400s when the window ends before it starts', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/windows`)
      .set(AUTH_HEADER)
      .send({ startDate: '2099-08-09', endDate: '2099-08-03' });

    expect(res.status).toBe(400);
    expect(windowCreateMock).not.toHaveBeenCalled();
  });

  it('400s when the window is entirely in the past', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/windows`)
      .set(AUTH_HEADER)
      .send({ startDate: '2020-01-01', endDate: '2020-01-07' });

    expect(res.status).toBe(400);
    expect(windowCreateMock).not.toHaveBeenCalled();
  });

  it('403s a DISPATCHER creating a window', async () => {
    companyRoleFindManyMock.mockResolvedValue([{ role: 'DISPATCHER', companyId: COMPANY_A }]);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/windows`)
      .set(AUTH_HEADER)
      .send({ startDate: '2099-08-03', endDate: '2099-08-09' });

    expect(res.status).toBe(403);
  });
});

describe('window declaration sweeps waiting bookings', () => {
  it('attaches every windowless REQUESTED booking to the new week and notifies each customer', async () => {
    bookingFindManyMock.mockResolvedValue([{ id: 'wait-1' }, { id: 'wait-2' }]);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/windows`)
      .set(AUTH_HEADER)
      .send({ startDate: '2099-08-03', endDate: '2099-08-09' });

    expect(res.status).toBe(201);
    expect(res.body.data.attachedBookings).toBe(2);
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['wait-1', 'wait-2'] }, status: 'REQUESTED', collectionWindowId: null },
      data: { collectionWindowId: 'w-1' },
    });
    expect(notifyWeekSetMock).toHaveBeenCalledWith('wait-1');
    expect(notifyWeekSetMock).toHaveBeenCalledWith('wait-2');
  });

  it('reports zero attached when nothing was waiting', async () => {
    bookingFindManyMock.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/windows`)
      .set(AUTH_HEADER)
      .send({ startDate: '2099-08-03', endDate: '2099-08-09' });

    expect(res.status).toBe(201);
    expect(res.body.data.attachedBookings).toBe(0);
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
    expect(notifyWeekSetMock).not.toHaveBeenCalled();
  });
});

describe('billing', () => {
  const RATE = { basePerStopPence: 500, tierSmallPence: 300, tierMediumPence: 500, tierLargePence: 800, tierXlPence: 1200 };

  it('snapshots the charge when handover is confirmed with a rate configured', async () => {
    rateFindUniqueMock.mockResolvedValue(RATE);
    bookingFindUniqueMock.mockResolvedValue({
      id: 'booking-1', companyId: COMPANY_A, status: 'AT_WAREHOUSE',
      itemTypes: ['DRUM'], parcelSizeTier: 'MEDIUM', numberOfParcels: 3,
    });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/booking-1/confirm-handover`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    // 500 base + 500 medium x 3 parcels = 2000p
    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking-1', status: 'AT_WAREHOUSE' },
      data: { status: 'HANDED_OVER', chargePence: 2000 },
    });
  });

  it('leaves vehicle bookings uncharged (quoted separately)', async () => {
    rateFindUniqueMock.mockResolvedValue(RATE);
    bookingFindUniqueMock.mockResolvedValue({
      id: 'booking-1', companyId: COMPANY_A, status: 'AT_WAREHOUSE',
      itemTypes: ['VEHICLE'], parcelSizeTier: 'EXTRA_LARGE', numberOfParcels: 1,
    });

    const app = createApp();
    await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/bookings/booking-1/confirm-handover`)
      .set(AUTH_HEADER);

    expect(bookingUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'booking-1', status: 'AT_WAREHOUSE' },
      data: { status: 'HANDED_OVER', chargePence: null },
    });
  });

  it('returns the statement grouped by collection week with totals', async () => {
    rateFindUniqueMock.mockResolvedValue(RATE);
    const win = { startDate: new Date('2026-08-03'), endDate: new Date('2026-08-09') };
    bookingFindManyMock.mockResolvedValue([
      { id: 'b1', reference: 'FC-x-1', customerName: 'A', parcelSizeTier: 'MEDIUM', numberOfParcels: 1,
        chargePence: 1000, itemTypes: ['DRUM'], collectionWindowId: 'w1', collectionWindow: win, updatedAt: new Date() },
      { id: 'b2', reference: 'FC-x-2', customerName: 'B', parcelSizeTier: 'LARGE', numberOfParcels: 2,
        chargePence: 2100, itemTypes: ['FRIDGE'], collectionWindowId: 'w1', collectionWindow: win, updatedAt: new Date() },
      { id: 'b3', reference: 'FC-x-3', customerName: 'C', parcelSizeTier: 'EXTRA_LARGE', numberOfParcels: 1,
        chargePence: null, itemTypes: ['VEHICLE'], collectionWindowId: null, collectionWindow: null, updatedAt: new Date() },
    ]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_A}/billing`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.grandTotalPence).toBe(3100);
    expect(res.body.data.groups).toHaveLength(2);
    const weekGroup = res.body.data.groups.find((g: { window: unknown }) => g.window !== null);
    expect(weekGroup.totalPence).toBe(3100);
    expect(weekGroup.lines).toHaveLength(2);
    const vehicleLine = res.body.data.groups.find((g: { window: unknown }) => g.window === null).lines[0];
    expect(vehicleLine.isVehicle).toBe(true);
    expect(vehicleLine.chargePence).toBeNull();
  });

  it("403s (tenant isolation) reading another company's statement", async () => {
    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_B}/billing`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });
});
