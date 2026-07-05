import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const deletionFindFirstMock = vi.fn();
const deletionCreateMock = vi.fn();
const deletionUpdateMock = vi.fn();
const auditLogCreateMock = vi.fn();
const listingFindManyMock = vi.fn();
const orderFindManyMock = vi.fn();
const messageFindManyMock = vi.fn();
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
    user: { upsert: vi.fn().mockResolvedValue({}) },
    accountDeletionRequest: {
      findFirst: (...args: unknown[]) => deletionFindFirstMock(...args),
      create: (...args: unknown[]) => deletionCreateMock(...args),
      update: (...args: unknown[]) => deletionUpdateMock(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    listing: { findMany: (...args: unknown[]) => listingFindManyMock(...args) },
    order: { findMany: (...args: unknown[]) => orderFindManyMock(...args) },
    message: { findMany: (...args: unknown[]) => messageFindManyMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const USER_ID = 'user-1';

function fakeRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'deletion-1',
    userId: USER_ID,
    status: 'PENDING',
    requestedAt: new Date('2026-07-05T00:00:00Z'),
    scheduledFor: new Date('2026-08-04T00:00:00Z'),
    processedAt: null,
    ...overrides,
  };
}

describe('GET /api/v1/account/deletion-request', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    deletionFindFirstMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it('returns the latest deletion request', async () => {
    deletionFindFirstMock.mockResolvedValue(fakeRequest());

    const app = createApp();
    const res = await request(app).get('/api/v1/account/deletion-request').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('returns null when nothing has ever been requested', async () => {
    deletionFindFirstMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/account/deletion-request').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/account/deletion-request');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/account/deletion-request', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    deletionFindFirstMock.mockReset();
    transactionMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it('creates a deletion request scheduled ~30 days out and logs it', async () => {
    deletionFindFirstMock.mockResolvedValue(null);
    transactionMock.mockResolvedValue([fakeRequest(), {}]);

    const app = createApp();
    const res = await request(app).post('/api/v1/account/deletion-request').set(AUTH_HEADER);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(transactionMock).toHaveBeenCalled();
  });

  it('rejects a second request while one is already pending', async () => {
    deletionFindFirstMock.mockResolvedValue(fakeRequest());

    const app = createApp();
    const res = await request(app).post('/api/v1/account/deletion-request').set(AUTH_HEADER);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DELETION_ALREADY_PENDING');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/account/deletion-request');

    expect(res.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/account/deletion-request', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    deletionFindFirstMock.mockReset();
    transactionMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it('cancels a pending request', async () => {
    deletionFindFirstMock.mockResolvedValue(fakeRequest());
    transactionMock.mockResolvedValue([{}, {}]);

    const app = createApp();
    const res = await request(app).delete('/api/v1/account/deletion-request').set(AUTH_HEADER);

    expect(res.status).toBe(204);
    expect(transactionMock).toHaveBeenCalled();
  });

  it('returns 404 when there is nothing pending to cancel', async () => {
    deletionFindFirstMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).delete('/api/v1/account/deletion-request').set(AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).delete('/api/v1/account/deletion-request');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/account/export', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    listingFindManyMock.mockReset();
    orderFindManyMock.mockReset();
    messageFindManyMock.mockReset();
    auditLogCreateMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it('returns the user\'s own listings, orders, and messages', async () => {
    listingFindManyMock.mockResolvedValue([
      { id: 'l1', title: 'Nike Air Max', description: null, price: { toString: () => '45.5' }, condition: 'GOOD', city: 'Harare', imageUrls: [], status: 'ACTIVE', createdAt: new Date() },
    ]);
    orderFindManyMock.mockResolvedValue([
      { id: 'o1', listingId: 'l2', priceAtPurchase: { toString: () => '20' }, status: 'DELIVERED', createdAt: new Date() },
    ]);
    messageFindManyMock.mockResolvedValue([
      { id: 'm1', conversationId: 'c1', body: 'Hi', imageUrl: null, createdAt: new Date() },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/account/export').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.listings).toHaveLength(1);
    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.data.messages).toHaveLength(1);
    expect(listingFindManyMock).toHaveBeenCalledWith({ where: { sellerId: USER_ID } });
    expect(orderFindManyMock).toHaveBeenCalledWith({ where: { buyerId: USER_ID } });
    expect(messageFindManyMock).toHaveBeenCalledWith({ where: { senderId: USER_ID } });
    expect(auditLogCreateMock).toHaveBeenCalledWith({ data: { userId: USER_ID, action: 'DATA_EXPORT_REQUESTED' } });
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/account/export');

    expect(res.status).toBe(401);
    expect(listingFindManyMock).not.toHaveBeenCalled();
  });
});
