import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const companyRoleFindManyMock = vi.fn();
const auditLogCreateMock = vi.fn();
const findManyMock = vi.fn();
const countMock = vi.fn();
const createManyMock = vi.fn();
const createMock = vi.fn();
const findUniqueMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    collectUkCompanyRole: { findMany: (...args: unknown[]) => companyRoleFindManyMock(...args) },
    collectUkFreightRate: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      count: (...args: unknown[]) => countMock(...args),
      createMany: (...args: unknown[]) => createManyMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      delete: (...args: unknown[]) => deleteMock(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const USER_ID = 'user-1';
const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';
const RATE_A = '99999999-9999-4999-8999-999999999999';

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  companyRoleFindManyMock.mockResolvedValue([{ role: 'COMPANY_ADMIN', companyId: COMPANY_A }]);
  auditLogCreateMock.mockResolvedValue({});
});

describe('GET /api/v1/collect-uk/companies/:id/freight-rates', () => {
  it('lists the company rate card', async () => {
    findManyMock.mockResolvedValue([
      { id: RATE_A, category: 'Household & Appliances', itemName: 'Drums', pricePence: 35000, sortOrder: 0, isActive: true },
    ]);
    const res = await request(createApp())
      .get(`/api/v1/collect-uk/companies/${COMPANY_A}/freight-rates`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({ itemName: 'Drums', pricePence: 35000, category: 'Household & Appliances' }),
    );
  });

  it('403s a company you are not assigned to', async () => {
    const res = await request(createApp())
      .get(`/api/v1/collect-uk/companies/${COMPANY_B}/freight-rates`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(403);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/collect-uk/companies/:id/freight-rates/seed', () => {
  it('seeds the standard UK->Zim catalogue when the company has none', async () => {
    countMock.mockResolvedValue(0);
    createManyMock.mockResolvedValue({ count: 30 });
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/freight-rates/seed`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(30);
    expect(createManyMock).toHaveBeenCalled();
    // Seeded rows carry real prices from the catalogue.
    const rows = createManyMock.mock.calls[0][0].data;
    expect(rows.find((r: { itemName: string }) => r.itemName === 'Drums').pricePence).toBe(35000);
    expect(rows).toHaveLength(30);
  });

  it('does not re-seed when rates already exist', async () => {
    countMock.mockResolvedValue(5);
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/freight-rates/seed`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.data.alreadyPopulated).toBe(true);
    expect(createManyMock).not.toHaveBeenCalled();
  });
});

describe('freight-rate mutations', () => {
  it('adds a rate', async () => {
    createMock.mockResolvedValue({ id: RATE_A, category: 'Bikes', itemName: 'Fat Bike', pricePence: 9000, sortOrder: 0, isActive: true });
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/freight-rates`)
      .set(AUTH_HEADER)
      .send({ category: 'Bikes', itemName: 'Fat Bike', pricePence: 9000 });
    expect(res.status).toBe(201);
    expect(res.body.data.itemName).toBe('Fat Bike');
  });

  it('updates a rate', async () => {
    findUniqueMock.mockResolvedValue({ id: RATE_A, companyId: COMPANY_A });
    updateMock.mockResolvedValue({ id: RATE_A, category: 'Bikes', itemName: 'Adult Bike', pricePence: 8500, sortOrder: 0, isActive: true });
    const res = await request(createApp())
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}/freight-rates/${RATE_A}`)
      .set(AUTH_HEADER)
      .send({ pricePence: 8500 });
    expect(res.status).toBe(200);
    expect(res.body.data.pricePence).toBe(8500);
  });

  it("404s updating another company's rate", async () => {
    findUniqueMock.mockResolvedValue({ id: RATE_A, companyId: COMPANY_B });
    const res = await request(createApp())
      .patch(`/api/v1/collect-uk/companies/${COMPANY_A}/freight-rates/${RATE_A}`)
      .set(AUTH_HEADER)
      .send({ pricePence: 8500 });
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('deletes a rate', async () => {
    findUniqueMock.mockResolvedValue({ id: RATE_A, companyId: COMPANY_A });
    deleteMock.mockResolvedValue({});
    const res = await request(createApp())
      .delete(`/api/v1/collect-uk/companies/${COMPANY_A}/freight-rates/${RATE_A}`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: RATE_A } });
  });

  it('forbids a DISPATCHER from changing prices', async () => {
    companyRoleFindManyMock.mockResolvedValue([{ role: 'DISPATCHER', companyId: COMPANY_A }]);
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/freight-rates`)
      .set(AUTH_HEADER)
      .send({ category: 'Bikes', itemName: 'Fat Bike', pricePence: 9000 });
    expect(res.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });
});
