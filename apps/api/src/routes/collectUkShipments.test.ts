import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Set before importing the app so the tracking-token module (read at call
// time) can sign/verify real tokens for the public tracking test.
process.env.COLLECT_UK_TRACKING_TOKEN_SECRET = 'test-shipment-secret';

const getUserMock = vi.fn();
const companyRoleFindManyMock = vi.fn();
const auditLogCreateMock = vi.fn();
const shipmentCreateMock = vi.fn();
const shipmentFindManyMock = vi.fn();
const shipmentFindUniqueMock = vi.fn();
const shipmentUpdateMock = vi.fn();
const recipientCreateMock = vi.fn();
const recipientFindUniqueMock = vi.fn();
const recipientDeleteMock = vi.fn();
const milestoneCreateMock = vi.fn();
const milestoneUpdateMock = vi.fn();
const bookingFindUniqueMock = vi.fn();
const notifyShipmentMilestoneMock = vi.fn();

vi.mock('../services/collectUkShipmentNotifications', () => ({
  notifyShipmentMilestone: (...args: unknown[]) => notifyShipmentMilestoneMock(...args),
}));

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    collectUkCompanyRole: { findMany: (...args: unknown[]) => companyRoleFindManyMock(...args) },
    collectUkShipment: {
      create: (...args: unknown[]) => shipmentCreateMock(...args),
      findMany: (...args: unknown[]) => shipmentFindManyMock(...args),
      findUnique: (...args: unknown[]) => shipmentFindUniqueMock(...args),
      update: (...args: unknown[]) => shipmentUpdateMock(...args),
    },
    collectUkShipmentRecipient: {
      create: (...args: unknown[]) => recipientCreateMock(...args),
      findUnique: (...args: unknown[]) => recipientFindUniqueMock(...args),
      delete: (...args: unknown[]) => recipientDeleteMock(...args),
    },
    collectUkShipmentMilestone: {
      create: (...args: unknown[]) => milestoneCreateMock(...args),
      update: (...args: unknown[]) => milestoneUpdateMock(...args),
    },
    collectUkCollectionBooking: { findUnique: (...args: unknown[]) => bookingFindUniqueMock(...args) },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
  },
}));

const { createApp } = await import('../app');
const { generateShipmentTrackingToken } = await import('../lib/collectUkShipmentToken');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const USER_ID = 'user-1';
const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';
const SHIPMENT_A = '33333333-3333-4333-8333-333333333333';
const BOOKING_A = '44444444-4444-4444-8444-444444444444';
const RECIPIENT_A = '55555555-5555-4555-8555-555555555555';

function milestoneRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    shipmentId: SHIPMENT_A,
    stage: 'Vessel sailed',
    location: null,
    note: null,
    pickupAddress: null,
    pickupFrom: null,
    pickupTo: null,
    notifiedCount: 0,
    createdAt: new Date('2026-07-16T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  companyRoleFindManyMock.mockResolvedValue([{ role: 'COMPANY_ADMIN', companyId: COMPANY_A }]);
  auditLogCreateMock.mockResolvedValue({});
  shipmentFindUniqueMock.mockResolvedValue({ id: SHIPMENT_A, companyId: COMPANY_A });
  notifyShipmentMilestoneMock.mockResolvedValue(0);
});

