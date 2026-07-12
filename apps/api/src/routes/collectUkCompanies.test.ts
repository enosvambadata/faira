import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const companyRoleFindManyMock = vi.fn();
const companyRoleCreateMock = vi.fn();
const companyFindUniqueMock = vi.fn();
const companyCreateMock = vi.fn();
const companyUpdateMock = vi.fn();
const warehouseFindManyMock = vi.fn();
const warehouseFindUniqueMock = vi.fn();
const warehouseCreateMock = vi.fn();
const warehouseUpdateMock = vi.fn();
const auditLogCreateMock = vi.fn();
const transactionMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    collectUkCompanyRole: {
      findMany: (...args: unknown[]) => companyRoleFindManyMock(...args),
      create: (...args: unknown[]) => companyRoleCreateMock(...args),
    },
    collectUkCompany: {
      findUnique: (...args: unknown[]) => companyFindUniqueMock(...args),
      create: (...args: unknown[]) => companyCreateMock(...args),
      update: (...args: unknown[]) => companyUpdateMock(...args),
    },
    collectUkCompanyWarehouse: {
      findMany: (...args: unknown[]) => warehouseFindManyMock(...args),
      findUnique: (...args: unknown[]) => warehouseFindUniqueMock(...args),
      create: (...args: unknown[]) => warehouseCreateMock(...args),
      update: (...args: unknown[]) => warehouseUpdateMock(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const USER_ID = 'user-1';
const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';

const COMPANY_A_ROW = {
  id: COMPANY_A,
  name: 'ABC Logistics',
  slug: 'abc-logistics',
  countriesServed: ['Zimbabwe'],
  isActive: true,
  createdAt: new Date('2026-07-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  companyRoleFindManyMock.mockResolvedValue([{ role: 'COMPANY_ADMIN', companyId: COMPANY_A }]);
  auditLogCreateMock.mockResolvedValue({});
  companyFindUniqueMock.mockResolvedValue(null);
  companyUpdateMock.mockResolvedValue({});
  warehouseFindManyMock.mockResolvedValue([]);
  warehouseCreateMock.mockResolvedValue({});
  warehouseUpdateMock.mockResolvedValue({});
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      collectUkCompany: { create: (...args: unknown[]) => companyCreateMock(...args) },
      collectUkCompanyRole: { create: (...args: unknown[]) => companyRoleCreateMock(...args) },
    }),
  );
});

describe('POST /api/v1/collect-uk/companies', () => {
  it('creates a company and auto-assigns the caller as COMPANY_ADMIN', async () => {
    companyFindUniqueMock.mockResolvedValue(null); // slug availability check
    companyCreateMock.mockResolvedValue(COMPANY_A_ROW);
    companyRoleCreateMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/collect-uk/companies')
      .set(AUTH_HEADER)
      .send({ name: 'ABC Logistics', countriesServed: ['Zimbabwe'] });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('ABC Logistics');
    expect(res.body.data.slug).toBe('abc-logistics');
    expect(companyCreateMock).toHaveBeenCalledWith({
      data: { name: 'ABC Logistics', slug: 'abc-logistics', countriesServed: ['Zimbabwe'] },
    });
    expect(companyRoleCreateMock).toHaveBeenCalledWith({
      data: { userId: USER_ID, companyId: COMPANY_A, role: 'COMPANY_ADMIN' },
    });
  });

  it('appends a numeric suffix when the slug is already taken', async () => {
    companyFindUniqueMock
      .mockResolvedValueOnce({ id: 'existing' }) // "abc-logistics" taken
      .mockResolvedValueOnce(null); // "abc-logistics-2" free
    companyCreateMock.mockResolvedValue({ ...COMPANY_A_ROW, slug: 'abc-logistics-2' });
    companyRoleCreateMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/collect-uk/companies')
      .set(AUTH_HEADER)
      .send({ name: 'ABC Logistics', countriesServed: ['Zimbabwe'] });

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('abc-logistics-2');
  });

  it('400s when countriesServed is empty', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/collect-uk/companies')
      .set(AUTH_HEADER)
      .send({ name: 'ABC Logistics', countriesServed: [] });

    expect(res.status).toBe(400);
    expect(companyCreateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/collect-uk/companies/mine', () => {
  it("lists the caller's companies with their role at each", async () => {
    companyRoleFindManyMock.mockResolvedValue([{ role: 'COMPANY_ADMIN', companyId: COMPANY_A, company: COMPANY_A_ROW }]);

    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/companies/mine').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ ...{
      id: COMPANY_A_ROW.id,
      name: COMPANY_A_ROW.name,
      slug: COMPANY_A_ROW.slug,
      countriesServed: COMPANY_A_ROW.countriesServed,
      isActive: COMPANY_A_ROW.isActive,
      createdAt: COMPANY_A_ROW.createdAt.toISOString(),
    }, role: 'COMPANY_ADMIN' }]);
  });
});

