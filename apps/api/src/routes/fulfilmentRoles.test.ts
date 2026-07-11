import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const userFindUniqueMock = vi.fn();
const hubFindUniqueMock = vi.fn();
const userRoleCreateMock = vi.fn();
const userRoleFindManyMock = vi.fn();
const userRoleFindUniqueMock = vi.fn();
const userRoleDeleteMock = vi.fn();
const auditLogCreateMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
    hub: { findUnique: (...args: unknown[]) => hubFindUniqueMock(...args) },
    userRole: {
      create: (...args: unknown[]) => userRoleCreateMock(...args),
      findMany: (...args: unknown[]) => userRoleFindManyMock(...args),
      findUnique: (...args: unknown[]) => userRoleFindUniqueMock(...args),
      delete: (...args: unknown[]) => userRoleDeleteMock(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
  },
}));

const { createApp } = await import('../app');

const ADMIN_TOKEN = 'test-admin-secret';
const ADMIN_HEADER = { 'x-admin-token': ADMIN_TOKEN };
const USER_ID = '11111111-1111-4111-8111-111111111111';
const HUB_ID = '22222222-2222-4222-8222-222222222222';

describe('POST /api/v1/fulfilment/user-roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    getUserMock.mockResolvedValue({ data: { user: { id: 'admin-caller' } }, error: null });
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('assigns a non-hub-scoped role', async () => {
    userFindUniqueMock.mockResolvedValue({ id: USER_ID });
    userRoleCreateMock.mockResolvedValue({ id: 'role-1', userId: USER_ID, role: 'CUSTOMER_SUPPORT', hubId: null });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/user-roles')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, role: 'CUSTOMER_SUPPORT' });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('CUSTOMER_SUPPORT');
    expect(userRoleCreateMock).toHaveBeenCalledWith({ data: { userId: USER_ID, role: 'CUSTOMER_SUPPORT', hubId: null } });
  });

  it('assigns a hub-scoped role when the hub exists', async () => {
    userFindUniqueMock.mockResolvedValue({ id: USER_ID });
    hubFindUniqueMock.mockResolvedValue({ id: HUB_ID });
    userRoleCreateMock.mockResolvedValue({ id: 'role-2', userId: USER_ID, role: 'HUB_AGENT', hubId: HUB_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/user-roles')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, role: 'HUB_AGENT', hubId: HUB_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.hubId).toBe(HUB_ID);
  });

  it('400s when a hub-scoped role is missing a hubId', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/user-roles')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, role: 'HUB_AGENT' });

    expect(res.status).toBe(400);
    expect(userRoleCreateMock).not.toHaveBeenCalled();
  });

  it('400s when a non-hub-scoped role is given a hubId', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/user-roles')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, role: 'SUPER_ADMIN', hubId: HUB_ID });

    expect(res.status).toBe(400);
    expect(userRoleCreateMock).not.toHaveBeenCalled();
  });

  it('404s when the hub does not exist', async () => {
    userFindUniqueMock.mockResolvedValue({ id: USER_ID });
    hubFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/user-roles')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, role: 'HUB_AGENT', hubId: HUB_ID });

    expect(res.status).toBe(404);
    expect(userRoleCreateMock).not.toHaveBeenCalled();
  });

  it('404s when the target user does not exist', async () => {
    userFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/user-roles')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, role: 'CUSTOMER_SUPPORT' });

    expect(res.status).toBe(404);
    expect(userRoleCreateMock).not.toHaveBeenCalled();
  });

  it('409s when the same role assignment already exists', async () => {
    const { Prisma } = await import('@prisma/client');
    userFindUniqueMock.mockResolvedValue({ id: USER_ID });
    userRoleCreateMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/user-roles')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, role: 'CUSTOMER_SUPPORT' });

    expect(res.status).toBe(409);
  });

  it('rejects a request without the admin token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/user-roles').send({ userId: USER_ID, role: 'CUSTOMER_SUPPORT' });

    expect(res.status).toBe(401);
    expect(userRoleCreateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/fulfilment/user-roles/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('lists role assignments for a user', async () => {
    userRoleFindManyMock.mockResolvedValue([
      { id: 'role-1', role: 'HUB_AGENT', hubId: HUB_ID, createdAt: new Date('2026-07-11T00:00:00Z') },
    ]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/fulfilment/user-roles/${USER_ID}`).set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'role-1', role: 'HUB_AGENT', hubId: HUB_ID, createdAt: '2026-07-11T00:00:00.000Z' }]);
  });
});

describe('DELETE /api/v1/fulfilment/user-roles/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('revokes a role assignment', async () => {
    userRoleFindUniqueMock.mockResolvedValue({ id: 'role-1', userId: USER_ID, role: 'HUB_AGENT', hubId: HUB_ID });

    const app = createApp();
    const res = await request(app).delete('/api/v1/fulfilment/user-roles/role-1').set(ADMIN_HEADER);

    expect(res.status).toBe(204);
    expect(userRoleDeleteMock).toHaveBeenCalledWith({ where: { id: 'role-1' } });
    expect(auditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: USER_ID, action: 'FULFILMENT_ROLE_REVOKED' }) }),
    );
  });

  it('404s for a nonexistent role assignment', async () => {
    userRoleFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).delete('/api/v1/fulfilment/user-roles/nonexistent').set(ADMIN_HEADER);

    expect(res.status).toBe(404);
    expect(userRoleDeleteMock).not.toHaveBeenCalled();
  });
});
