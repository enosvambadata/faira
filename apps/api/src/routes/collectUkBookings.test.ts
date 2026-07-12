import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const companyFindUniqueMock = vi.fn();
const companyUpdateMock = vi.fn();
const warehouseFindFirstMock = vi.fn();
const bookingCreateMock = vi.fn();
const bookingFindUniqueMock = vi.fn();
const transactionMock = vi.fn();
const notifyBookingConfirmedMock = vi.fn();
const geocodePostcodeMock = vi.fn();

vi.mock('../lib/collectUkGeo', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/collectUkGeo')>()),
  geocodePostcode: (...args: unknown[]) => geocodePostcodeMock(...args),
}));

vi.mock('../services/collectUkNotifications', () => ({
  notifyBookingConfirmed: (...args: unknown[]) => notifyBookingConfirmedMock(...args),
  notifyCollectionScheduled: vi.fn(),
  notifyParcelCollected: vi.fn(),
  notifyUnableToCollect: vi.fn(),
  notifyArrivedAtWarehouse: vi.fn(),
  notifyHandedOver: vi.fn(),
}));

vi.mock('../prisma', () => ({
  prisma: {
    collectUkCompany: {
      findUnique: (...args: unknown[]) => companyFindUniqueMock(...args),
      update: (...args: unknown[]) => companyUpdateMock(...args),
    },
    collectUkCompanyWarehouse: { findFirst: (...args: unknown[]) => warehouseFindFirstMock(...args) },
    collectUkCollectionBooking: {
      create: (...args: unknown[]) => bookingCreateMock(...args),
      findUnique: (...args: unknown[]) => bookingFindUniqueMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');
const { generateBookingTrackingToken } = await import('../lib/collectUkBookingToken');

const COMPANY = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'ABC Logistics',
  slug: 'abc-logistics',
  countriesServed: ['Zimbabwe', 'Zambia'],
  isActive: true,
  nextBookingSequence: 5,
};

const WAREHOUSE = { id: 'wh-1', companyId: COMPANY.id, isActive: true, createdAt: new Date('2026-01-01') };

const VALID_BOOKING_BODY = {
  customerName: 'Jane Customer',
  customerContact: '+447700900000',
  destinationCountry: 'Zimbabwe',
  collectionAddress: '10 Test St',
  collectionPostcode: 'E1 6AN',
  preferredDate: '2026-08-01',
  parcelSizeTier: 'MEDIUM',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.COLLECT_UK_TRACKING_TOKEN_SECRET = 'test-collect-uk-tracking-secret';
  companyFindUniqueMock.mockResolvedValue(COMPANY);
  warehouseFindFirstMock.mockResolvedValue(WAREHOUSE);
  notifyBookingConfirmedMock.mockResolvedValue(undefined);
  geocodePostcodeMock.mockResolvedValue({ latitude: 51.5074, longitude: -0.1278 });
  companyUpdateMock.mockResolvedValue({ ...COMPANY, nextBookingSequence: 6 });
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      collectUkCompany: { update: (...args: unknown[]) => companyUpdateMock(...args) },
      collectUkCollectionBooking: { create: (...args: unknown[]) => bookingCreateMock(...args) },
    }),
  );
});

