import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const wishlistFindManyMock = vi.fn();
const wishlistUpsertMock = vi.fn();
const wishlistDeleteManyMock = vi.fn();
const listingFindUniqueMock = vi.fn();

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
    listing: { findUnique: (...args: unknown[]) => listingFindUniqueMock(...args) },
    wishlistItem: {
      findMany: (...args: unknown[]) => wishlistFindManyMock(...args),
      upsert: (...args: unknown[]) => wishlistUpsertMock(...args),
      deleteMany: (...args: unknown[]) => wishlistDeleteManyMock(...args),
    },
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };

function fakeListing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'listing-1',
    title: 'Nike Air Max',
    price: { toString: () => '45.5' },
    city: 'Harare',
    imageUrls: ['https://res.cloudinary.com/x/listings/a.jpg'],
    status: 'ACTIVE',
    deletedAt: null,
    ...overrides,
  };
}

describe('GET /api/v1/wishlist', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    wishlistFindManyMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('returns saved listings newest-saved first, including sold status', async () => {
    wishlistFindManyMock.mockResolvedValue([
      { createdAt: new Date('2026-07-04T00:00:00Z'), listing: fakeListing({ status: 'SOLD' }) },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/wishlist').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('SOLD');
    expect(wishlistFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', listing: { deletedAt: null } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/wishlist');

    expect(res.status).toBe(401);
    expect(wishlistFindManyMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/wishlist/ids', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    wishlistFindManyMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('returns just the saved listing ids', async () => {
    wishlistFindManyMock.mockResolvedValue([{ listingId: 'listing-1' }, { listingId: 'listing-2' }]);

    const app = createApp();
    const res = await request(app).get('/api/v1/wishlist/ids').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['listing-1', 'listing-2']);
  });
});

describe('POST /api/v1/wishlist/:listingId', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    listingFindUniqueMock.mockReset();
    wishlistUpsertMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('saves a listing idempotently', async () => {
    listingFindUniqueMock.mockResolvedValue(fakeListing());
    wishlistUpsertMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app).post('/api/v1/wishlist/listing-1').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ listingId: 'listing-1', saved: true });
    expect(wishlistUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_listingId: { userId: 'user-1', listingId: 'listing-1' } },
      }),
    );
  });

  it('returns 404 for a nonexistent listing', async () => {
    listingFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/wishlist/nonexistent').set(AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(wishlistUpsertMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a soft-deleted listing', async () => {
    listingFindUniqueMock.mockResolvedValue(fakeListing({ deletedAt: new Date() }));

    const app = createApp();
    const res = await request(app).post('/api/v1/wishlist/listing-1').set(AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(wishlistUpsertMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/wishlist/listing-1');

    expect(res.status).toBe(401);
    expect(wishlistUpsertMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/wishlist/:listingId', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    wishlistDeleteManyMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('removes a saved listing', async () => {
    wishlistDeleteManyMock.mockResolvedValue({ count: 1 });

    const app = createApp();
    const res = await request(app).delete('/api/v1/wishlist/listing-1').set(AUTH_HEADER);

    expect(res.status).toBe(204);
    expect(wishlistDeleteManyMock).toHaveBeenCalledWith({ where: { userId: 'user-1', listingId: 'listing-1' } });
  });

  it('is idempotent when nothing was saved', async () => {
    wishlistDeleteManyMock.mockResolvedValue({ count: 0 });

    const app = createApp();
    const res = await request(app).delete('/api/v1/wishlist/listing-1').set(AUTH_HEADER);

    expect(res.status).toBe(204);
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).delete('/api/v1/wishlist/listing-1');

    expect(res.status).toBe(401);
    expect(wishlistDeleteManyMock).not.toHaveBeenCalled();
  });
});
