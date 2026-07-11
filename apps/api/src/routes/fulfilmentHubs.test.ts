import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const hubFindManyMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    hub: { findMany: (...args: unknown[]) => hubFindManyMock(...args) },
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('GET /api/v1/fulfilment/hubs', () => {
  it('lists active hubs ordered by city', async () => {
    hubFindManyMock.mockResolvedValue([
      { id: 'hub-1', name: 'Faira Harare Hub', city: 'Harare', address: 'Harare CBD', openingHours: 'Mon-Fri 8am-5pm' },
      { id: 'hub-2', name: 'Faira Bulawayo Hub', city: 'Bulawayo', address: 'Bulawayo CBD', openingHours: 'Mon-Fri 8am-5pm' },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/hubs').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(hubFindManyMock).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { city: 'asc' } });
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/hubs');

    expect(res.status).toBe(401);
    expect(hubFindManyMock).not.toHaveBeenCalled();
  });
});
