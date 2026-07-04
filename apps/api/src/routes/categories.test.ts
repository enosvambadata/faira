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
      { id: '1', name: 'Electronics', slug: 'electronics' },
      { id: '2', name: 'Fashion & Clothing', slug: 'fashion' },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/categories');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].slug).toBe('electronics');
  });
});
