import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const getUserMock = vi.fn();
const userUpsertMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: { user: { upsert: (...args: unknown[]) => userUpsertMock(...args) } },
}));

const { requireAuth } = await import('./requireAuth');
const { errorHandler } = await import('../errors/errorHandler');

function buildApp() {
  const app = express();
  app.get('/protected', requireAuth, (req, res) => res.status(200).json({ userId: (req as { userId?: string }).userId }));
  app.use(errorHandler);
  return app;
}

const USER_ID = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe('requireAuth', () => {
  it('sets req.userId on a valid token', async () => {
    userUpsertMock.mockResolvedValue({});
    const app = buildApp();

    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(USER_ID);
  });

  it('401s when the Authorization header is missing', async () => {
    const app = buildApp();
    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
    expect(userUpsertMock).not.toHaveBeenCalled();
  });

  it('401s when the token is invalid or expired', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
    const app = buildApp();

    const res = await request(app).get('/protected').set('Authorization', 'Bearer bad-token');

    expect(res.status).toBe(401);
  });

  // Regression test: a brand-new user's first authenticated action is
  // often several concurrent requests racing this same upsert (e.g. a
  // page firing Promise.all on load). One request's INSERT always loses
  // to a unique-constraint violation — that must not surface as a 500.
  it('treats a P2002 unique-constraint race on the upsert as success, not a 500', async () => {
    const { Prisma } = await import('@prisma/client');
    userUpsertMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    const app = buildApp();

    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(USER_ID);
  });

  it('still surfaces a genuine (non-P2002) database error as a failure', async () => {
    userUpsertMock.mockRejectedValue(new Error('connection refused'));
    const app = buildApp();

    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
  });
});
