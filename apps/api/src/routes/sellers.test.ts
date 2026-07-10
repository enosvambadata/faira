import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const userFindUniqueMock = vi.fn();
const listingFindManyMock = vi.fn();
const orderCountMock = vi.fn();
const followCountMock = vi.fn();
const followFindUniqueMock = vi.fn();
const followUpsertMock = vi.fn();
const followDeleteManyMock = vi.fn();
const conversationCountMock = vi.fn();
const sellerProfileUpsertMock = vi.fn();
const escrowLedgerEntryAggregateMock = vi.fn();
const escrowLedgerEntryCreateMock = vi.fn();
const payoutRequestCreateMock = vi.fn();
const transactionMock = vi.fn();

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
    listing: { findMany: (...args: unknown[]) => listingFindManyMock(...args) },
    order: { count: (...args: unknown[]) => orderCountMock(...args) },
    follow: {
      count: (...args: unknown[]) => followCountMock(...args),
      findUnique: (...args: unknown[]) => followFindUniqueMock(...args),
      upsert: (...args: unknown[]) => followUpsertMock(...args),
      deleteMany: (...args: unknown[]) => followDeleteManyMock(...args),
    },
    conversation: { count: (...args: unknown[]) => conversationCountMock(...args) },
    sellerProfile: { upsert: (...args: unknown[]) => sellerProfileUpsertMock(...args) },
    escrowLedgerEntry: {
      aggregate: (...args: unknown[]) => escrowLedgerEntryAggregateMock(...args),
      create: (...args: unknown[]) => escrowLedgerEntryCreateMock(...args),
    },
    payoutRequest: { create: (...args: unknown[]) => payoutRequestCreateMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const VIEWER_ID = 'viewer-1';
const SELLER_ID = 'seller-1';

function fakeSeller(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SELLER_ID,
    displayName: 'Rudo',
    avatarUrl: 'https://cdn/rudo.jpg',
    city: 'Harare',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    sellerProfile: { ratingAvg: { toString: () => '4.50' }, ratingCount: 12, isVerified: false },
    ...overrides,
  };
}

