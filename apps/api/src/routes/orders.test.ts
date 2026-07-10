import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const listingFindUniqueMock = vi.fn();
const orderCreateMock = vi.fn();
const orderFindUniqueMock = vi.fn();
const orderFindManyMock = vi.fn();
const orderUpdateManyMock = vi.fn();
const paymentCreateMock = vi.fn();
const paymentUpdateMock = vi.fn();
const paymentFindFirstMock = vi.fn();
const escrowCreateMock = vi.fn();
const transactionMock = vi.fn();
const sellerProfileFindUniqueMock = vi.fn();
const paymentDisputeCreateMock = vi.fn();

const initiateWebPaymentMock = vi.fn();
const initiateMobilePaymentMock = vi.fn();
const pollPaymentStatusMock = vi.fn();
const calculateDeliveryFeeMock = vi.fn();
const userFindUniqueMock = vi.fn();

vi.mock('../lib/paynow', () => ({
  initiateWebPayment: (...args: unknown[]) => initiateWebPaymentMock(...args),
  initiateMobilePayment: (...args: unknown[]) => initiateMobilePaymentMock(...args),
  pollPaymentStatus: (...args: unknown[]) => pollPaymentStatusMock(...args),
  isPaidStatus: (status: string) => status.toLowerCase() === 'paid',
}));

vi.mock('../services/deliveryFee', () => ({
  calculateDeliveryFee: (...args: unknown[]) => calculateDeliveryFeeMock(...args),
  FREE_DELIVERY_OPTION: 'Buyer collects',
}));

vi.mock('../supabase', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
    },
  },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
    listing: { findUnique: (...args: unknown[]) => listingFindUniqueMock(...args) },
    order: {
      create: (...args: unknown[]) => orderCreateMock(...args),
      findUnique: (...args: unknown[]) => orderFindUniqueMock(...args),
      findMany: (...args: unknown[]) => orderFindManyMock(...args),
      updateMany: (...args: unknown[]) => orderUpdateManyMock(...args),
    },
    payment: {
      create: (...args: unknown[]) => paymentCreateMock(...args),
      update: (...args: unknown[]) => paymentUpdateMock(...args),
      findFirst: (...args: unknown[]) => paymentFindFirstMock(...args),
    },
    escrowLedgerEntry: {
      create: (...args: unknown[]) => escrowCreateMock(...args),
    },
    sellerProfile: {
      findUnique: (...args: unknown[]) => sellerProfileFindUniqueMock(...args),
    },
    paymentDispute: {
      create: (...args: unknown[]) => paymentDisputeCreateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';
const LISTING_ID = '64d25c37-d8f0-4a11-b92e-ecb9b168f516';
const ORDER_ID = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';

function fakeListing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: LISTING_ID,
    title: 'Nike Air Max',
    price: { toString: () => '45.50' },
    sellerId: SELLER_ID,
    status: 'ACTIVE',
    deletedAt: null,
    deliveryOptions: ['Courier', 'Pickup'],
    ...overrides,
  };
}

function fakeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ORDER_ID,
    listingId: LISTING_ID,
    buyerId: BUYER_ID,
    priceAtPurchase: { toString: () => '45.50' },
    status: 'PENDING',
    listing: fakeListing(),
    payments: [],
    disputes: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } }, error: null });
});

