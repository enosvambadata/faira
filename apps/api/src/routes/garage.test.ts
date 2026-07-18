import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const garageFindManyMock = vi.fn();
const garageCreateMock = vi.fn();
const garageDeleteManyMock = vi.fn();
const modelFindUniqueMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    vehicleModel: { findUnique: (...args: unknown[]) => modelFindUniqueMock(...args) },
    garageVehicle: {
      findMany: (...args: unknown[]) => garageFindManyMock(...args),
      create: (...args: unknown[]) => garageCreateMock(...args),
      deleteMany: (...args: unknown[]) => garageDeleteManyMock(...args),
    },
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };

function garaged(overrides: Record<string, unknown> = {}) {
  return {
    id: 'garage-1',
    year: 2005,
    model: { id: 'model-1', name: 'Vitz', make: { name: 'Toyota' } },
    ...overrides,
  };
}

beforeEach(() => {
  getUserMock.mockReset();
  garageFindManyMock.mockReset();
  garageCreateMock.mockReset();
  garageDeleteManyMock.mockReset();
  modelFindUniqueMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('GET /api/v1/garage', () => {
  it('returns the buyer saved vehicles flattened with make/model names', async () => {
    garageFindManyMock.mockResolvedValue([garaged()]);

    const app = createApp();
    const res = await request(app).get('/api/v1/garage').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({ id: 'garage-1', modelId: 'model-1', year: 2005, make: 'Toyota', model: 'Vitz' });
    expect(garageFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }));
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/garage');
    expect(res.status).toBe(401);
    expect(garageFindManyMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/garage', () => {
  it('adds a vehicle to the garage', async () => {
    modelFindUniqueMock.mockResolvedValue({ id: 'model-1', name: 'Vitz' });
    garageCreateMock.mockResolvedValue(garaged());

    const app = createApp();
    const res = await request(app).post('/api/v1/garage').set(AUTH_HEADER).send({ modelId: 'a3f1c2d4-1111-4222-8333-444455556666', year: 2005 });

    expect(res.status).toBe(201);
    expect(res.body.data.make).toBe('Toyota');
    expect(garageCreateMock).toHaveBeenCalled();
  });

  it('allows a vehicle without a year', async () => {
    modelFindUniqueMock.mockResolvedValue({ id: 'model-1', name: 'Vitz' });
    garageCreateMock.mockResolvedValue(garaged({ year: null }));

    const app = createApp();
    const res = await request(app).post('/api/v1/garage').set(AUTH_HEADER).send({ modelId: 'a3f1c2d4-1111-4222-8333-444455556666' });

    expect(res.status).toBe(201);
    expect(res.body.data.year).toBeNull();
  });

  it('returns 404 for an unknown model', async () => {
    modelFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/garage').set(AUTH_HEADER).send({ modelId: 'a3f1c2d4-1111-4222-8333-444455556666' });

    expect(res.status).toBe(404);
    expect(garageCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid body', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/garage').set(AUTH_HEADER).send({ modelId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(garageCreateMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/garage/:id', () => {
  it('removes a vehicle scoped to the caller', async () => {
    garageDeleteManyMock.mockResolvedValue({ count: 1 });

    const app = createApp();
    const res = await request(app).delete('/api/v1/garage/garage-1').set(AUTH_HEADER);

    expect(res.status).toBe(204);
    expect(garageDeleteManyMock).toHaveBeenCalledWith({ where: { id: 'garage-1', userId: 'user-1' } });
  });
});