describe('GET /api/v1/sellers/:id', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    userFindUniqueMock.mockReset();
    listingFindManyMock.mockReset();
    orderCountMock.mockReset();
    followCountMock.mockReset();
    followFindUniqueMock.mockReset();
    conversationCountMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: VIEWER_ID } }, error: null });
    listingFindManyMock.mockResolvedValue([]);
    orderCountMock.mockResolvedValue(0);
    followCountMock.mockResolvedValue(0);
    followFindUniqueMock.mockResolvedValue(null);
    conversationCountMock.mockResolvedValue(0);
  });

  it('returns the public seller profile', async () => {
    userFindUniqueMock.mockResolvedValue(fakeSeller());
    listingFindManyMock.mockResolvedValue([
      { id: 'l1', title: 'Nike Air Max', price: { toString: () => '45.5' }, city: 'Harare', imageUrls: ['a.jpg'], createdAt: new Date() },
    ]);
    orderCountMock.mockResolvedValue(3);
    followCountMock.mockResolvedValue(7);
    followFindUniqueMock.mockResolvedValue({ id: 'follow-1' });
    conversationCountMock.mockResolvedValueOnce(4).mockResolvedValueOnce(3);

    const app = createApp();
    const res = await request(app).get(`/api/v1/sellers/${SELLER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: SELLER_ID,
      displayName: 'Rudo',
      avatarUrl: 'https://cdn/rudo.jpg',
      city: 'Harare',
      joinedAt: '2026-01-01T00:00:00.000Z',
      ratingAvg: '4.50',
      ratingCount: 12,
      isVerified: false,
      salesCount: 3,
      responseRate: 75,
      followerCount: 7,
      isFollowing: true,
      activeListings: [
        { id: 'l1', title: 'Nike Air Max', price: '45.5', city: 'Harare', imageUrls: ['a.jpg'], createdAt: expect.any(String) },
      ],
    });
  });

  it('defaults rating and verified status when the seller has no SellerProfile row', async () => {
    userFindUniqueMock.mockResolvedValue(fakeSeller({ sellerProfile: null }));

    const app = createApp();
    const res = await request(app).get(`/api/v1/sellers/${SELLER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.ratingAvg).toBe('0');
    expect(res.body.data.ratingCount).toBe(0);
    expect(res.body.data.isVerified).toBe(false);
  });

  it('surfaces a verified badge once SellerProfile.isVerified is true', async () => {
    userFindUniqueMock.mockResolvedValue(fakeSeller({ sellerProfile: { ratingAvg: { toString: () => '0' }, ratingCount: 0, isVerified: true } }));

    const app = createApp();
    const res = await request(app).get(`/api/v1/sellers/${SELLER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.isVerified).toBe(true);
  });

  it('returns a null response rate when the seller has no conversations yet', async () => {
    userFindUniqueMock.mockResolvedValue(fakeSeller());
    conversationCountMock.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const app = createApp();
    const res = await request(app).get(`/api/v1/sellers/${SELLER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.responseRate).toBeNull();
  });

  it('returns 404 for a nonexistent seller', async () => {
    userFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get(`/api/v1/sellers/${SELLER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get(`/api/v1/sellers/${SELLER_ID}`);

    expect(res.status).toBe(401);
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/sellers/:id/follow', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    userFindUniqueMock.mockReset();
    followUpsertMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: VIEWER_ID } }, error: null });
  });

  it('follows the seller', async () => {
    userFindUniqueMock.mockResolvedValue(fakeSeller());
    followUpsertMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app).post(`/api/v1/sellers/${SELLER_ID}/follow`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ sellerId: SELLER_ID, following: true });
    expect(followUpsertMock).toHaveBeenCalledWith({
      where: { followerId_sellerId: { followerId: VIEWER_ID, sellerId: SELLER_ID } },
      update: {},
      create: { followerId: VIEWER_ID, sellerId: SELLER_ID },
    });
  });

  it('rejects following yourself', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });

    const app = createApp();
    const res = await request(app).post(`/api/v1/sellers/${SELLER_ID}/follow`).set(AUTH_HEADER);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(followUpsertMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent seller', async () => {
    userFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post(`/api/v1/sellers/${SELLER_ID}/follow`).set(AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(followUpsertMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post(`/api/v1/sellers/${SELLER_ID}/follow`);

    expect(res.status).toBe(401);
    expect(followUpsertMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/sellers/:id/follow', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    followDeleteManyMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: VIEWER_ID } }, error: null });
  });

  it('unfollows the seller', async () => {
    followDeleteManyMock.mockResolvedValue({ count: 1 });

    const app = createApp();
    const res = await request(app).delete(`/api/v1/sellers/${SELLER_ID}/follow`).set(AUTH_HEADER);

    expect(res.status).toBe(204);
    expect(followDeleteManyMock).toHaveBeenCalledWith({
      where: { followerId: VIEWER_ID, sellerId: SELLER_ID },
    });
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).delete(`/api/v1/sellers/${SELLER_ID}/follow`);

    expect(res.status).toBe(401);
    expect(followDeleteManyMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/sellers/me/settings', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    sellerProfileUpsertMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
  });

  it('enables cash on delivery for the caller', async () => {
    sellerProfileUpsertMock.mockResolvedValue({ codEnabled: true });

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/sellers/me/settings')
      .set(AUTH_HEADER)
      .send({ codEnabled: true });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ codEnabled: true });
    expect(sellerProfileUpsertMock).toHaveBeenCalledWith({
      where: { userId: SELLER_ID },
      update: { codEnabled: true },
      create: { userId: SELLER_ID, codEnabled: true },
    });
  });

  it('400s on an invalid payload', async () => {
    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/sellers/me/settings')
      .set(AUTH_HEADER)
      .send({ codEnabled: 'yes' });

    expect(res.status).toBe(400);
    expect(sellerProfileUpsertMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).patch('/api/v1/sellers/me/settings').send({ codEnabled: true });

    expect(res.status).toBe(401);
    expect(sellerProfileUpsertMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/sellers/me/balance', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    escrowLedgerEntryAggregateMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
  });

  it('returns released minus paid-out as the available balance', async () => {
    escrowLedgerEntryAggregateMock
      .mockResolvedValueOnce({ _sum: { amount: 150 } })
      .mockResolvedValueOnce({ _sum: { amount: 30 } });

    const app = createApp();
    const res = await request(app).get('/api/v1/sellers/me/balance').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ availableBalance: 120, minimumPayoutAmount: 5 });
  });

  it('returns 0 when there are no ledger entries yet', async () => {
    escrowLedgerEntryAggregateMock
      .mockResolvedValueOnce({ _sum: { amount: null } })
      .mockResolvedValueOnce({ _sum: { amount: null } });

    const app = createApp();
    const res = await request(app).get('/api/v1/sellers/me/balance').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.availableBalance).toBe(0);
  });
});

describe('POST /api/v1/sellers/me/payout-requests', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    escrowLedgerEntryAggregateMock.mockReset();
    payoutRequestCreateMock.mockReset();
    escrowLedgerEntryCreateMock.mockReset();
    transactionMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        payoutRequest: { create: (...args: unknown[]) => payoutRequestCreateMock(...args) },
        escrowLedgerEntry: { create: (...args: unknown[]) => escrowLedgerEntryCreateMock(...args) },
      }),
    );
  });

  it('creates a payout request and reserves the amount via a PAYOUT ledger entry', async () => {
    escrowLedgerEntryAggregateMock
      .mockResolvedValueOnce({ _sum: { amount: 100 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } });
    payoutRequestCreateMock.mockResolvedValue({
      id: 'payout-1',
      amount: { toString: () => '50' },
      status: 'PENDING',
      requestedAt: new Date('2026-07-10T00:00:00Z'),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/sellers/me/payout-requests')
      .set(AUTH_HEADER)
      .send({ amount: 50, payoutMethodDetails: '+263771234567' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(payoutRequestCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sellerId: SELLER_ID, amount: 50 }) }),
    );
    expect(escrowLedgerEntryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'PAYOUT', amount: 50, payoutRequestId: 'payout-1' }) }),
    );
  });

  it('400s below the $5 minimum', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/sellers/me/payout-requests')
      .set(AUTH_HEADER)
      .send({ amount: 2, payoutMethodDetails: '+263771234567' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BELOW_MINIMUM_PAYOUT');
    expect(payoutRequestCreateMock).not.toHaveBeenCalled();
  });

  it('400s when the amount exceeds the available balance', async () => {
    escrowLedgerEntryAggregateMock
      .mockResolvedValueOnce({ _sum: { amount: 20 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/sellers/me/payout-requests')
      .set(AUTH_HEADER)
      .send({ amount: 50, payoutMethodDetails: '+263771234567' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(payoutRequestCreateMock).not.toHaveBeenCalled();
  });
});
