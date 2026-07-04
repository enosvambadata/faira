import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const categoryFindUniqueMock = vi.fn();
const listingCreateMock = vi.fn();
const listingFindManyMock = vi.fn();
const listingFindUniqueMock = vi.fn();
const listingUpdateMock = vi.fn();
const signListingUploadMock = vi.fn();

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
    category: { findUnique: (...args: unknown[]) => categoryFindUniqueMock(...args) },
    listing: {
      create: (...args: unknown[]) => listingCreateMock(...args),
      findMany: (...args: unknown[]) => listingFindManyMock(...args),
      findUnique: (...args: unknown[]) => listingFindUniqueMock(...args),
      update: (...args: unknown[]) => listingUpdateMock(...args),
    },
  },
}));

vi.mock('../lib/cloudinary', () => ({
  signListingUpload: (...args: unknown[]) => signListingUploadMock(...args),
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const VALID_PAYLOAD = {
  title: 'Nike Air Max, size 9',
  price: 45.5,
  condition: 'GOOD',
  city: 'Harare',
  categoryId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516',
  imageUrls: ['https://res.cloudinary.com/x/listings/a.jpg'],
  deliveryOptions: ['Seller delivers'],
  attributes: { size: '9', brand: 'Nike' },
};

describe('POST /api/v1/listings/upload-signature', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    signListingUploadMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('returns a signed upload payload for an authenticated user', async () => {
    signListingUploadMock.mockReturnValue({
      signature: 'sig',
      timestamp: 123,
      apiKey: 'key',
      cloudName: 'cloud',
      folder: 'listings',
      transformation: 'w_1600,h_1600,c_limit',
    });

    const app = createApp();
    const res = await request(app).post('/api/v1/listings/upload-signature').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.signature).toBe('sig');
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/listings/upload-signature');

    expect(res.status).toBe(401);
    expect(signListingUploadMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/listings', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    categoryFindUniqueMock.mockReset();
    listingCreateMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    categoryFindUniqueMock.mockResolvedValue({ id: VALID_PAYLOAD.categoryId, name: 'Fashion', slug: 'fashion' });
  });

  it('creates a listing for the authenticated seller', async () => {
    listingCreateMock.mockResolvedValue({
      id: 'listing-1',
      title: VALID_PAYLOAD.title,
      description: null,
      price: { toString: () => '45.5' },
      condition: 'GOOD',
      city: 'Harare',
      categoryId: VALID_PAYLOAD.categoryId,
      imageUrls: VALID_PAYLOAD.imageUrls,
      deliveryOptions: VALID_PAYLOAD.deliveryOptions,
      status: 'ACTIVE',
      attributes: [
        { key: 'size', value: '9' },
        { key: 'brand', value: 'Nike' },
      ],
      createdAt: new Date('2026-07-04T00:00:00Z'),
    });

    const app = createApp();
    const res = await request(app).post('/api/v1/listings').set(AUTH_HEADER).send(VALID_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('listing-1');
    expect(res.body.data.attributes).toEqual({ size: '9', brand: 'Nike' });
    expect(listingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sellerId: 'user-1', title: VALID_PAYLOAD.title }),
      }),
    );
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/listings').send(VALID_PAYLOAD);

    expect(res.status).toBe(401);
    expect(listingCreateMock).not.toHaveBeenCalled();
  });

  it('rejects a payload with more than 6 images', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/listings')
      .set(AUTH_HEADER)
      .send({ ...VALID_PAYLOAD, imageUrls: Array(7).fill('https://res.cloudinary.com/x/listings/a.jpg') });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(listingCreateMock).not.toHaveBeenCalled();
  });

  it('rejects a payload missing required fields', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/listings')
      .set(AUTH_HEADER)
      .send({ title: 'Missing everything else' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(listingCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown categoryId', async () => {
    categoryFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/listings').set(AUTH_HEADER).send(VALID_PAYLOAD);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(listingCreateMock).not.toHaveBeenCalled();
  });
});

function fakeListing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'listing-1',
    title: 'Nike Air Max',
    price: { toString: () => '45.5' },
    city: 'Harare',
    imageUrls: ['https://res.cloudinary.com/x/listings/a.jpg'],
    createdAt: new Date('2026-07-04T00:00:00Z'),
    ...overrides,
  };
}

