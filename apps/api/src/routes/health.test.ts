import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const queryRawMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRawMock(...args) },
}));

const { createApp } = await import('../app');

describe('health', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /health is a bare liveness 200 that never touches the DB', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    // Liveness must not depend on the DB, or a transient blip would fail the
    // deploy healthcheck and cause a restart loop.
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('GET /health/ready returns 200 when the database responds', async () => {
    queryRawMock.mockResolvedValue([{ result: 1 }]);

    const app = createApp();
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(queryRawMock).toHaveBeenCalled();
  });

  it('GET /health/ready returns 503 when the database is unreachable', async () => {
    queryRawMock.mockRejectedValue(new Error('connection refused'));

    const app = createApp();
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
  });
});