describe('POST /api/v1/collect-uk/companies/:id/shipments', () => {
  it('creates a shipment for a company the caller is assigned to', async () => {
    shipmentCreateMock.mockResolvedValue({
      id: SHIPMENT_A,
      reference: 'Container to Harare - Jul',
      destinationCountry: 'Zimbabwe',
      status: 'PREPARING',
      createdAt: new Date('2026-07-15T00:00:00Z'),
    });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments`)
      .set(AUTH_HEADER)
      .send({ reference: 'Container to Harare - Jul', destinationCountry: 'Zimbabwe' });

    expect(res.status).toBe(201);
    expect(res.body.data.reference).toBe('Container to Harare - Jul');
    expect(shipmentCreateMock).toHaveBeenCalledWith({
      data: { companyId: COMPANY_A, reference: 'Container to Harare - Jul', destinationCountry: 'Zimbabwe' },
    });
  });

  it('rejects when the caller is not assigned to that company', async () => {
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_B}/shipments`)
      .set(AUTH_HEADER)
      .send({ reference: 'X' });

    expect(res.status).toBe(403);
    expect(shipmentCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an empty reference', async () => {
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments`)
      .set(AUTH_HEADER)
      .send({ reference: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/collect-uk/companies/:id/shipments/:shipmentId/recipients', () => {
  it('adds a recipient by linking an existing booking (copies name + contact)', async () => {
    bookingFindUniqueMock.mockResolvedValue({
      id: BOOKING_A,
      companyId: COMPANY_A,
      customerName: 'Tendai M',
      customerContact: '+447700900123',
    });
    recipientCreateMock.mockResolvedValue({
      id: RECIPIENT_A,
      customerName: 'Tendai M',
      customerContact: '+447700900123',
      bookingId: BOOKING_A,
      createdAt: new Date('2026-07-16T00:00:00Z'),
    });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/recipients`)
      .set(AUTH_HEADER)
      .send({ bookingId: BOOKING_A });

    expect(res.status).toBe(201);
    expect(recipientCreateMock).toHaveBeenCalledWith({
      data: { shipmentId: SHIPMENT_A, bookingId: BOOKING_A, customerName: 'Tendai M', customerContact: '+447700900123' },
    });
  });

  it('adds a manual recipient and normalises a UK national number to E.164', async () => {
    recipientCreateMock.mockResolvedValue({
      id: RECIPIENT_A,
      customerName: 'Rudo K',
      customerContact: '+447459920895',
      bookingId: null,
      createdAt: new Date('2026-07-16T00:00:00Z'),
    });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/recipients`)
      .set(AUTH_HEADER)
      .send({ customerName: 'Rudo K', customerContact: '07459 920895' });

    expect(res.status).toBe(201);
    expect(recipientCreateMock).toHaveBeenCalledWith({
      data: { shipmentId: SHIPMENT_A, bookingId: null, customerName: 'Rudo K', customerContact: '+447459920895' },
    });
  });

  it('rejects when neither a booking nor customer details are given', async () => {
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/recipients`)
      .set(AUTH_HEADER)
      .send({});

    expect(res.status).toBe(400);
    expect(recipientCreateMock).not.toHaveBeenCalled();
  });

  it('404s a booking that belongs to another company', async () => {
    bookingFindUniqueMock.mockResolvedValue({ id: BOOKING_A, companyId: COMPANY_B, customerName: 'X', customerContact: '+447700900123' });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/recipients`)
      .set(AUTH_HEADER)
      .send({ bookingId: BOOKING_A });

    expect(res.status).toBe(404);
    expect(recipientCreateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/collect-uk/companies/:id/shipments/:shipmentId/milestones', () => {
  it('posts a milestone, fans out SMS, and records the notified count', async () => {
    milestoneCreateMock.mockResolvedValue(milestoneRow({ stage: 'Arrived at Walvis Bay', location: 'Walvis Bay' }));
    milestoneUpdateMock.mockResolvedValue({});
    notifyShipmentMilestoneMock.mockResolvedValue(3);

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/milestones`)
      .set(AUTH_HEADER)
      .send({ stage: 'Arrived at Walvis Bay', location: 'Walvis Bay' });

    expect(res.status).toBe(201);
    expect(notifyShipmentMilestoneMock).toHaveBeenCalledWith(SHIPMENT_A, 'm-1');
    expect(milestoneUpdateMock).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { notifiedCount: 3 } });
    expect(res.body.data.notifiedCount).toBe(3);
  });

  it('does not notify when notify:false', async () => {
    milestoneCreateMock.mockResolvedValue(milestoneRow());

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/milestones`)
      .set(AUTH_HEADER)
      .send({ stage: 'Booked onto vessel', notify: false });

    expect(res.status).toBe(201);
    expect(notifyShipmentMilestoneMock).not.toHaveBeenCalled();
    expect(res.body.data.notifiedCount).toBe(0);
  });

  it('updates shipment status when setStatus is provided', async () => {
    milestoneCreateMock.mockResolvedValue(milestoneRow({ stage: 'At Harare storage' }));

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/milestones`)
      .set(AUTH_HEADER)
      .send({ stage: 'At Harare storage', setStatus: 'ARRIVED', notify: false });

    expect(res.status).toBe(201);
    expect(shipmentUpdateMock).toHaveBeenCalledWith({ where: { id: SHIPMENT_A }, data: { status: 'ARRIVED' } });
  });
});

describe('GET /api/v1/collect-uk/shipment-tracking/:token', () => {
  it('returns the milestone timeline for a valid recipient token', async () => {
    recipientFindUniqueMock.mockResolvedValue({
      id: RECIPIENT_A,
      customerName: 'Tendai M',
      shipment: {
        reference: 'Container to Harare - Jul',
        destinationCountry: 'Zimbabwe',
        status: 'IN_TRANSIT',
        company: { name: 'ABC Logistics' },
        milestones: [milestoneRow({ stage: 'Vessel sailed' })],
      },
    });

    const token = generateShipmentTrackingToken(RECIPIENT_A);
    const res = await request(createApp()).get(`/api/v1/collect-uk/shipment-tracking/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.companyName).toBe('ABC Logistics');
    expect(res.body.data.customerName).toBe('Tendai M');
    expect(res.body.data.milestones).toHaveLength(1);
    expect(res.body.data.milestones[0].stage).toBe('Vessel sailed');
  });

  it('404s an invalid token', async () => {
    const res = await request(createApp()).get('/api/v1/collect-uk/shipment-tracking/not-a-real-token');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});
