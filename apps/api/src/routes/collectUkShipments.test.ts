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
const parcelCreateMock = vi.fn();
const parcelFindUniqueMock = vi.fn();
const parcelUpdateMock = vi.fn();
const parcelDeleteMock = vi.fn();
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
    collectUkShipmentParcel: {
      create: (...args: unknown[]) => parcelCreateMock(...args),
      findUnique: (...args: unknown[]) => parcelFindUniqueMock(...args),
      update: (...args: unknown[]) => parcelUpdateMock(...args),
      delete: (...args: unknown[]) => parcelDeleteMock(...args),
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
const PARCEL_A = '66666666-6666-4666-8666-666666666666';

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

describe('Shipment manifest (parcels)', () => {
  function parcelRow(overrides: Record<string, unknown> = {}) {
    return {
      id: PARCEL_A,
      recipientId: null,
      senderName: "Tendai M",
      receiverName: "Mai Tendai",
      receiverContact: "+263771234567",
      receiverAddress: "12 Chatsworth Rd",
      receiverCity: "Harare",
      description: "2 drums clothing",
      category: "DRUM",
      pieces: 2,
      weightKg: 40,
      declaredValuePence: 15000,
      createdAt: new Date("2026-07-17T00:00:00Z"),
      ...overrides,
    };
  }

  it("adds a manual parcel (typed sender + receiver)", async () => {
    parcelCreateMock.mockResolvedValue(parcelRow());

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/parcels`)
      .set(AUTH_HEADER)
      .send({ senderName: "Tendai M", receiverName: "Mai Tendai", description: "2 drums clothing", pieces: 2 });

    expect(res.status).toBe(201);
    expect(parcelCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shipmentId: SHIPMENT_A,
          recipientId: null,
          senderName: "Tendai M",
          receiverName: "Mai Tendai",
        }),
      }),
    );
  });

  it("copies the sender name from a linked recipient", async () => {
    recipientFindUniqueMock.mockResolvedValue({ id: RECIPIENT_A, shipmentId: SHIPMENT_A, customerName: "Tendai M" });
    parcelCreateMock.mockResolvedValue(parcelRow({ recipientId: RECIPIENT_A }));

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/parcels`)
      .set(AUTH_HEADER)
      .send({ recipientId: RECIPIENT_A, receiverName: "Mai Tendai", description: "1 box" });

    expect(res.status).toBe(201);
    expect(parcelCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipientId: RECIPIENT_A, senderName: "Tendai M" }) }),
    );
  });

  it("rejects a parcel with neither a recipient nor a sender name", async () => {
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/parcels`)
      .set(AUTH_HEADER)
      .send({ receiverName: "Mai Tendai", description: "1 box" });

    expect(res.status).toBe(400);
    expect(parcelCreateMock).not.toHaveBeenCalled();
  });

  it("blocks adding a parcel once the manifest is finalized", async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: SHIPMENT_A, companyId: COMPANY_A, manifestFinalizedAt: new Date() });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/parcels`)
      .set(AUTH_HEADER)
      .send({ senderName: "X", receiverName: "Y", description: "z" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATE");
    expect(parcelCreateMock).not.toHaveBeenCalled();
  });

  it("deletes a parcel", async () => {
    parcelFindUniqueMock.mockResolvedValue({
      id: PARCEL_A,
      shipmentId: SHIPMENT_A,
      shipment: { companyId: COMPANY_A, manifestFinalizedAt: null },
    });
    parcelDeleteMock.mockResolvedValue({});

    const res = await request(createApp())
      .delete(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/parcels/${PARCEL_A}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(parcelDeleteMock).toHaveBeenCalledWith({ where: { id: PARCEL_A } });
  });

  const loadableParcel = { ...parcelRow(), shipmentId: SHIPMENT_A, loadedAt: null, shipment: { companyId: COMPANY_A } };

  it("marks a parcel loaded onto the shipment (scan-out)", async () => {
    parcelFindUniqueMock.mockResolvedValue({ ...loadableParcel });
    parcelUpdateMock.mockResolvedValue({ ...loadableParcel, loadedAt: new Date("2026-07-17T12:00:00Z") });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/parcels/${PARCEL_A}/load`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.alreadyLoaded).toBe(false);
    expect(res.body.data.loadedAt).toBeTruthy();
    expect(parcelUpdateMock).toHaveBeenCalled();
  });

  it("reports alreadyLoaded on a re-scan without touching the row", async () => {
    parcelFindUniqueMock.mockResolvedValue({ ...loadableParcel, loadedAt: new Date("2026-07-17T11:00:00Z") });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/parcels/${PARCEL_A}/load`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.alreadyLoaded).toBe(true);
    expect(parcelUpdateMock).not.toHaveBeenCalled();
  });

  it("404s a parcel code that isn't on this shipment", async () => {
    parcelFindUniqueMock.mockResolvedValue({ ...loadableParcel, shipment: { companyId: COMPANY_B } });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/parcels/${PARCEL_A}/load`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(parcelUpdateMock).not.toHaveBeenCalled();
  });

  it("unloads a parcel", async () => {
    parcelFindUniqueMock.mockResolvedValue({ ...loadableParcel, loadedAt: new Date() });
    parcelUpdateMock.mockResolvedValue({ ...loadableParcel, loadedAt: null });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/parcels/${PARCEL_A}/unload`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(parcelUpdateMock).toHaveBeenCalledWith({ where: { id: PARCEL_A }, data: { loadedAt: null } });
  });

  it("finalizes a manifest that has parcels", async () => {
    shipmentFindUniqueMock.mockResolvedValue({
      id: SHIPMENT_A,
      companyId: COMPANY_A,
      manifestFinalizedAt: null,
      parcels: [parcelRow()],
    });
    shipmentUpdateMock.mockResolvedValue({ manifestFinalizedAt: new Date("2026-07-17T10:00:00Z") });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/manifest/finalize`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.finalizedAt).toBeTruthy();
    expect(shipmentUpdateMock).toHaveBeenCalled();
  });

  it("refuses to finalize an empty manifest", async () => {
    shipmentFindUniqueMock.mockResolvedValue({ id: SHIPMENT_A, companyId: COMPANY_A, manifestFinalizedAt: null, parcels: [] });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}/manifest/finalize`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(shipmentUpdateMock).not.toHaveBeenCalled();
  });

  it("returns manifest totals on the shipment detail", async () => {
    shipmentFindUniqueMock.mockResolvedValue({
      id: SHIPMENT_A,
      companyId: COMPANY_A,
      reference: "Container to Harare",
      destinationCountry: "Zimbabwe",
      status: "PREPARING",
      manifestFinalizedAt: null,
      createdAt: new Date("2026-07-15T00:00:00Z"),
      recipients: [],
      milestones: [],
      parcels: [
        parcelRow({ pieces: 2, weightKg: 40, declaredValuePence: 15000, loadedAt: new Date("2026-07-17T12:00:00Z") }),
        parcelRow({ id: "p-2", pieces: 1, weightKg: 5, declaredValuePence: 2500, loadedAt: null }),
      ],
    });

    const res = await request(createApp())
      .get(`/api/v1/collect-uk/companies/${COMPANY_A}/shipments/${SHIPMENT_A}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.manifest).toEqual(
      expect.objectContaining({ parcelCount: 2, loadedCount: 1, totalPieces: 3, totalWeightKg: 45, totalDeclaredValuePence: 17500 }),
    );
    expect(res.body.data.parcels).toHaveLength(2);
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
