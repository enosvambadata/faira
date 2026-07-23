import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, RequestHandler } from 'express';
import request from 'supertest';

const userRoleFindManyMock = vi.fn();
const auditLogCreateMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    userRole: { findMany: (...args: unknown[]) => userRoleFindManyMock(...args) },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
  },
}));

const { requireFulfilmentRole } = await import('./requireFulfilmentRole');
const { requireHubAssignment } = await import('./requireHubAssignment');
const { requireMfa } = await import('./requireMfa');
const { errorHandler } = await import('../errors/errorHandler');

const USER_ID = 'user-1';
const HARARE_HUB_ID = 'hub-harare';
const BULAWAYO_HUB_ID = 'hub-bulawayo';

function fakeToken(aal: string | null): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(aal ? { aal } : {})).toString('base64url');
  const signature = Buffer.from('sig').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

// Minimal stand-in for requireAuth — sets req.userId directly rather than
// re-implementing Supabase token verification, since these tests target
// the RBAC middleware that runs after requireAuth, not requireAuth itself.
function fakeAuth(req: Request & { userId?: string }, _res: Response, next: () => void) {
  req.userId = USER_ID;
  next();
}

function buildApp(...middleware: RequestHandler[]) {
  const app = express();
  app.use(express.json());
  app.get('/protected', fakeAuth, ...middleware, (_req, res) => res.status(200).json({ ok: true }));
  app.get('/protected/:hubId', fakeAuth, ...middleware, (_req, res) => res.status(200).json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('requireFulfilmentRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows a user with a matching role', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_AGENT', hubId: HARARE_HUB_ID }]);
    const app = buildApp(requireFulfilmentRole('HUB_AGENT', 'HUB_SUPERVISOR'));

    const res = await request(app).get('/protected');

    expect(res.status).toBe(200);
  });

  it('rejects a user with no matching role and records an audit log', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'SELLER', hubId: null }]);
    const app = buildApp(requireFulfilmentRole('HUB_AGENT'));

    const res = await request(app).get('/protected');

    expect(res.status).toBe(403);
    expect(auditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: USER_ID, action: 'FULFILMENT_PERMISSION_DENIED' }) }),
    );
  });

  it('rejects a user with zero role assignments', async () => {
    userRoleFindManyMock.mockResolvedValue([]);
    const app = buildApp(requireFulfilmentRole('SUPER_ADMIN'));

    const res = await request(app).get('/protected');

    expect(res.status).toBe(403);
  });
});

describe('requireHubAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows a hub agent assigned to the requested hub', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_AGENT', hubId: HARARE_HUB_ID }]);
    const app = buildApp(requireFulfilmentRole('HUB_AGENT'), requireHubAssignment('hubId'));

    const res = await request(app).get(`/protected/${HARARE_HUB_ID}`);

    expect(res.status).toBe(200);
  });

  it('rejects a hub agent assigned to a different hub', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'HUB_AGENT', hubId: BULAWAYO_HUB_ID }]);
    const app = buildApp(requireFulfilmentRole('HUB_AGENT'), requireHubAssignment('hubId'));

    const res = await request(app).get(`/protected/${HARARE_HUB_ID}`);

    expect(res.status).toBe(403);
    expect(auditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'FULFILMENT_HUB_ASSIGNMENT_DENIED' }) }),
    );
  });
});

describe('requireMfa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows a request with an aal2 token', async () => {
    const app = buildApp(requireMfa());

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${fakeToken('aal2')}`);

    expect(res.status).toBe(200);
  });

  it('rejects a request with an aal1 (no MFA) token', async () => {
    const app = buildApp(requireMfa());

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${fakeToken('aal1')}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MFA_REQUIRED');
  });

  it('rejects a request with no token at all', async () => {
    const app = buildApp(requireMfa());

    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const app = buildApp(requireMfa());

    const res = await request(app).get('/protected').set('Authorization', 'Bearer not-a-jwt');

    expect(res.status).toBe(401);
  });
});
