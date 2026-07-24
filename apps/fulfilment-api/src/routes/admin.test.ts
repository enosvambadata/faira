import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

const fulfilmentVerificationFindManyMock = vi.fn();
const fulfilmentVerificationFindUniqueMock = vi.fn();
const fulfilmentVerificationUpdateMock = vi.fn();
const collectionEventFindUniqueMock = vi.fn();
const auditLogCreateMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    fulfilmentVerificationRequest: {
      findMany: (...args: unknown[]) => fulfilmentVerificationFindManyMock(...args),
      findUnique: (...args: unknown[]) => fulfilmentVerificationFindUniqueMock(...args),
      update: (...args: unknown[]) => fulfilmentVerificationUpdateMock(...args),
    },
    collectionEvent: { findUnique: (...args: unknown[]) => collectionEventFindUniqueMock(...args) },
    // recordAuditLog writes here (append-only, best-effort).
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
  },
}));

vi.mock('../lib/cloudinary', () => ({
  getParcelEvidenceViewUrl: (publicId: string) => `https://signed.example/${publicId}`,
}));

const { createApp } = await import('../app');

const ADMIN_TOKEN = 'test-admin-secret';
const ADMIN_HEADER = { 'x-admin-token': ADMIN_TOKEN };

beforeEach(() => {
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
});

afterEach(() => {
  delete process.env.ADMIN_TOKEN;
});

describe('GET /api/v1/admin/fulfilment/verification-requests', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    fulfilmentVerificationFindManyMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('lists submitted/under-review requests oldest first', async () => {
    fulfilmentVerificationFindManyMock.mockResolvedValue([
      {
        id: 'v1',
        status: 'SUBMITTED',
        seller: { id: 'seller-1', displayName: 'Tendai' },
        idDocumentUrl: 'seller-1/id-1',
        businessDocumentUrl: null,
        shopPhotoUrl: null,
        createdAt: new Date('2026-07-11T00:00:00Z'),
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/fulfilment/verification-requests').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: 'v1',
        status: 'SUBMITTED',
        seller: { id: 'seller-1', displayName: 'Tendai' },
        hasIdDocument: true,
        hasBusinessDocument: false,
        hasShopPhoto: false,
        createdAt: '2026-07-11T00:00:00.000Z',
      },
    ]);
    expect(fulfilmentVerificationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    );
  });

  it('rejects a request without the admin token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/admin/fulfilment/verification-requests');

    expect(res.status).toBe(401);
    expect(fulfilmentVerificationFindManyMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/fulfilment/verification-requests/:id/resolve', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    fulfilmentVerificationFindUniqueMock.mockReset();
    fulfilmentVerificationUpdateMock.mockReset();
    auditLogCreateMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('approves a verification request', async () => {
    fulfilmentVerificationFindUniqueMock.mockResolvedValue({ id: 'v1', sellerId: 'seller-1', status: 'SUBMITTED' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/fulfilment/verification-requests/v1/resolve')
      .set(ADMIN_HEADER)
      .send({ decision: 'APPROVE' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'v1', status: 'APPROVED' });
    expect(fulfilmentVerificationUpdateMock).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { status: 'APPROVED', reviewNotes: null, reviewedAt: expect.any(Date) },
    });
    expect(auditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'seller-1', action: 'FULFILMENT_VERIFICATION_RESOLVED' }) }),
    );
  });

  it('rejects with notes', async () => {
    fulfilmentVerificationFindUniqueMock.mockResolvedValue({ id: 'v1', sellerId: 'seller-1', status: 'UNDER_REVIEW' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/fulfilment/verification-requests/v1/resolve')
      .set(ADMIN_HEADER)
      .send({ decision: 'REJECT', notes: 'Blurry ID photo' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
    expect(fulfilmentVerificationUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reviewNotes: 'Blurry ID photo' }) }),
    );
  });

  it('requests more info', async () => {
    fulfilmentVerificationFindUniqueMock.mockResolvedValue({ id: 'v1', sellerId: 'seller-1', status: 'SUBMITTED' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/fulfilment/verification-requests/v1/resolve')
      .set(ADMIN_HEADER)
      .send({ decision: 'MORE_INFO_REQUIRED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('MORE_INFO_REQUIRED');
  });

  it('409s when already resolved', async () => {
    fulfilmentVerificationFindUniqueMock.mockResolvedValue({ id: 'v1', sellerId: 'seller-1', status: 'APPROVED' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/fulfilment/verification-requests/v1/resolve')
      .set(ADMIN_HEADER)
      .send({ decision: 'APPROVE' });

    expect(res.status).toBe(409);
    expect(fulfilmentVerificationUpdateMock).not.toHaveBeenCalled();
  });

  it('404s for a nonexistent request', async () => {
    fulfilmentVerificationFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/fulfilment/verification-requests/nonexistent/resolve')
      .set(ADMIN_HEADER)
      .send({ decision: 'APPROVE' });

    expect(res.status).toBe(404);
  });

  it('400s on an invalid decision', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/fulfilment/verification-requests/v1/resolve')
      .set(ADMIN_HEADER)
      .send({ decision: 'MAYBE' });

    expect(res.status).toBe(400);
    expect(fulfilmentVerificationUpdateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/fulfilment/collection-events/:shipmentId', () => {
  it('returns the collection event with a fresh signed proof-photo URL', async () => {
    collectionEventFindUniqueMock.mockResolvedValue({
      id: 'event-1',
      shipmentId: 'shipment-1',
      idCheckPerformed: true,
      idCheckOverrideReason: null,
      proofImageUrl: 'parcel-evidence/abc123',
      createdAt: new Date('2026-07-01T00:00:00Z'),
      shipment: { reference: 'FF-HRE-000001' },
      verifiedBy: { id: 'agent-1', displayName: 'Agent One' },
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/fulfilment/collection-events/shipment-1').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: 'event-1',
      shipmentId: 'shipment-1',
      shipmentReference: 'FF-HRE-000001',
      verifiedBy: { id: 'agent-1', displayName: 'Agent One' },
      idCheckPerformed: true,
      idCheckOverrideReason: null,
      proofImageUrl: 'https://signed.example/parcel-evidence/abc123',
      createdAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('returns proofImageUrl: null when no photo was captured', async () => {
    collectionEventFindUniqueMock.mockResolvedValue({
      id: 'event-1',
      shipmentId: 'shipment-1',
      idCheckPerformed: false,
      idCheckOverrideReason: 'Supervisor override -- buyer verified by phone',
      proofImageUrl: null,
      createdAt: new Date('2026-07-01T00:00:00Z'),
      shipment: { reference: 'FF-HRE-000001' },
      verifiedBy: { id: 'agent-1', displayName: 'Agent One' },
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/fulfilment/collection-events/shipment-1').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.proofImageUrl).toBeNull();
    expect(res.body.data.idCheckOverrideReason).toBe('Supervisor override -- buyer verified by phone');
  });

  it('404s when no collection event exists for that shipment', async () => {
    collectionEventFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/fulfilment/collection-events/shipment-1').set(ADMIN_HEADER);

    expect(res.status).toBe(404);
  });

  it('fails closed without a valid admin token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/admin/fulfilment/collection-events/shipment-1').set({ 'x-admin-token': 'wrong-token' });

    expect(res.status).toBe(401);
  });
});
