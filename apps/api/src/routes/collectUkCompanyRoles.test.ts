import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const userFindUniqueMock = vi.fn();
const companyFindUniqueMock = vi.fn();
const companyRoleCreateMock = vi.fn();
const companyRoleFindManyMock = vi.fn();
const companyRoleFindUniqueMock = vi.fn();
const companyRoleDeleteMock = vi.fn();
const auditLogCreateMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUniqueMock(...args) },
    collectUkCompany: { findUnique: (...args: unknown[]) => companyFindUniqueMock(...args) },
    collectUkCompanyRole: {
      create: (...args: unknown[]) => companyRoleCreateMock(...args),
      findMany: (...args: unknown[]) => companyRoleFindManyMock(...args),
      findUnique: (...args: unknown[]) => companyRoleFindUniqueMock(...args),
      delete: (...args: unknown[]) => companyRoleDeleteMock(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
  },
}));

const { createApp } = await import('../app');

const ADMIN_TOKEN = 'test-admin-secret';
const ADMIN_HEADER = { 'x-admin-token': ADMIN_TOKEN };
const USER_ID = '33333333-3333-4333-8333-333333333333';
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  userFindUniqueMock.mockResolvedValue({ id: USER_ID });
  companyFindUniqueMock.mockResolvedValue({ id: COMPANY_ID });
  auditLogCreateMock.mockResolvedValue({});
});

describe('POST /api/v1/admin/collect-uk/company-roles', () => {
  it('assigns a role given valid userId/companyId/role', async () => {
    companyRoleCreateMock.mockResolvedValue({ id: 'role-1', userId: USER_ID, companyId: COMPANY_ID, role: 'DISPATCHER' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/collect-uk/company-roles')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, companyId: COMPANY_ID, role: 'DISPATCHER' });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('DISPATCHER');
  });

  it('404s for a nonexistent user', async () => {
    userFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/collect-uk/company-roles')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, companyId: COMPANY_ID, role: 'DISPATCHER' });

    expect(res.status).toBe(404);
  });

  it('404s for a nonexistent company', async () => {
    companyFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/collect-uk/company-roles')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, companyId: COMPANY_ID, role: 'DISPATCHER' });

    expect(res.status).toBe(404);
  });

  it('fails closed without a valid admin token', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/collect-uk/company-roles')
      .send({ userId: USER_ID, companyId: COMPANY_ID, role: 'DISPATCHER' });

    expect(res.status).toBe(401);
    expect(companyRoleCreateMock).not.toHaveBeenCalled();
  });

  it('400s on an invalid role', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/collect-uk/company-roles')
      .set(ADMIN_HEADER)
      .send({ userId: USER_ID, companyId: COMPANY_ID, role: 'DRIVER' });

    expect(res.status).toBe(400);
    expect(companyRoleCreateMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/admin/collect-uk/company-roles/:id', () => {
  it('revokes an existing role assignment', async () => {
    companyRoleFindUniqueMock.mockResolvedValue({ id: 'role-1', userId: USER_ID, companyId: COMPANY_ID, role: 'DISPATCHER' });

    const app = createApp();
    const res = await request(app).delete('/api/v1/admin/collect-uk/company-roles/role-1').set(ADMIN_HEADER);

    expect(res.status).toBe(204);
    expect(companyRoleDeleteMock).toHaveBeenCalledWith({ where: { id: 'role-1' } });
  });

  it('404s for a nonexistent role assignment', async () => {
    companyRoleFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).delete('/api/v1/admin/collect-uk/company-roles/nonexistent').set(ADMIN_HEADER);

    expect(res.status).toBe(404);
  });
});
