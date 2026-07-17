import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const getUserByIdMock = vi.fn();
const roleFindManyMock = vi.fn();
const roleFindUniqueMock = vi.fn();
const roleCreateMock = vi.fn();
const roleUpdateMock = vi.fn();
const roleDeleteMock = vi.fn();
const roleCountMock = vi.fn();
const userUpsertMock = vi.fn();
const queryRawMock = vi.fn();
const auditLogCreateMock = vi.fn();
const hasLiveDriverMock = vi.fn();

vi.mock('../lib/collectUkRoleExclusion', () => ({
  hasLiveDriverRecord: (...args: unknown[]) => hasLiveDriverMock(...args),
  DRIVER_BLOCKS_COMPANY: 'This account is a driver and cannot join a company.',
}));

vi.mock('../supabase', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
      admin: { getUserById: (...args: unknown[]) => getUserByIdMock(...args) },
    },
  },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: (...args: unknown[]) => userUpsertMock(...args) },
    collectUkCompanyRole: {
      findMany: (...args: unknown[]) => roleFindManyMock(...args),
      findUnique: (...args: unknown[]) => roleFindUniqueMock(...args),
      create: (...args: unknown[]) => roleCreateMock(...args),
      update: (...args: unknown[]) => roleUpdateMock(...args),
      delete: (...args: unknown[]) => roleDeleteMock(...args),
      count: (...args: unknown[]) => roleCountMock(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
  },
}));

const { createApp } = await import('../app');
const { Prisma } = await import('@prisma/client');

const AUTH = { Authorization: 'Bearer valid-token' };
const USER_ID = 'user-1';
const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';
const ROLE_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER = 'member-2';

// requireCompanyRole loads the caller's roles by userId; the team list loads a
// company's roles by companyId. Dispatch on the `where` so one mock serves both.
function callerIsAdmin() {
  roleFindManyMock.mockImplementation((args: { where?: { userId?: string; companyId?: string } }) => {
    if (args?.where?.userId) return Promise.resolve([{ role: 'COMPANY_ADMIN', companyId: COMPANY_A }]);
    return Promise.resolve([{ id: ROLE_ID, userId: USER_ID, role: 'COMPANY_ADMIN', createdAt: new Date() }]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  getUserByIdMock.mockResolvedValue({ data: { user: { email: 'member@example.com' } } });
  auditLogCreateMock.mockResolvedValue({});
  userUpsertMock.mockResolvedValue({});
  hasLiveDriverMock.mockResolvedValue(false);
  callerIsAdmin();
});

describe('GET /api/v1/collect-uk/companies/:id/team', () => {
  it('lists members with their emails', async () => {
    const res = await request(createApp()).get(`/api/v1/collect-uk/companies/${COMPANY_A}/team`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual(expect.objectContaining({ role: 'COMPANY_ADMIN', email: 'member@example.com' }));
  });

  it('403s a dispatcher (not an admin)', async () => {
    roleFindManyMock.mockImplementation((args: { where?: { userId?: string } }) =>
      args?.where?.userId ? Promise.resolve([{ role: 'DISPATCHER', companyId: COMPANY_A }]) : Promise.resolve([]),
    );
    const res = await request(createApp()).get(`/api/v1/collect-uk/companies/${COMPANY_A}/team`).set(AUTH);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/collect-uk/companies/:id/team', () => {
  it('adds a teammate by email', async () => {
    queryRawMock.mockResolvedValue([{ id: MEMBER }]);
    roleCreateMock.mockResolvedValue({ id: ROLE_ID, userId: MEMBER, role: 'DISPATCHER', createdAt: new Date() });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/team`)
      .set(AUTH)
      .send({ email: 'new@example.com', role: 'DISPATCHER' });

    expect(res.status).toBe(201);
    expect(userUpsertMock).toHaveBeenCalled();
    expect(roleCreateMock).toHaveBeenCalledWith({ data: { userId: MEMBER, companyId: COMPANY_A, role: 'DISPATCHER' } });
  });

  it('404s NO_ACCOUNT when the email has no account', async () => {
    queryRawMock.mockResolvedValue([]);
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/team`)
      .set(AUTH)
      .send({ email: 'nobody@example.com', role: 'DISPATCHER' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_ACCOUNT');
    expect(roleCreateMock).not.toHaveBeenCalled();
  });

  it('409s when the account is a driver', async () => {
    queryRawMock.mockResolvedValue([{ id: MEMBER }]);
    hasLiveDriverMock.mockResolvedValue(true);
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/team`)
      .set(AUTH)
      .send({ email: 'driver@example.com', role: 'DISPATCHER' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROLE_CONFLICT');
  });

  it('409s ALREADY_MEMBER on a duplicate', async () => {
    queryRawMock.mockResolvedValue([{ id: MEMBER }]);
    roleCreateMock.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7' }));
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/team`)
      .set(AUTH)
      .send({ email: 'dupe@example.com', role: 'DISPATCHER' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MEMBER');
  });
});

describe('PATCH/DELETE team member', () => {
  it('changes a role', async () => {
    roleFindUniqueMock.mockResolvedValue({ id: ROLE_ID, companyId: COMPANY_A, userId: MEMBER, role: 'DISPATCHER' });
    roleUpdateMock.mockResolvedValue({ id: ROLE_ID, userId: MEMBER, role: 'COMPANY_ADMIN', createdAt: new Date() });
    const res = await request(createApp())
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}/team/${ROLE_ID}`)
      .set(AUTH)
      .send({ role: 'COMPANY_ADMIN' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('COMPANY_ADMIN');
  });

  it('blocks demoting the last admin', async () => {
    roleFindUniqueMock.mockResolvedValue({ id: ROLE_ID, companyId: COMPANY_A, userId: MEMBER, role: 'COMPANY_ADMIN' });
    roleCountMock.mockResolvedValue(1);
    const res = await request(createApp())
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}/team/${ROLE_ID}`)
      .set(AUTH)
      .send({ role: 'DISPATCHER' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');
    expect(roleUpdateMock).not.toHaveBeenCalled();
  });

  it('removes a member', async () => {
    roleFindUniqueMock.mockResolvedValue({ id: ROLE_ID, companyId: COMPANY_A, userId: MEMBER, role: 'DISPATCHER' });
    roleDeleteMock.mockResolvedValue({});
    const res = await request(createApp())
      .delete(`/api/v1/collect-uk/companies/${COMPANY_A}/team/${ROLE_ID}`)
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(roleDeleteMock).toHaveBeenCalledWith({ where: { id: ROLE_ID } });
  });

  it('blocks removing the last admin', async () => {
    roleFindUniqueMock.mockResolvedValue({ id: ROLE_ID, companyId: COMPANY_A, userId: USER_ID, role: 'COMPANY_ADMIN' });
    roleCountMock.mockResolvedValue(1);
    const res = await request(createApp())
      .delete(`/api/v1/collect-uk/companies/${COMPANY_A}/team/${ROLE_ID}`)
      .set(AUTH);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');
    expect(roleDeleteMock).not.toHaveBeenCalled();
  });

  it("404s another company's role", async () => {
    roleFindUniqueMock.mockResolvedValue({ id: ROLE_ID, companyId: COMPANY_B, userId: MEMBER, role: 'DISPATCHER' });
    const res = await request(createApp())
      .delete(`/api/v1/collect-uk/companies/${COMPANY_A}/team/${ROLE_ID}`)
      .set(AUTH);
    expect(res.status).toBe(404);
  });
});