describe('GET /api/v1/listings', () => {
  beforeEach(() => {
    listingFindManyMock.mockReset();
  });

  it('returns the newest-first page, no auth required', async () => {
    listingFindManyMock.mockResolvedValue([fakeListing()]);

    const app = createApp();
    const res = await request(app).get('/api/v1/listings');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.hasMore).toBe(false);
    expect(listingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: 0,
      }),
    );
  });

  it('sets hasMore when there are more results than the page size', async () => {
    listingFindManyMock.mockResolvedValue(Array.from({ length: 21 }, (_, i) => fakeListing({ id: `listing-${i}` })));

    const app = createApp();
    const res = await request(app).get('/api/v1/listings');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.hasMore).toBe(true);
  });

  it('applies the page offset', async () => {
    listingFindManyMock.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/listings?page=3');

    expect(listingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ skip: 40 }));
  });

  it('rejects an invalid page param', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/listings?page=0');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/listings/:id', () => {
  beforeEach(() => {
    listingFindUniqueMock.mockReset();
  });

  it('returns the listing with seller and category', async () => {
    listingFindUniqueMock.mockResolvedValue({
      ...fakeListing(),
      description: 'Barely worn',
      condition: 'GOOD',
      deliveryOptions: ['Buyer collects'],
      status: 'ACTIVE',
      category: { id: 'cat-1', name: 'Fashion & Clothing', slug: 'fashion' },
      attributes: [{ key: 'size', value: '9' }],
      seller: { id: 'user-1', displayName: 'Tendai', avatarUrl: null, city: 'Harare' },
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/listings/listing-1');

    expect(res.status).toBe(200);
    expect(res.body.data.seller.displayName).toBe('Tendai');
    expect(res.body.data.attributes).toEqual({ size: '9' });
    expect(res.body.data.category.name).toBe('Fashion & Clothing');
  });

  it('returns 404 for an unknown listing', async () => {
    listingFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/listings/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LISTING_NOT_FOUND');
  });

  it('returns 404 for a soft-deleted listing', async () => {
    listingFindUniqueMock.mockResolvedValue({ ...fakeListing(), deletedAt: new Date() });

    const app = createApp();
    const res = await request(app).get('/api/v1/listings/listing-1');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LISTING_NOT_FOUND');
  });
});

describe('GET /api/v1/listings/mine', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    listingFindManyMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('returns only the authenticated seller\'s own listings', async () => {
    listingFindManyMock.mockResolvedValue([fakeListing({ status: 'SOLD' })]);

    const app = createApp();
    const res = await request(app).get('/api/v1/listings/mine').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('SOLD');
    expect(listingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sellerId: 'user-1', deletedAt: null } }),
    );
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/listings/mine');

    expect(res.status).toBe(401);
    expect(listingFindManyMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/listings/:id', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    listingFindUniqueMock.mockReset();
    listingUpdateMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('updates price, description, and photos for the owner', async () => {
    listingFindUniqueMock.mockResolvedValue({ ...fakeListing(), sellerId: 'user-1', deletedAt: null });
    listingUpdateMock.mockResolvedValue({
      ...fakeListing(),
      price: { toString: () => '30' },
      description: 'Updated description',
      condition: 'GOOD',
      deliveryOptions: ['Seller delivers'],
      status: 'ACTIVE',
      attributes: [],
    });

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/listings/listing-1')
      .set(AUTH_HEADER)
      .send({ price: 30, description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe('30');
    expect(res.body.data.description).toBe('Updated description');
    expect(listingUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { price: 30, description: 'Updated description' } }),
    );
  });

  it('rejects a request from a non-owner', async () => {
    listingFindUniqueMock.mockResolvedValue({ ...fakeListing(), sellerId: 'someone-else', deletedAt: null });

    const app = createApp();
    const res = await request(app).patch('/api/v1/listings/listing-1').set(AUTH_HEADER).send({ price: 30 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(listingUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a deleted listing', async () => {
    listingFindUniqueMock.mockResolvedValue({ ...fakeListing(), sellerId: 'user-1', deletedAt: new Date() });

    const app = createApp();
    const res = await request(app).patch('/api/v1/listings/listing-1').set(AUTH_HEADER).send({ price: 30 });

    expect(res.status).toBe(404);
    expect(listingUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid payload', async () => {
    const app = createApp();
    const res = await request(app).patch('/api/v1/listings/listing-1').set(AUTH_HEADER).send({ price: -5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(listingUpdateMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/listings/:id/sold', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    listingFindUniqueMock.mockReset();
    listingUpdateMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('marks the owner\'s listing as sold', async () => {
    listingFindUniqueMock.mockResolvedValue({ ...fakeListing(), sellerId: 'user-1', deletedAt: null });
    listingUpdateMock.mockResolvedValue({ id: 'listing-1', status: 'SOLD' });

    const app = createApp();
    const res = await request(app).patch('/api/v1/listings/listing-1/sold').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SOLD');
    expect(listingUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SOLD' } }),
    );
  });

  it('rejects a request from a non-owner', async () => {
    listingFindUniqueMock.mockResolvedValue({ ...fakeListing(), sellerId: 'someone-else', deletedAt: null });

    const app = createApp();
    const res = await request(app).patch('/api/v1/listings/listing-1/sold').set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(listingUpdateMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/listings/:id', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    listingFindUniqueMock.mockReset();
    listingUpdateMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('soft-deletes the owner\'s listing', async () => {
    listingFindUniqueMock.mockResolvedValue({ ...fakeListing(), sellerId: 'user-1', deletedAt: null });
    listingUpdateMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app).delete('/api/v1/listings/listing-1').set(AUTH_HEADER);

    expect(res.status).toBe(204);
    expect(listingUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
  });

  it('rejects a request from a non-owner', async () => {
    listingFindUniqueMock.mockResolvedValue({ ...fakeListing(), sellerId: 'someone-else', deletedAt: null });

    const app = createApp();
    const res = await request(app).delete('/api/v1/listings/listing-1').set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(listingUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an already-deleted listing', async () => {
    listingFindUniqueMock.mockResolvedValue({ ...fakeListing(), sellerId: 'user-1', deletedAt: new Date() });

    const app = createApp();
    const res = await request(app).delete('/api/v1/listings/listing-1').set(AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(listingUpdateMock).not.toHaveBeenCalled();
  });
});
