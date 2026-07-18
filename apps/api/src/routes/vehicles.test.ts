import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const makeFindManyMock = vi.fn();
const makeFindUniqueMock = vi.fn();
const modelFindManyMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    vehicleMake: {
      findMany: (...args: unknown[]) => makeFindManyMock(...args),
      findUnique: (...args: unknown[]) => makeFindUniqueMock(...args),
    },
    vehicleModel: {
      findMany: (...args: unknown[]) => modelFindManyMock(...args),
    },
  },
}));

const { createApp } = await import('../app');

describe('GET /api/v1/vehicles/makes', () => {
  beforeEach(() => {
    makeFindManyMock.mockReset();
  });

  it('returns all makes alphabetically', async () => {
    makeFindManyMock.mockResolvedValue([
      { id: 'make-1', name: 'Honda' },
      { id: 'make-2', name: 'Toyota' },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/vehicles/makes');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(makeFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    );
  });
});

describe('GET /api/v1/vehicles/makes/:makeId/models', () => {
  beforeEach(() => {
    makeFindUniqueMock.mockReset();
    modelFindManyMock.mockReset();
  });

  it('returns the models for a make', async () => {
    makeFindUniqueMock.mockResolvedValue({ id: 'make-1', name: 'Toyota' });
    modelFindManyMock.mockResolvedValue([
      { id: 'model-1', name: 'Corolla' },
      { id: 'model-2', name: 'Vitz' },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/vehicles/makes/make-1/models');

    expect(res.status).toBe(200);
    expect(res.body.data.map((m: { name: string }) => m.name)).toEqual(['Corolla', 'Vitz']);
    expect(modelFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { makeId: 'make-1' } }),
    );
  });

  it('returns 404 for an unknown make', async () => {
    makeFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/vehicles/makes/nonexistent/models');

    expect(res.status).toBe(404);
    expect(modelFindManyMock).not.toHaveBeenCalled();
  });
});
