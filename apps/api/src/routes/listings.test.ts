import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const categoryFindUniqueMock = vi.fn();
const listingCreateMock = vi.fn();
const listingFindManyMock = vi.fn();
const listingCountMock = vi.fn();
const listingFindUniqueMock = vi.fn();
const listingUpdateMock = vi.fn();
const listingAttributeFindManyMock = vi.fn();
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
      count: (...args: unknown[]) => listingCountMock(...args),
      findUnique: (...args: unknown[]) => listingFindUniqueMock(...args),
      update: (...args: unknown[]) => listingUpdateMock(...args),
    },
    listingAttribute: {
      findMany: (...args: unknown[]) => listingAttributeFindManyMock(...args),
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
  weightTier: 'LIGHT',
  attributes: { size: '9', brand: 'Nike' },
  legalSourcingDeclared: true,
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

  it('rejects publishing without the legal sourcing declaration checked', async () => {
    const { legalSourcingDeclared: _omit, ...payloadWithoutDeclaration } = VALID_PAYLOAD;

    const app = createApp();
    const res = await request(app).post('/api/v1/listings').set(AUTH_HEADER).send(payloadWithoutDeclaration);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(listingCreateMock).not.toHaveBeenCalled();
  });

  it('rejects a legalSourcingDeclared value of false', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/listings')
      .set(AUTH_HEADER)
      .send({ ...VALID_PAYLOAD, legalSourcingDeclared: false });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(listingCreateMock).not.toHaveBeenCalled();
  });

  it('stores the declaration text and timestamp, and never persists the raw boolean flag', async () => {
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
      attributes: [],
      createdAt: new Date('2026-07-04T00:00:00Z'),
    });

    const app = createApp();
    await request(app).post('/api/v1/listings').set(AUTH_HEADER).send(VALID_PAYLOAD);

    expect(listingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          legalSourcingDeclarationText: 'I confirm that this item was lawfully acquired and that I have the legal right to sell it.',
          legalSourcingDeclaredAt: expect.any(Date),
        }),
      }),
    );
    const createCallData = listingCreateMock.mock.calls[0][0].data;
    expect(createCallData.legalSourcingDeclared).toBeUndefined();
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
    listingCountMock.mockReset();
    listingCountMock.mockResolvedValue(0);
  });

  it('returns the newest-first page, no auth required', async () => {
    listingFindManyMock.mockResolvedValue([fakeListing()]);
    listingCountMock.mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get('/api/v1/listings');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.total).toBe(1);
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
    listingCountMock.mockResolvedValue(21);

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

  it('filters by categoryIds, cities, and price range', async () => {
    listingFindManyMock.mockResolvedValue([]);

    const app = createApp();
    await request(app).get(
      '/api/v1/listings?categoryIds=cat-1,cat-2&cities=Harare,Gweru&minPrice=10&maxPrice=100',
    );

    expect(listingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          categoryId: { in: ['cat-1', 'cat-2'] },
          city: { in: ['Harare', 'Gweru'] },
          price: { gte: 10, lte: 100 },
        },
      }),
    );
  });

  it('filters by condition and size', async () => {
    listingFindManyMock.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/listings?conditions=NEW,GOOD&sizes=M,L');

    expect(listingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          condition: { in: ['NEW', 'GOOD'] },
          attributes: { some: { key: 'size', value: { in: ['M', 'L'] } } },
        },
      }),
    );
  });

  it('rejects an invalid condition value', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/listings?conditions=NOT_A_CONDITION');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(listingFindManyMock).not.toHaveBeenCalled();
  });

  it('searches title, brand, and description with an OR clause', async () => {
    listingFindManyMock.mockResolvedValue([]);
    listingCountMock.mockResolvedValue(0);

    const app = createApp();
    await request(app).get('/api/v1/listings?q=nike');

    expect(listingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { title: { contains: 'nike', mode: 'insensitive' } },
            { description: { contains: 'nike', mode: 'insensitive' } },
            { attributes: { some: { key: 'brand', value: { contains: 'nike', mode: 'insensitive' } } } },
          ],
        }),
        include: { attributes: true },
      }),
    );
  });

  it('ranks a title match above a brand match above a description-only match, newest first within a tier', async () => {
    const titleMatch = fakeListing({
      id: 'title-match',
      title: 'Nike Air Max',
      description: null,
      attributes: [],
      createdAt: new Date('2026-07-01T00:00:00Z'),
    });
    const brandMatch = fakeListing({
      id: 'brand-match',
      title: 'Running shoes',
      description: null,
      attributes: [{ key: 'brand', value: 'Nike' }],
      createdAt: new Date('2026-07-03T00:00:00Z'),
    });
    const descriptionMatchOld = fakeListing({
      id: 'description-match-old',
      title: 'Sneakers',
      description: 'Barely worn, Nike-approved comfort',
      attributes: [],
      createdAt: new Date('2026-07-01T00:00:00Z'),
    });
    const descriptionMatchNew = fakeListing({
      id: 'description-match-new',
      title: 'Sneakers',
      description: 'Barely worn, Nike-approved comfort',
      attributes: [],
      createdAt: new Date('2026-07-02T00:00:00Z'),
    });
    listingFindManyMock.mockResolvedValue([descriptionMatchOld, titleMatch, descriptionMatchNew, brandMatch]);
    listingCountMock.mockResolvedValue(4);

    const app = createApp();
    const res = await request(app).get('/api/v1/listings?q=nike');

    expect(res.status).toBe(200);
    expect(res.body.data.map((l: { id: string }) => l.id)).toEqual([
      'title-match',
      'brand-match',
      'description-match-new',
      'description-match-old',
    ]);
    expect(res.body.total).toBe(4);
  });

  it('returns a helpful empty result (not an error) for a garbage query', async () => {
    listingFindManyMock.mockResolvedValue([]);
    listingCountMock.mockResolvedValue(0);

    const app = createApp();
    const res = await request(app).get('/api/v1/listings?q=asdkfjhaslkdfjhqwoeiruqwoeiur');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.hasMore).toBe(false);
  });

  it('combines search with other filters', async () => {
    listingFindManyMock.mockResolvedValue([]);
    listingCountMock.mockResolvedValue(0);

    const app = createApp();
    await request(app).get('/api/v1/listings?q=nike&cities=Harare&conditions=NEW');

    expect(listingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          city: { in: ['Harare'] },
          condition: { in: ['NEW'] },
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('defaults to newest-first when no sort is given', async () => {
    listingFindManyMock.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/listings');

    expect(listingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' } }));
  });

  it('sorts by price ascending', async () => {
    listingFindManyMock.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/listings?sort=price_asc');

    expect(listingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { price: 'asc' } }));
  });

  it('sorts by price descending', async () => {
    listingFindManyMock.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/listings?sort=price_desc');

    expect(listingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { price: 'desc' } }));
  });

  it('rejects an invalid sort value', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/listings?sort=cheapest');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(listingFindManyMock).not.toHaveBeenCalled();
  });

  it('keeps active filters (price range) while sorting', async () => {
    listingFindManyMock.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/listings?sort=price_desc&minPrice=10&maxPrice=100&cities=Harare');

    expect(listingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ price: { gte: 10, lte: 100 }, city: { in: ['Harare'] } }),
        orderBy: { price: 'desc' },
      }),
    );
  });

  it('lets an explicit price sort override search relevance ranking', async () => {
    const cheap = fakeListing({ id: 'cheap', title: 'Nike shoes', price: { toString: () => '10' } });
    const expensive = fakeListing({ id: 'expensive', title: 'Nike jacket', price: { toString: () => '90' } });
    listingFindManyMock.mockResolvedValue([expensive, cheap]);
    listingCountMock.mockResolvedValue(2);

    const app = createApp();
    const res = await request(app).get('/api/v1/listings?q=nike&sort=price_asc');

    expect(res.status).toBe(200);
    // With an explicit sort, this should go through the plain DB-ordered
    // path (orderBy price asc), not the in-app relevance ranking path.
    expect(listingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { price: 'asc' } }));
    expect(listingFindManyMock).not.toHaveBeenCalledWith(expect.objectContaining({ include: { attributes: true } }));
  });
});

