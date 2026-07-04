import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const categoryFindUniqueMock = vi.fn();
const listingCreateMock = vi.fn();
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
    category: { findUnique: (...args: unknown[]) => categoryFindUniqueMock(...args) },
    listing: { create: (...args: unknown[]) => listingCreateMock(...args) },
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
