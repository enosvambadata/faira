import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

const verificationFindManyMock = vi.fn();
const verificationFindUniqueMock = vi.fn();
const transactionMock = vi.fn();
const verificationUpdateMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    verificationRequest: {
      findMany: (...args: unknown[]) => verificationFindManyMock(...args),
      findUnique: (...args: unknown[]) => verificationFindUniqueMock(...args),
      update: (...args: unknown[]) => verificationUpdateMock(...args),
    },
    sellerProfile: { upsert: vi.fn() },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');

const ADMIN_TOKEN = 'test-admin-secret';
const ADMIN_HEADER = { 'x-admin-token': ADMIN_TOKEN };

function fakeRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'verification-1',
    sellerId: 'seller-1',
    status: 'PENDING',
    idDocumentUrl: 'https://res.cloudinary.com/x/verification/id.jpg',
    selfieUrl: 'https://res.cloudinary.com/x/verification/selfie.jpg',
    rejectionReason: null,
    createdAt: new Date('2026-07-05T00:00:00Z'),
    reviewedAt: null,
    seller: { id: 'seller-1', displayName: 'Rudo', city: 'Harare' },
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
});

afterEach(() => {
  delete process.env.ADMIN_TOKEN;
});

describe('GET /api/v1/admin/verification', () => {
  beforeEach(() => {
    verificationFindManyMock.mockReset();
  });

  it('lists pending verification requests by default', async () => {
    verificationFindManyMock.mockResolvedValue([fakeRequest()]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/verification').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('PENDING');
    expect(verificationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' } }),
    );
  });

  it('filters by an explicit status', async () => {
    verificationFindManyMock.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/verification?status=APPROVED').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(verificationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'APPROVED' } }),
    );
  });

  it('rejects a request with no admin token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/admin/verification');

    expect(res.status).toBe(401);
    expect(verificationFindManyMock).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong admin token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/admin/verification').set({ 'x-admin-token': 'wrong' });

    expect(res.status).toBe(401);
    expect(verificationFindManyMock).not.toHaveBeenCalled();
  });

  it('fails closed when ADMIN_TOKEN is not configured', async () => {
    delete process.env.ADMIN_TOKEN;

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/verification').set(ADMIN_HEADER);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('ADMIN_NOT_CONFIGURED');
  });
});

describe('POST /api/v1/admin/verification/:id/approve', () => {
  beforeEach(() => {
    verificationFindUniqueMock.mockReset();
    transactionMock.mockReset();
  });

  it('approves a pending request and marks the seller verified', async () => {
    verificationFindUniqueMock.mockResolvedValue(fakeRequest());
    transactionMock.mockResolvedValue([{}, {}]);

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/verification-1/approve').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'verification-1', status: 'APPROVED' });
    expect(transactionMock).toHaveBeenCalled();
  });

  it('rejects approving a request that is not pending', async () => {
    verificationFindUniqueMock.mockResolvedValue(fakeRequest({ status: 'APPROVED' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/verification-1/approve').set(ADMIN_HEADER);

    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent request', async () => {
    verificationFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/nonexistent/approve').set(ADMIN_HEADER);

    expect(res.status).toBe(404);
  });

  it('rejects without a valid admin token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/verification-1/approve');

    expect(res.status).toBe(401);
    expect(verificationFindUniqueMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/verification/:id/reject', () => {
  beforeEach(() => {
    verificationFindUniqueMock.mockReset();
    verificationUpdateMock.mockReset();
  });

  it('rejects a pending request with a reason', async () => {
    verificationFindUniqueMock.mockResolvedValue(fakeRequest());
    verificationUpdateMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/verification/verification-1/reject')
      .set(ADMIN_HEADER)
      .send({ reason: 'Photo is blurry' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'verification-1', status: 'REJECTED' });
    expect(verificationUpdateMock).toHaveBeenCalledWith({
      where: { id: 'verification-1' },
      data: { status: 'REJECTED', reviewedAt: expect.any(Date), rejectionReason: 'Photo is blurry' },
    });
  });

  it('rejects a request that is not pending', async () => {
    verificationFindUniqueMock.mockResolvedValue(fakeRequest({ status: 'REJECTED' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/verification-1/reject').set(ADMIN_HEADER).send({});

    expect(res.status).toBe(400);
    expect(verificationUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent request', async () => {
    verificationFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/nonexistent/reject').set(ADMIN_HEADER).send({});

    expect(res.status).toBe(404);
  });

  it('rejects without a valid admin token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/verification-1/reject').send({});

    expect(res.status).toBe(401);
    expect(verificationFindUniqueMock).not.toHaveBeenCalled();
  });
});