describe('GET /api/v1/listings/filter-options', () => {
  beforeEach(() => {
    listingFindManyMock.mockReset();
    listingAttributeFindManyMock.mockReset();
  });

  it('returns distinct cities and sizes from active listings', async () => {
    listingFindManyMock.mockResolvedValue([{ city: 'Harare' }, { city: 'Gweru' }]);
    listingAttributeFindManyMock.mockResolvedValue([{ value: 'M' }, { value: 'L' }]);

    const app = createApp();
    const res = await request(app).get('/api/v1/listings/filter-options');

    expect(res.status).toBe(200);
    expect(res.body.data.cities).toEqual(['Gweru', 'Harare']);
    expect(res.body.data.sizes).toEqual(['L', 'M']);
    expect(listingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE', deletedAt: null }, distinct: ['city'] }),
    );
    expect(listingAttributeFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'size', listing: { status: 'ACTIVE', deletedAt: null } },
        distinct: ['value'],
      }),
    );
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
      seller: { id: 'user-1', displayName: 'Tendai', avatarUrl: null, city: 'Harare', sellerProfile: null },
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/listings/listing-1');

    expect(res.status).toBe(200);
    expect(res.body.data.seller.displayName).toBe('Tendai');
    expect(res.body.data.seller.isVerified).toBe(false);
    expect(res.body.data.attributes).toEqual({ size: '9' });
    expect(res.body.data.category.name).toBe('Fashion & Clothing');
  });

  it('surfaces a verified seller badge from their SellerProfile', async () => {
    listingFindUniqueMock.mockResolvedValue({
      ...fakeListing(),
      description: 'Barely worn',
      condition: 'GOOD',
      deliveryOptions: ['Buyer collects'],
      status: 'ACTIVE',
      category: { id: 'cat-1', name: 'Fashion & Clothing', slug: 'fashion' },
      attributes: [],
      seller: { id: 'user-1', displayName: 'Tendai', avatarUrl: null, city: 'Harare', sellerProfile: { isVerified: true } },
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/listings/listing-1');

    expect(res.status).toBe(200);
    expect(res.body.data.seller.isVerified).toBe(true);
    expect(res.body.data.seller.sellerProfile).toBeUndefined();
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
