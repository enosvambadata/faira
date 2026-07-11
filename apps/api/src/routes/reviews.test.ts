import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const reviewFindUniqueMock = vi.fn();
const reviewFlagCreateMock = vi.fn();

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
    user: { upsert: vi.fn().mockResolvedValue({}) },
    review: { findUnique: (...args: unknown[]) => reviewFindUniqueMock(...args) },
    reviewFlag: { create: (...args: unknown[]) => reviewFlagCreateMock(...args) },
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';
const REVIEW_ID = 'review-1';

function fakeReview(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REVIEW_ID,
    order: { buyerId: BUYER_ID, listing: { sellerId: SELLER_ID } },
    ...overrides,
  };
}

describe('POST /api/v1/reviews/:reviewId/flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } }, error: null });
  });

  it('lets the buyer flag a review on their order', async () => {
    reviewFindUniqueMock.mockResolvedValue(fakeReview());
    reviewFlagCreateMock.mockResolvedValue({
      id: 'flag-1',
      reviewId: REVIEW_ID,
      status: 'PENDING',
      createdAt: new Date('2026-07-11T00:00:00Z'),
    });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/reviews/${REVIEW_ID}/flag`)
      .set(AUTH_HEADER)
      .send({ reason: 'This is abusive' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(reviewFlagCreateMock).toHaveBeenCalledWith({
      data: { reviewId: REVIEW_ID, flaggedById: BUYER_ID, reason: 'This is abusive' },
    });
  });

  it('lets the seller flag a review too', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
    reviewFindUniqueMock.mockResolvedValue(fakeReview());
    reviewFlagCreateMock.mockResolvedValue({ id: 'flag-2', reviewId: REVIEW_ID, status: 'PENDING', createdAt: new Date() });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/reviews/${REVIEW_ID}/flag`)
      .set(AUTH_HEADER)
      .send({ reason: 'This is false' });

    expect(res.status).toBe(201);
  });

  it('403s when the caller is not part of the underlying order', async () => {
    reviewFindUniqueMock.mockResolvedValue(fakeReview({ order: { buyerId: 'someone-else', listing: { sellerId: 'someone-else-2' } } }));

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/reviews/${REVIEW_ID}/flag`)
      .set(AUTH_HEADER)
      .send({ reason: 'abusive' });

    expect(res.status).toBe(403);
    expect(reviewFlagCreateMock).not.toHaveBeenCalled();
  });

  it('404s when the review does not exist', async () => {
    reviewFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/reviews/${REVIEW_ID}/flag`)
      .set(AUTH_HEADER)
      .send({ reason: 'abusive' });

    expect(res.status).toBe(404);
  });

  it('409s when the review has already been flagged', async () => {
    const { Prisma } = await import('@prisma/client');
    reviewFindUniqueMock.mockResolvedValue(fakeReview());
    reviewFlagCreateMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/reviews/${REVIEW_ID}/flag`)
      .set(AUTH_HEADER)
      .send({ reason: 'abusive' });

    expect(res.status).toBe(409);
  });

  it('400s on an empty reason', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/reviews/${REVIEW_ID}/flag`)
      .set(AUTH_HEADER)
      .send({ reason: '' });

    expect(res.status).toBe(400);
    expect(reviewFlagCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post(`/api/v1/reviews/${REVIEW_ID}/flag`).send({ reason: 'abusive' });

    expect(res.status).toBe(401);
    expect(reviewFlagCreateMock).not.toHaveBeenCalled();
  });
});