describe('GET /api/v1/collect-uk/companies/:id', () => {
  it('returns the company for an assigned COMPANY_ADMIN', async () => {
    companyFindUniqueMock.mockResolvedValue(COMPANY_A_ROW);

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_A}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(COMPANY_A);
  });

  it("403s (tenant isolation) when the caller isn't assigned to this company", async () => {
    companyFindUniqueMock.mockResolvedValue({ ...COMPANY_A_ROW, id: COMPANY_B });

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_B}`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });

  it('404s for a nonexistent company', async () => {
    companyFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/collect-uk/companies/nonexistent').set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  it('403s when the caller has no company role at all', async () => {
    companyRoleFindManyMock.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_A}`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(companyFindUniqueMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/collect-uk/companies/:id', () => {
  it('updates the profile for an assigned COMPANY_ADMIN', async () => {
    companyFindUniqueMock.mockResolvedValue(COMPANY_A_ROW);
    companyUpdateMock.mockResolvedValue({ ...COMPANY_A_ROW, name: 'ABC Logistics Ltd' });

    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}`)
      .set(AUTH_HEADER)
      .send({ name: 'ABC Logistics Ltd' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('ABC Logistics Ltd');
  });

  it('403s a DISPATCHER (not a COMPANY_ADMIN) attempting to update the profile', async () => {
    companyRoleFindManyMock.mockResolvedValue([{ role: 'DISPATCHER', companyId: COMPANY_A }]);

    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}`)
      .set(AUTH_HEADER)
      .send({ name: 'New Name' });

    expect(res.status).toBe(403);
    expect(companyUpdateMock).not.toHaveBeenCalled();
  });

  it("403s (tenant isolation) when the target company isn't the caller's", async () => {
    companyFindUniqueMock.mockResolvedValue({ ...COMPANY_A_ROW, id: COMPANY_B });

    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/collect-uk/companies/${COMPANY_B}`)
      .set(AUTH_HEADER)
      .send({ name: 'New Name' });

    expect(res.status).toBe(403);
    expect(companyUpdateMock).not.toHaveBeenCalled();
  });
});

describe('warehouse routes', () => {
  it('lists warehouses for an assigned company', async () => {
    warehouseFindManyMock.mockResolvedValue([
      { id: 'wh-1', companyId: COMPANY_A, name: 'Main Depot', address: '1 Road', city: 'London', postcode: 'E1 6AN', openingHours: '9-5', isActive: true },
    ]);

    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_A}/warehouses`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Main Depot');
  });

  it("403s (tenant isolation) listing another company's warehouses", async () => {
    const app = createApp();
    const res = await request(app).get(`/api/v1/collect-uk/companies/${COMPANY_B}/warehouses`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(warehouseFindManyMock).not.toHaveBeenCalled();
  });

  it('creates a warehouse for an assigned COMPANY_ADMIN', async () => {
    warehouseCreateMock.mockResolvedValue({
      id: 'wh-1', companyId: COMPANY_A, name: 'Main Depot', address: '1 Road', city: 'London', postcode: 'E1 6AN', openingHours: '9-5', isActive: true,
    });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/warehouses`)
      .set(AUTH_HEADER)
      .send({ name: 'Main Depot', address: '1 Road', city: 'London', postcode: 'E1 6AN', openingHours: '9-5' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Main Depot');
  });

  it('403s a DISPATCHER creating a warehouse', async () => {
    companyRoleFindManyMock.mockResolvedValue([{ role: 'DISPATCHER', companyId: COMPANY_A }]);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/warehouses`)
      .set(AUTH_HEADER)
      .send({ name: 'Main Depot', address: '1 Road', city: 'London', postcode: 'E1 6AN', openingHours: '9-5' });

    expect(res.status).toBe(403);
    expect(warehouseCreateMock).not.toHaveBeenCalled();
  });

  it('updates a warehouse belonging to the assigned company', async () => {
    warehouseFindUniqueMock.mockResolvedValue({ id: 'wh-1', companyId: COMPANY_A });
    warehouseUpdateMock.mockResolvedValue({
      id: 'wh-1', companyId: COMPANY_A, name: 'Renamed Depot', address: '1 Road', city: 'London', postcode: 'E1 6AN', openingHours: '9-5', isActive: true,
    });

    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}/warehouses/wh-1`)
      .set(AUTH_HEADER)
      .send({ name: 'Renamed Depot' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed Depot');
  });

  it("404s updating a warehouse that belongs to a different company than the URL's", async () => {
    warehouseFindUniqueMock.mockResolvedValue({ id: 'wh-1', companyId: COMPANY_B });

    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}/warehouses/wh-1`)
      .set(AUTH_HEADER)
      .send({ name: 'Renamed Depot' });

    expect(res.status).toBe(404);
    expect(warehouseUpdateMock).not.toHaveBeenCalled();
  });
});
