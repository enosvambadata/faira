import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const companyRoleFindManyMock = vi.fn();
const auditLogCreateMock = vi.fn();
const paymentCreateMock = vi.fn();
const paymentUpdateMock = vi.fn();
const paymentFindManyMock = vi.fn();
const paymentFindUniqueMock = vi.fn();
const shipmentFindUniqueMock = vi.fn();
const companyFindUniqueMock = vi.fn();
const stripeConfiguredMock = vi.fn();
const createCheckoutSessionMock = vi.fn();

vi.mock('../lib/collectUkStripe', () => ({
  stripeConfigured: (...args: unknown[]) => stripeConfiguredMock(...args),
  createCheckoutSession: (...args: unknown[]) => createCheckoutSessionMock(...args),
  constructWebhookEvent: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    collectUkCompanyRole: { findMany: (...args: unknown[]) => companyRoleFindManyMock(...args) },
    collectUkPayment: {
      create: (...args: unknown[]) => paymentCreateMock(...args),
      update: (...args: unknown[]) => paymentUpdateMock(...args),
      findMany: (...args: unknown[]) => paymentFindManyMock(...args),
      findUnique: (...args: unknown[]) => paymentFindUniqueMock(...args),
    },
    collectUkShipment: { findUnique: (...args: unknown[]) => shipmentFindUniqueMock(...args) },
    collectUkCompany: { findUnique: (...args: unknown[]) => companyFindUniqueMock(...args) },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const USER_ID = 'user-1';
const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';
const PAY_ID = 'pay-1';

const PENDING_ROW = {
  id: PAY_ID,
  companyId: COMPANY_A,
  shipmentId: null,
  customerName: 'Tendai',
  customerContact: null,
  description: '1x Drum, 1x Fridge',
  amountPence: 80000,
  currency: 'gbp',
  status: 'PENDING',
  stripeSessionId: null,
  checkoutUrl: null,
  paidAt: null,
  createdAt: new Date('2026-07-17T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  companyRoleFindManyMock.mockResolvedValue([{ role: 'COMPANY_ADMIN', companyId: COMPANY_A }]);
  auditLogCreateMock.mockResolvedValue({});
  companyFindUniqueMock.mockResolvedValue({ id: COMPANY_A, name: 'ABC Logistics', brandName: null });
  stripeConfiguredMock.mockReturnValue(true);
});

describe('POST /api/v1/collect-uk/companies/:id/payments', () => {
  it('creates a payment and returns a Stripe checkout link', async () => {
    paymentCreateMock.mockResolvedValue({ ...PENDING_ROW });
    createCheckoutSessionMock.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/pay/cs_test_1' });
    paymentUpdateMock.mockResolvedValue({ ...PENDING_ROW, stripeSessionId: 'cs_test_1', checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_1' });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/payments`)
      .set(AUTH_HEADER)
      .send({ customerName: 'Tendai', description: '1x Drum, 1x Fridge', amountPence: 80000 });

    expect(res.status).toBe(201);
    expect(res.body.data.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_test_1');
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountPence: 80000, currency: 'gbp', customerName: 'Tendai', brandName: 'ABC Logistics' }),
    );
  });

  it('returns 503 when Stripe is not configured', async () => {
    stripeConfiguredMock.mockReturnValue(false);
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/payments`)
      .set(AUTH_HEADER)
      .send({ customerName: 'Tendai', description: 'x', amountPence: 80000 });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('STRIPE_NOT_CONFIGURED');
    expect(paymentCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an amount below £1', async () => {
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/payments`)
      .set(AUTH_HEADER)
      .send({ customerName: 'Tendai', description: 'x', amountPence: 50 });
    expect(res.status).toBe(400);
  });

  it('marks the payment FAILED and returns 502 if Stripe errors', async () => {
    paymentCreateMock.mockResolvedValue({ ...PENDING_ROW });
    createCheckoutSessionMock.mockRejectedValue(new Error('stripe down'));
    paymentUpdateMock.mockResolvedValue({ ...PENDING_ROW, status: 'FAILED' });

    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_A}/payments`)
      .set(AUTH_HEADER)
      .send({ customerName: 'Tendai', description: 'x', amountPence: 80000 });

    expect(res.status).toBe(502);
    expect(paymentUpdateMock).toHaveBeenCalledWith({ where: { id: PAY_ID }, data: { status: 'FAILED' } });
  });

  it('403s a company you are not assigned to', async () => {
    const res = await request(createApp())
      .post(`/api/v1/collect-uk/companies/${COMPANY_B}/payments`)
      .set(AUTH_HEADER)
      .send({ customerName: 'Tendai', description: 'x', amountPence: 80000 });
    expect(res.status).toBe(403);
    expect(paymentCreateMock).not.toHaveBeenCalled();
  });
});

describe('GET payments', () => {
  it('lists payments', async () => {
    paymentFindManyMock.mockResolvedValue([{ ...PENDING_ROW, status: 'PAID', paidAt: new Date() }]);
    const res = await request(createApp())
      .get(`/api/v1/collect-uk/companies/${COMPANY_A}/payments`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('PAID');
  });

  it("404s another company's payment", async () => {
    paymentFindUniqueMock.mockResolvedValue({ ...PENDING_ROW, companyId: COMPANY_B });
    const res = await request(createApp())
      .get(`/api/v1/collect-uk/companies/${COMPANY_A}/payments/${PAY_ID}`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });
});