describe('GET /api/v1/collect-uk/book/:companySlug', () => {
  it('returns company info for an active company', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/book/abc-logistics');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: COMPANY.id, name: COMPANY.name, countriesServed: COMPANY.countriesServed });
  });

  it('404s for a nonexistent company', async () => {
    companyFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/book/nonexistent');

    expect(res.status).toBe(404);
  });

  it('404s for an inactive company', async () => {
    companyFindUniqueMock.mockResolvedValue({ ...COMPANY, isActive: false });

    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/book/abc-logistics');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/collect-uk/book/:companySlug', () => {
  it('creates a booking and returns a reference and tracking URL', async () => {
    bookingCreateMock.mockResolvedValue({
      id: 'booking-1',
      reference: 'FC-abc-logistics-000005',
    });

    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/book/abc-logistics').send(VALID_BOOKING_BODY);

    expect(res.status).toBe(201);
    expect(res.body.data.reference).toBe('FC-abc-logistics-000005');
    expect(res.body.data.trackingUrl).toContain('/collect-uk/track/');
    expect(bookingCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: COMPANY.id,
        warehouseId: WAREHOUSE.id,
        customerName: 'Jane Customer',
        destinationCountry: 'Zimbabwe',
        collectionLatitude: 51.5074,
        collectionLongitude: -0.1278,
      }),
    });
    expect(notifyBookingConfirmedMock).toHaveBeenCalledWith('booking-1');
  });

  it('stores the requested number of parcels', async () => {
    bookingCreateMock.mockResolvedValue({ id: 'booking-1', reference: 'FC-abc-logistics-000005' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/collect-uk/book/abc-logistics')
      .send({ ...VALID_BOOKING_BODY, numberOfParcels: 4 });

    expect(res.status).toBe(201);
    expect(bookingCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ numberOfParcels: 4 }) });
  });

  it('defaults to one parcel when numberOfParcels is omitted', async () => {
    bookingCreateMock.mockResolvedValue({ id: 'booking-1', reference: 'FC-abc-logistics-000005' });

    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/book/abc-logistics').send(VALID_BOOKING_BODY);

    expect(res.status).toBe(201);
    expect(bookingCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ numberOfParcels: 1 }) });
  });

  it('400s on a parcel count outside 1-50', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/collect-uk/book/abc-logistics')
      .send({ ...VALID_BOOKING_BODY, numberOfParcels: 0 });

    expect(res.status).toBe(400);
    expect(bookingCreateMock).not.toHaveBeenCalled();
  });

  it('still creates the booking when geocoding fails (best-effort)', async () => {
    geocodePostcodeMock.mockResolvedValue(null);
    bookingCreateMock.mockResolvedValue({ id: 'booking-1', reference: 'FC-abc-logistics-000005' });

    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/book/abc-logistics').send(VALID_BOOKING_BODY);

    expect(res.status).toBe(201);
    expect(bookingCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ collectionLatitude: undefined, collectionLongitude: undefined }),
    });
  });

  it('400s on an invalid body', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/collect-uk/book/abc-logistics')
      .send({ ...VALID_BOOKING_BODY, customerName: '' });

    expect(res.status).toBe(400);
    expect(bookingCreateMock).not.toHaveBeenCalled();
    expect(notifyBookingConfirmedMock).not.toHaveBeenCalled();
  });

  it('404s for a nonexistent company', async () => {
    companyFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/book/nonexistent').send(VALID_BOOKING_BODY);

    expect(res.status).toBe(404);
  });

  it('400s when the destination country is not served by this company', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/collect-uk/book/abc-logistics')
      .send({ ...VALID_BOOKING_BODY, destinationCountry: 'Ghana' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COUNTRY_NOT_SERVED');
    expect(bookingCreateMock).not.toHaveBeenCalled();
  });

  it('409s when the company has no active warehouse', async () => {
    warehouseFindFirstMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/collect-uk/book/abc-logistics').send(VALID_BOOKING_BODY);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_WAREHOUSE_CONFIGURED');
    expect(bookingCreateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/collect-uk/tracking/:token', () => {
  it('returns buyer-safe booking info for a valid token', async () => {
    bookingFindUniqueMock.mockResolvedValue({
      id: 'booking-1',
      reference: 'FC-abc-logistics-000005',
      status: 'REQUESTED',
      destinationCountry: 'Zimbabwe',
      collectionAddress: '10 Test St',
      collectionPostcode: 'E1 6AN',
      preferredDate: new Date('2026-08-01T00:00:00Z'),
      company: { name: 'ABC Logistics' },
    });
    const token = generateBookingTrackingToken('booking-1');

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/tracking/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.companyName).toBe('ABC Logistics');
    expect(res.body.data.status).toBe('Booking received -- awaiting scheduling');
  });

  it('404s for a malformed token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/tracking/not-a-real-token');

    expect(res.status).toBe(404);
    expect(bookingFindUniqueMock).not.toHaveBeenCalled();
  });

  it('404s when the token is valid but no booking exists', async () => {
    bookingFindUniqueMock.mockResolvedValue(null);
    const token = generateBookingTrackingToken('booking-1');

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/tracking/${token}`);

    expect(res.status).toBe(404);
  });

  it('rate-limits repeated requests from the same client', async () => {
    bookingFindUniqueMock.mockResolvedValue({
      id: 'booking-1',
      reference: 'FC-abc-logistics-000005',
      status: 'REQUESTED',
      destinationCountry: 'Zimbabwe',
      collectionAddress: '10 Test St',
      collectionPostcode: 'E1 6AN',
      preferredDate: new Date('2026-08-01T00:00:00Z'),
      company: { name: 'ABC Logistics' },
    });
    const token = generateBookingTrackingToken('booking-1');
    const app = createApp();

    let lastStatus = 200;
    for (let i = 0; i < 25; i++) {
      const res = await request(app).get(`/api/v1/collect-uk/tracking/${token}`);
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});