describe('POST /api/v1/orders', () => {
  it('creates a PENDING order for an active listing owned by someone else', async () => {
    listingFindUniqueMock.mockResolvedValue(fakeListing());
    orderCreateMock.mockResolvedValue(fakeOrder());

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/orders')
      .set(AUTH_HEADER)
      .send({ listingId: LISTING_ID, deliveryOption: 'Courier' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(orderCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ listingId: LISTING_ID, buyerId: BUYER_ID, deliveryOption: 'Courier' }),
      }),
    );
  });

  it("400s when deliveryOption isn't offered on the listing", async () => {
    listingFindUniqueMock.mockResolvedValue(fakeListing());

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/orders')
      .set(AUTH_HEADER)
      .send({ listingId: LISTING_ID, deliveryOption: 'Teleport' });

    expect(res.status).toBe(400);
    expect(orderCreateMock).not.toHaveBeenCalled();
  });

  it('400s when deliveryOption is missing', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/orders').set(AUTH_HEADER).send({ listingId: LISTING_ID });

    expect(res.status).toBe(400);
  });

  it('404s when the listing does not exist', async () => {
    listingFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/orders')
      .set(AUTH_HEADER)
      .send({ listingId: LISTING_ID, deliveryOption: 'Courier' });

    expect(res.status).toBe(404);
  });

  it('409s when the listing is not ACTIVE', async () => {
    listingFindUniqueMock.mockResolvedValue(fakeListing({ status: 'SOLD' }));

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/orders')
      .set(AUTH_HEADER)
      .send({ listingId: LISTING_ID, deliveryOption: 'Courier' });

    expect(res.status).toBe(409);
  });

  it('403s when the buyer is the listing seller', async () => {
    listingFindUniqueMock.mockResolvedValue(fakeListing({ sellerId: BUYER_ID }));

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/orders')
      .set(AUTH_HEADER)
      .send({ listingId: LISTING_ID, deliveryOption: 'Courier' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/orders/purchases', () => {
  it("lists the caller's orders as buyer, newest first", async () => {
    orderFindManyMock.mockResolvedValue([
      {
        id: ORDER_ID,
        priceAtPurchase: { toString: () => '45.50' },
        status: 'PAID',
        createdAt: new Date('2026-07-10T00:00:00Z'),
        listing: { id: LISTING_ID, title: 'Nike Air Max', imageUrls: ['https://res.cloudinary.com/x/listings/a.jpg'] },
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/orders/purchases').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: ORDER_ID,
        priceAtPurchase: '45.50',
        status: 'PAID',
        displayStatus: 'Paid',
        createdAt: '2026-07-10T00:00:00.000Z',
        listing: { id: LISTING_ID, title: 'Nike Air Max', imageUrl: 'https://res.cloudinary.com/x/listings/a.jpg' },
      },
    ]);
    expect(orderFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { buyerId: BUYER_ID }, orderBy: { createdAt: 'desc' } }),
    );
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/orders/purchases');

    expect(res.status).toBe(401);
    expect(orderFindManyMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/orders/sales', () => {
  it("lists the caller's orders as seller", async () => {
    orderFindManyMock.mockResolvedValue([
      {
        id: ORDER_ID,
        priceAtPurchase: { toString: () => '45.50' },
        status: 'SHIPPED',
        createdAt: new Date('2026-07-10T00:00:00Z'),
        listing: { id: LISTING_ID, title: 'Nike Air Max', imageUrls: [] },
      },
    ]);
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });

    const app = createApp();
    const res = await request(app).get('/api/v1/orders/sales').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data[0].listing.imageUrl).toBeNull();
    expect(orderFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { listing: { sellerId: SELLER_ID } } }),
    );
  });
});

