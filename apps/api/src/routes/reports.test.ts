import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const listingFindUniqueMock = vi.fn();
const userFindUniqueMock = vi.fn();
const reportCreateMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
    },
  },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
    listing: { findUnique: (...args: unknown[]) => listingFindUniqueMock(...args) },
    report: { create: (...args: unknown[]) => reportCreateMock(...args) },
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const REPORTER_ID = 'reporter-1';
const LISTING_ID = '64d25c37-d8f0-4a11-b92e-ecb9b168f516';
const SELLER_ID = '9c1e1e7a-3b8e-4c2b-9d0a-1a2b3c4d5e6f';

describe('POST /api/v1/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: REPORTER_ID } }, error: null });
  });

  it('creates a report against a listing', async () => {
    listingFindUniqueMock.mockResolvedValue({ id: LISTING_ID, deletedAt: null });
    reportCreateMock.mockResolvedValue({
      id: 'report-1',
      targetType: 'LISTING',
      targetId: LISTING_ID,
      status: 'PENDING',
      createdAt: new Date('2026-07-11T00:00:00Z'),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/reports')
      .set(AUTH_HEADER)
      .send({ targetType: 'LISTING', targetId: LISTING_ID, reason: 'FAKE_ITEM', note: 'Not as described' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(reportCreateMock).toHaveBeenCalledWith({
      data: {
        reporterId: REPORTER_ID,
        targetType: 'LISTING',
        targetId: LISTING_ID,
        reason: 'FAKE_ITEM',
        note: 'Not as described',
        evidenceImageUrls: [],
      },
    });
  });

  it('creates a report against a seller (USER)', async () => {
    userFindUniqueMock.mockResolvedValue({ id: SELLER_ID });
    reportCreateMock.mockResolvedValue({ id: 'report-2', targetType: 'USER', targetId: SELLER_ID, status: 'PENDING', createdAt: new Date() });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/reports')
      .set(AUTH_HEADER)
      .send({ targetType: 'USER', targetId: SELLER_ID, reason: 'SCAM' });

    expect(res.status).toBe(201);
    expect(reportCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetType: 'USER', targetId: SELLER_ID, reason: 'SCAM', note: null }) }),
    );
  });

  it('404s when the listing does not exist', async () => {
    listingFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/reports')
      .set(AUTH_HEADER)
      .send({ targetType: 'LISTING', targetId: LISTING_ID, reason: 'OTHER' });

    expect(res.status).toBe(404);
    expect(reportCreateMock).not.toHaveBeenCalled();
  });

  it('404s when the listing is soft-deleted', async () => {
    listingFindUniqueMock.mockResolvedValue({ id: LISTING_ID, deletedAt: new Date() });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/reports')
      .set(AUTH_HEADER)
      .send({ targetType: 'LISTING', targetId: LISTING_ID, reason: 'OTHER' });

    expect(res.status).toBe(404);
    expect(reportCreateMock).not.toHaveBeenCalled();
  });

  it('404s when the reported user does not exist', async () => {
    userFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/reports')
      .set(AUTH_HEADER)
      .send({ targetType: 'USER', targetId: SELLER_ID, reason: 'OTHER' });

    expect(res.status).toBe(404);
    expect(reportCreateMock).not.toHaveBeenCalled();
  });

  it('rejects reporting yourself', async () => {
    userFindUniqueMock.mockResolvedValue({ id: REPORTER_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/reports')
      .set(AUTH_HEADER)
      .send({ targetType: 'USER', targetId: REPORTER_ID, reason: 'OTHER' });

    expect(res.status).toBe(400);
    expect(reportCreateMock).not.toHaveBeenCalled();
  });

  it('400s on an invalid reason', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/reports')
      .set(AUTH_HEADER)
      .send({ targetType: 'LISTING', targetId: LISTING_ID, reason: 'NOT_A_REAL_REASON' });

    expect(res.status).toBe(400);
    expect(reportCreateMock).not.toHaveBeenCalled();
  });

  it('400s on an invalid targetType', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/reports')
      .set(AUTH_HEADER)
      .send({ targetType: 'MESSAGE', targetId: LISTING_ID, reason: 'OTHER' });

    expect(res.status).toBe(400);
    expect(reportCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/reports').send({ targetType: 'LISTING', targetId: LISTING_ID, reason: 'OTHER' });

    expect(res.status).toBe(401);
    expect(reportCreateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/reports/upload-signature', () => {
  it('returns a signed Cloudinary upload payload', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: REPORTER_ID } }, error: null });

    const app = createApp();
    const res = await request(app).post('/api/v1/reports/upload-signature').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('signature');
    expect(res.body.data.folder).toBe('reports');
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/reports/upload-signature');

    expect(res.status).toBe(401);
  });
});
