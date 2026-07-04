import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const categoryFindManyMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    category: { findMany: (...args: unknown[]) => categoryFindManyMock(...args) },
  },
}));

const { createApp } = await import('../app');

describe('GET /api/v1/categories', () => {
  beforeEach(() => {
    categoryFindManyMock.mockReset();
  });

  it('returns the category list, no auth required', async () => {
    categoryFindManyMock.mockResolvedValue([
      { id: '1', name: 'Electronics', slug: 'electronics', icon: '📱', parentId: null },
      { id: '2', name: 'Fashion & Clothing', slug: 'fashion', icon: '👗', parentId: null },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/categories');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].slug).toBe('electronics');
    expect(res.body.data[0].icon).toBe('📱');
  });

  it('defaults to top-level categories only', async () => {
    categoryFindManyMock.mockResolvedValue([]);

    const app = createApp();
    await request(app).get('/api/v1/categories');

    expect(categoryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parentId: null } }),
    );
  });

  it('fetches direct children when parentId is given', async () => {
    categoryFindManyMock.mockResolvedValue([
      { id: 'child-1', name: "Women's Clothing", slug: 'womens-clothing', icon: '👚', parentId: 'fashion-id' },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/categories?parentId=64d25c37-d8f0-4a11-b92e-ecb9b168f516');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(categoryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parentId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516' } }),
    );
  });

  it('rejects an invalid parentId', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/categories?parentId=not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(categoryFindManyMock).not.toHaveBeenCalled();
  });
});