describe('GET /api/v1/orders/delivery-fee', () => {
  it("quotes a fee using the buyer's profile city and the listing's weight tier", async () => {
    listingFindUniqueMock.mockResolvedValue({ weightTier: 'MEDIUM' });
    userFindUniqueMock.mockResolvedValue({ city: 'Mutare' });
    calculateDeliveryFeeMock.mockResolvedValue(4.5);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/orders/delivery-fee')
      .query({ listingId: LISTING_ID, deliveryOption: 'Courier' })
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ fee: 4.5 });
    expect(calculateDeliveryFeeMock).toHaveBeenCalledWith('Mutare', 'MEDIUM', 'Courier');
  });

  it('404s when the listing does not exist', async () => {
    listingFindUniqueMock.mockResolvedValue(null);
    userFindUniqueMock.mockResolvedValue({ city: 'Harare' });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/orders/delivery-fee')
      .query({ listingId: LISTING_ID, deliveryOption: 'Courier' })
      .set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  it("400s when the buyer hasn't set a profile city", async () => {
    listingFindUniqueMock.mockResolvedValue({ weightTier: 'LIGHT' });
    userFindUniqueMock.mockResolvedValue({ city: null });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/orders/delivery-fee')
      .query({ listingId: LISTING_ID, deliveryOption: 'Courier' })
      .set(AUTH_HEADER);

    expect(res.status).toBe(400);
    expect(calculateDeliveryFeeMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/orders/:orderId', () => {
  function fakeOrderDetail(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: ORDER_ID,
      buyerId: BUYER_ID,
      priceAtPurchase: { toString: () => '45.50' },
      status: 'PAID',
      createdAt: new Date('2026-07-10T00:00:00Z'),
      updatedAt: new Date('2026-07-10T00:00:00Z'),
      listing: { id: LISTING_ID, title: 'Nike Air Max', imageUrls: ['https://res.cloudinary.com/x/listings/a.jpg'], sellerId: SELLER_ID },
      escrowEntries: [],
      payments: [],
      disputes: [],
      shippingMethod: null,
      trackingReference: null,
      shippedAt: null,
      ...overrides,
    };
  }

  it('shows the buyer the shipping method and tracking reference once shipped', async () => {
    orderFindUniqueMock.mockResolvedValue(
      fakeOrderDetail({ status: 'SHIPPED', shippingMethod: 'COURIER', trackingReference: 'CR-12345', shippedAt: new Date('2026-07-11T00:00:00Z') }),
    );

    const app = createApp();
    const res = await request(app).get(`/api/v1/orders/${ORDER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.shippingMethod).toBe('COURIER');
    expect(res.body.data.trackingReference).toBe('CR-12345');
  });

  it('builds a chronological timeline from pending through completed', async () => {
    orderFindUniqueMock.mockResolvedValue(
      fakeOrderDetail({
        status: 'COMPLETED',
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-07-05T00:00:00Z'),
        shippedAt: new Date('2026-07-03T00:00:00Z'),
        payments: [{ confirmedAt: new Date('2026-07-02T00:00:00Z') }],
        escrowEntries: [{ type: 'HOLD', createdAt: new Date('2026-07-02T00:00:00Z') }, { type: 'RELEASE', createdAt: new Date('2026-07-04T00:00:00Z') }],
      }),
    );

    const app = createApp();
    const res = await request(app).get(`/api/v1/orders/${ORDER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.timeline).toEqual([
      { status: 'PENDING', label: 'Pending Payment', at: '2026-07-01T00:00:00.000Z' },
      { status: 'PAID', label: 'Paid', at: '2026-07-02T00:00:00.000Z' },
      { status: 'SHIPPED', label: 'Shipped', at: '2026-07-03T00:00:00.000Z' },
      { status: 'COMPLETED', label: 'Completed', at: '2026-07-04T00:00:00.000Z' },
    ]);
  });

  it('includes a DISPUTED entry when a dispute was raised', async () => {
    orderFindUniqueMock.mockResolvedValue(
      fakeOrderDetail({
        status: 'REFUNDED',
        payments: [{ confirmedAt: new Date('2026-07-02T00:00:00Z') }],
        disputes: [{ createdAt: new Date('2026-07-03T00:00:00Z'), resolvedAt: new Date('2026-07-06T00:00:00Z') }],
      }),
    );

    const app = createApp();
    const res = await request(app).get(`/api/v1/orders/${ORDER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.timeline).toEqual([
      { status: 'PENDING', label: 'Pending Payment', at: '2026-07-10T00:00:00.000Z' },
      { status: 'PAID', label: 'Paid', at: '2026-07-02T00:00:00.000Z' },
      { status: 'DISPUTED', label: 'Disputed', at: '2026-07-03T00:00:00.000Z' },
      { status: 'REFUNDED', label: 'Refunded', at: '2026-07-06T00:00:00.000Z' },
    ]);
  });

  it('shows the seller a Paid status while escrow is held', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrderDetail());
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });

    const app = createApp();
    const res = await request(app).get(`/api/v1/orders/${ORDER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.displayStatus).toBe('Paid');
    expect(res.body.data.sellerPayoutEligible).toBe(false);
  });

  it('marks sellerPayoutEligible true once escrow has a RELEASE entry', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrderDetail({ escrowEntries: [{ type: 'HOLD' }, { type: 'RELEASE' }] }));

    const app = createApp();
    const res = await request(app).get(`/api/v1/orders/${ORDER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.sellerPayoutEligible).toBe(true);
  });

  it('404s when the order does not exist', async () => {
    orderFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get(`/api/v1/orders/${ORDER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  it('403s for someone not part of the order', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrderDetail());
    getUserMock.mockResolvedValue({ data: { user: { id: 'stranger' } }, error: null });

    const app = createApp();
    const res = await request(app).get(`/api/v1/orders/${ORDER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/orders/:orderId/pay', () => {
  it('initiates an EcoCash mobile payment', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder());
    paymentCreateMock.mockResolvedValue({ id: 'payment-1' });
    initiateMobilePaymentMock.mockResolvedValue({
      success: true,
      hasRedirect: false,
      pollUrl: 'https://paynow.example/poll/1',
      instructions: 'Dial *151# to complete payment',
    });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/pay`)
      .set(AUTH_HEADER)
      .send({ method: 'ECOCASH', email: 'buyer@example.com', phone: '0771234567' });

    expect(res.status).toBe(200);
    expect(res.body.data.instructions).toContain('Dial *151#');
    expect(initiateMobilePaymentMock).toHaveBeenCalledWith(
      'payment-1',
      'buyer@example.com',
      45.5,
      'Nike Air Max',
      '0771234567',
      'ecocash',
    );
  });

  it('initiates a Zimswitch web payment with a redirect URL', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder());
    paymentCreateMock.mockResolvedValue({ id: 'payment-2' });
    initiateWebPaymentMock.mockResolvedValue({
      success: true,
      hasRedirect: true,
      redirectUrl: 'https://paynow.example/checkout/2',
      pollUrl: 'https://paynow.example/poll/2',
    });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/pay`)
      .set(AUTH_HEADER)
      .send({ method: 'ZIMSWITCH', email: 'buyer@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.data.redirectUrl).toBe('https://paynow.example/checkout/2');
  });

  it('rejects a mobile money payment missing a phone number', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/pay`)
      .set(AUTH_HEADER)
      .send({ method: 'ONEMONEY', email: 'buyer@example.com' });

    expect(res.status).toBe(400);
  });

  it('403s when the caller is not the order buyer', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ buyerId: 'someone-else' }));

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/pay`)
      .set(AUTH_HEADER)
      .send({ method: 'ZIMSWITCH', email: 'buyer@example.com' });

    expect(res.status).toBe(403);
  });

  it('409s when the order is not PENDING', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'PAID' }));

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/pay`)
      .set(AUTH_HEADER)
      .send({ method: 'ZIMSWITCH', email: 'buyer@example.com' });

    expect(res.status).toBe(409);
  });

  it('marks the payment FAILED and returns 502 when Paynow rejects the request', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder());
    paymentCreateMock.mockResolvedValue({ id: 'payment-3' });
    initiateWebPaymentMock.mockResolvedValue({ success: false, error: 'Invalid integration id' });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/pay`)
      .set(AUTH_HEADER)
      .send({ method: 'ZIMSWITCH', email: 'buyer@example.com' });

    expect(res.status).toBe(502);
    expect(paymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
});

describe('GET /api/v1/orders/:orderId/payment-status', () => {
  it('polls Paynow and confirms the order when paid', async () => {
    const pendingPayment = { id: 'payment-4', status: 'PENDING', paynowPollUrl: 'https://paynow.example/poll/4' };
    orderFindUniqueMock
      // route's initial lookup
      .mockResolvedValueOnce(fakeOrder({ payments: [pendingPayment] }))
      // confirmOrderPayment's own lookup
      .mockResolvedValueOnce(fakeOrder({ payments: [pendingPayment] }))
      // route's final "fresh" lookup after confirming
      .mockResolvedValueOnce(
        fakeOrder({ status: 'PAID', payments: [{ ...pendingPayment, status: 'CONFIRMED' }] }),
      );
    pollPaymentStatusMock.mockResolvedValue({ status: 'paid' });
    orderUpdateManyMock.mockResolvedValue({ count: 1 });

    const app = createApp();
    const res = await request(app).get(`/api/v1/orders/${ORDER_ID}/payment-status`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.orderStatus).toBe('PAID');
    expect(res.body.data.paymentStatus).toBe('CONFIRMED');
  });

  it('is accessible to the seller as well as the buyer', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
    orderFindUniqueMock
      .mockResolvedValueOnce(fakeOrder({ status: 'PAID', payments: [{ id: 'p', status: 'CONFIRMED', paynowPollUrl: null }] }))
      .mockResolvedValueOnce(fakeOrder({ status: 'PAID', payments: [{ id: 'p', status: 'CONFIRMED' }] }));

    const app = createApp();
    const res = await request(app).get(`/api/v1/orders/${ORDER_ID}/payment-status`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(pollPaymentStatusMock).not.toHaveBeenCalled();
  });

  it('403s for someone not part of the order', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder());
    getUserMock.mockResolvedValue({ data: { user: { id: 'stranger' } }, error: null });

    const app = createApp();
    const res = await request(app).get(`/api/v1/orders/${ORDER_ID}/payment-status`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/orders/:orderId/confirm-delivery', () => {
  it('releases escrow (95% to seller, 5% commission) and marks the order COMPLETED', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'PAID' }));
    orderUpdateManyMock.mockResolvedValue({ count: 1 });

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/confirm-delivery`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(orderUpdateManyMock).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: 'PAID' },
      data: { status: 'COMPLETED' },
    });
    expect(escrowCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RELEASE', amount: 43.22 }) }),
    );
    expect(escrowCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'COMMISSION', amount: 2.28 }) }),
    );
  });

  it('403s when the caller is not the buyer', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ buyerId: 'someone-else' }));

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/confirm-delivery`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });

  it('409s when the order is not PAID', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'PENDING' }));

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/confirm-delivery`).set(AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(escrowCreateMock).not.toHaveBeenCalled();
  });

  it('404s when the order does not exist', async () => {
    orderFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/confirm-delivery`).set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/orders/:orderId/pay (cash on delivery)', () => {
  it('creates a PENDING cash-on-delivery payment without calling Paynow when the seller has COD enabled', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder());
    sellerProfileFindUniqueMock.mockResolvedValue({ codEnabled: true });
    paymentCreateMock.mockResolvedValue({ id: 'payment-cod-1' });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/pay`)
      .set(AUTH_HEADER)
      .send({ method: 'CASH_ON_DELIVERY' });

    expect(res.status).toBe(200);
    expect(res.body.data.instructions).toContain('Pay in cash');
    expect(initiateWebPaymentMock).not.toHaveBeenCalled();
    expect(initiateMobilePaymentMock).not.toHaveBeenCalled();
    expect(paymentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ method: 'CASH_ON_DELIVERY', status: 'PENDING' }) }),
    );
  });

  it('400s when the seller has not enabled COD', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder());
    sellerProfileFindUniqueMock.mockResolvedValue({ codEnabled: false });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/pay`)
      .set(AUTH_HEADER)
      .send({ method: 'CASH_ON_DELIVERY' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COD_NOT_AVAILABLE');
    expect(paymentCreateMock).not.toHaveBeenCalled();
  });

  it('400s when the seller has no seller profile at all', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder());
    sellerProfileFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/pay`)
      .set(AUTH_HEADER)
      .send({ method: 'CASH_ON_DELIVERY' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COD_NOT_AVAILABLE');
  });

  it('does not require an email for cash on delivery', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder());
    sellerProfileFindUniqueMock.mockResolvedValue({ codEnabled: true });
    paymentCreateMock.mockResolvedValue({ id: 'payment-cod-2' });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/pay`)
      .set(AUTH_HEADER)
      .send({ method: 'CASH_ON_DELIVERY' });

    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/orders/:orderId/mark-collected', () => {
  function fakeCodOrder(overrides: Partial<Record<string, unknown>> = {}) {
    return fakeOrder({
      status: 'PENDING',
      payments: [{ id: 'payment-cod-1', method: 'CASH_ON_DELIVERY', status: 'PENDING' }],
      ...overrides,
    });
  }

  beforeEach(() => {
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
  });

  it('marks the order COMPLETED and the payment CONFIRMED, with no escrow entries', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeCodOrder());
    orderUpdateManyMock.mockResolvedValue({ count: 1 });

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/mark-collected`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(orderUpdateManyMock).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: 'PENDING' },
      data: { status: 'COMPLETED' },
    });
    expect(paymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED' }) }),
    );
    expect(escrowCreateMock).not.toHaveBeenCalled();
  });

  it('403s when the caller is not the listing seller', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeCodOrder());
    getUserMock.mockResolvedValue({ data: { user: { id: 'not-the-seller' } }, error: null });

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/mark-collected`).set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });

  it('409s when the order was not paid by cash on delivery', async () => {
    orderFindUniqueMock.mockResolvedValue(
      fakeOrder({ status: 'PENDING', payments: [{ id: 'p', method: 'ECOCASH', status: 'PENDING' }] }),
    );

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/mark-collected`).set(AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(orderUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s when the order is already COMPLETED', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeCodOrder({ status: 'COMPLETED' }));

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/mark-collected`).set(AUTH_HEADER);

    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/orders/:orderId/dispute', () => {
  const body = { reason: 'Item arrived damaged', evidenceImageUrls: ['https://res.cloudinary.com/x/disputes/a.jpg'] };

  it('creates an OPEN dispute for a PAID order', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'PAID' }));
    orderUpdateManyMock.mockResolvedValue({ count: 1 });
    paymentDisputeCreateMock.mockResolvedValue({
      id: 'dispute-1',
      orderId: ORDER_ID,
      status: 'OPEN',
      reason: body.reason,
      evidenceImageUrls: body.evidenceImageUrls,
      createdAt: new Date('2026-07-10T00:00:00Z'),
    });

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/dispute`).set(AUTH_HEADER).send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('OPEN');
    expect(orderUpdateManyMock).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: 'PAID' },
      data: { status: 'DISPUTED' },
    });
    expect(paymentDisputeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: ORDER_ID, raisedById: BUYER_ID, reason: body.reason }),
      }),
    );
  });

  it('allows raising a dispute while SHIPPED too', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'SHIPPED' }));
    orderUpdateManyMock.mockResolvedValue({ count: 1 });
    paymentDisputeCreateMock.mockResolvedValue({ id: 'dispute-2', orderId: ORDER_ID, status: 'OPEN', ...body, createdAt: new Date() });

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/dispute`).set(AUTH_HEADER).send(body);

    expect(res.status).toBe(201);
  });

  it('403s when the caller is not the buyer', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'PAID', buyerId: 'someone-else' }));

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/dispute`).set(AUTH_HEADER).send(body);

    expect(res.status).toBe(403);
    expect(paymentDisputeCreateMock).not.toHaveBeenCalled();
  });

  it('409s once the order has already COMPLETED (escrow already released)', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'COMPLETED' }));

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/dispute`).set(AUTH_HEADER).send(body);

    expect(res.status).toBe(409);
    expect(orderUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s when the order is already DISPUTED', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'DISPUTED' }));

    const app = createApp();
    const res = await request(app).post(`/api/v1/orders/${ORDER_ID}/dispute`).set(AUTH_HEADER).send(body);

    expect(res.status).toBe(409);
    expect(orderUpdateManyMock).not.toHaveBeenCalled();
  });

  it('400s when no evidence image is provided', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/dispute`)
      .set(AUTH_HEADER)
      .send({ reason: 'Item arrived damaged', evidenceImageUrls: [] });

    expect(res.status).toBe(400);
    expect(paymentDisputeCreateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/orders/:orderId/ship', () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
  });

  it('ships via courier with a tracking reference', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'PAID' }));
    orderUpdateManyMock.mockResolvedValue({ count: 1 });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/ship`)
      .set(AUTH_HEADER)
      .send({ shippingMethod: 'COURIER', trackingReference: 'CR-12345' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: ORDER_ID,
      status: 'SHIPPED',
      displayStatus: 'Shipped',
      shippingMethod: 'COURIER',
      trackingReference: 'CR-12345',
    });
    expect(orderUpdateManyMock).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: 'PAID' },
      data: {
        status: 'SHIPPED',
        shippingMethod: 'COURIER',
        trackingReference: 'CR-12345',
        shippedAt: expect.any(Date),
      },
    });
  });

  it('ships via meetup with no tracking reference required', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'PAID' }));
    orderUpdateManyMock.mockResolvedValue({ count: 1 });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/ship`)
      .set(AUTH_HEADER)
      .send({ shippingMethod: 'MEETUP' });

    expect(res.status).toBe(200);
    expect(res.body.data.trackingReference).toBeNull();
  });

  it('400s when courier is chosen without a tracking reference', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/ship`)
      .set(AUTH_HEADER)
      .send({ shippingMethod: 'COURIER' });

    expect(res.status).toBe(400);
    expect(orderUpdateManyMock).not.toHaveBeenCalled();
  });

  it('403s when the caller is not the listing seller', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'PAID' }));
    getUserMock.mockResolvedValue({ data: { user: { id: 'not-the-seller' } }, error: null });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/ship`)
      .set(AUTH_HEADER)
      .send({ shippingMethod: 'MEETUP' });

    expect(res.status).toBe(403);
  });

  it('409s when the order is not PAID', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'PENDING' }));

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/ship`)
      .set(AUTH_HEADER)
      .send({ shippingMethod: 'MEETUP' });

    expect(res.status).toBe(409);
  });

  it('404s when the order does not exist', async () => {
    orderFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/orders/${ORDER_ID}/ship`)
      .set(AUTH_HEADER)
      .send({ shippingMethod: 'MEETUP' });

    expect(res.status).toBe(404);
  });
});
