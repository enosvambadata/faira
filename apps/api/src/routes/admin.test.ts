import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

const verificationFindManyMock = vi.fn();
const verificationFindUniqueMock = vi.fn();
const transactionMock = vi.fn();
const verificationUpdateMock = vi.fn();
const updateUserByIdMock = vi.fn();
const deletionFindManyMock = vi.fn();
const deletionFindUniqueMock = vi.fn();
const deletionUpdateMock = vi.fn();
const userUpdateMock = vi.fn();
const auditLogCreateMock = vi.fn();
const orderFindManyMock = vi.fn();
const orderFindUniqueMock = vi.fn();
const orderUpdateMock = vi.fn();
const sendPushNotificationMock = vi.fn();
const releaseEscrowFundsMock = vi.fn();
const orderUpdateManyMock = vi.fn();
const paymentDisputeFindManyMock = vi.fn();
const paymentDisputeFindUniqueMock = vi.fn();
const paymentDisputeUpdateMock = vi.fn();
const escrowLedgerEntryCreateMock = vi.fn();
const payoutRequestFindManyMock = vi.fn();
const payoutRequestFindUniqueMock = vi.fn();
const payoutRequestUpdateMock = vi.fn();
const deliveryFeeRateFindManyMock = vi.fn();
const deliveryFeeRateUpsertMock = vi.fn();
const notifyOrderStatusChangeMock = vi.fn();
const reviewFlagFindManyMock = vi.fn();
const reviewFlagFindUniqueMock = vi.fn();
const reviewFlagUpdateMock = vi.fn();

vi.mock('../services/orderNotifications', () => ({
  notifyOrderStatusChange: (...args: unknown[]) => notifyOrderStatusChangeMock(...args),
}));

vi.mock('../supabase', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
      admin: { updateUserById: (...args: unknown[]) => updateUserByIdMock(...args) },
    },
  },
  supabasePublic: { auth: {} },
}));

vi.mock('../lib/push', () => ({
  sendPushNotification: (...args: unknown[]) => sendPushNotificationMock(...args),
}));

vi.mock('../services/escrowRelease', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/escrowRelease')>();
  return {
    ...actual,
    releaseEscrowFunds: (...args: unknown[]) => releaseEscrowFundsMock(...args),
  };
});

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}), update: (...args: unknown[]) => userUpdateMock(...args) },
    verificationRequest: {
      findMany: (...args: unknown[]) => verificationFindManyMock(...args),
      findUnique: (...args: unknown[]) => verificationFindUniqueMock(...args),
      update: (...args: unknown[]) => verificationUpdateMock(...args),
    },
    accountDeletionRequest: {
      findMany: (...args: unknown[]) => deletionFindManyMock(...args),
      findUnique: (...args: unknown[]) => deletionFindUniqueMock(...args),
      update: (...args: unknown[]) => deletionUpdateMock(...args),
    },
    order: {
      findMany: (...args: unknown[]) => orderFindManyMock(...args),
      findUnique: (...args: unknown[]) => orderFindUniqueMock(...args),
      update: (...args: unknown[]) => orderUpdateMock(...args),
      updateMany: (...args: unknown[]) => orderUpdateManyMock(...args),
    },
    paymentDispute: {
      findMany: (...args: unknown[]) => paymentDisputeFindManyMock(...args),
      findUnique: (...args: unknown[]) => paymentDisputeFindUniqueMock(...args),
      update: (...args: unknown[]) => paymentDisputeUpdateMock(...args),
    },
    escrowLedgerEntry: { create: (...args: unknown[]) => escrowLedgerEntryCreateMock(...args) },
    payoutRequest: {
      findMany: (...args: unknown[]) => payoutRequestFindManyMock(...args),
      findUnique: (...args: unknown[]) => payoutRequestFindUniqueMock(...args),
      update: (...args: unknown[]) => payoutRequestUpdateMock(...args),
    },
    sellerProfile: { upsert: vi.fn() },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    deliveryFeeRate: {
      findMany: (...args: unknown[]) => deliveryFeeRateFindManyMock(...args),
      upsert: (...args: unknown[]) => deliveryFeeRateUpsertMock(...args),
    },
    reviewFlag: {
      findMany: (...args: unknown[]) => reviewFlagFindManyMock(...args),
      findUnique: (...args: unknown[]) => reviewFlagFindUniqueMock(...args),
      update: (...args: unknown[]) => reviewFlagUpdateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');

const ADMIN_TOKEN = 'test-admin-secret';
const ADMIN_HEADER = { 'x-admin-token': ADMIN_TOKEN };

function fakeRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'verification-1',
    sellerId: 'seller-1',
    status: 'PENDING',
    idDocumentUrl: 'https://res.cloudinary.com/x/verification/id.jpg',
    selfieUrl: 'https://res.cloudinary.com/x/verification/selfie.jpg',
    rejectionReason: null,
    createdAt: new Date('2026-07-05T00:00:00Z'),
    reviewedAt: null,
    seller: { id: 'seller-1', displayName: 'Rudo', city: 'Harare' },
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
});

afterEach(() => {
  delete process.env.ADMIN_TOKEN;
});

describe('GET /api/v1/admin/verification', () => {
  beforeEach(() => {
    verificationFindManyMock.mockReset();
  });

  it('lists pending verification requests by default', async () => {
    verificationFindManyMock.mockResolvedValue([fakeRequest()]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/verification').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('PENDING');
    expect(verificationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' } }),
    );
  });

  it('filters by an explicit status', async () => {
    verificationFindManyMock.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/verification?status=APPROVED').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(verificationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'APPROVED' } }),
    );
  });

  it('rejects a request with no admin token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/admin/verification');

    expect(res.status).toBe(401);
    expect(verificationFindManyMock).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong admin token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/admin/verification').set({ 'x-admin-token': 'wrong' });

    expect(res.status).toBe(401);
    expect(verificationFindManyMock).not.toHaveBeenCalled();
  });

  it('fails closed when ADMIN_TOKEN is not configured', async () => {
    delete process.env.ADMIN_TOKEN;

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/verification').set(ADMIN_HEADER);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('ADMIN_NOT_CONFIGURED');
  });
});

describe('POST /api/v1/admin/verification/:id/approve', () => {
  beforeEach(() => {
    verificationFindUniqueMock.mockReset();
    transactionMock.mockReset();
  });

  it('approves a pending request and marks the seller verified', async () => {
    verificationFindUniqueMock.mockResolvedValue(fakeRequest());
    transactionMock.mockResolvedValue([{}, {}]);

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/verification-1/approve').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'verification-1', status: 'APPROVED' });
    expect(transactionMock).toHaveBeenCalled();
  });

  it('rejects approving a request that is not pending', async () => {
    verificationFindUniqueMock.mockResolvedValue(fakeRequest({ status: 'APPROVED' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/verification-1/approve').set(ADMIN_HEADER);

    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent request', async () => {
    verificationFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/nonexistent/approve').set(ADMIN_HEADER);

    expect(res.status).toBe(404);
  });

  it('rejects without a valid admin token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/verification-1/approve');

    expect(res.status).toBe(401);
    expect(verificationFindUniqueMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/verification/:id/reject', () => {
  beforeEach(() => {
    verificationFindUniqueMock.mockReset();
    verificationUpdateMock.mockReset();
  });

  it('rejects a pending request with a reason', async () => {
    verificationFindUniqueMock.mockResolvedValue(fakeRequest());
    verificationUpdateMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/verification/verification-1/reject')
      .set(ADMIN_HEADER)
      .send({ reason: 'Photo is blurry' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'verification-1', status: 'REJECTED' });
    expect(verificationUpdateMock).toHaveBeenCalledWith({
      where: { id: 'verification-1' },
      data: { status: 'REJECTED', reviewedAt: expect.any(Date), rejectionReason: 'Photo is blurry' },
    });
  });

  it('rejects a request that is not pending', async () => {
    verificationFindUniqueMock.mockResolvedValue(fakeRequest({ status: 'REJECTED' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/verification-1/reject').set(ADMIN_HEADER).send({});

    expect(res.status).toBe(400);
    expect(verificationUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent request', async () => {
    verificationFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/nonexistent/reject').set(ADMIN_HEADER).send({});

    expect(res.status).toBe(404);
  });

  it('rejects without a valid admin token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/admin/verification/verification-1/reject').send({});

    expect(res.status).toBe(401);
    expect(verificationFindUniqueMock).not.toHaveBeenCalled();
  });
});

function fakeDeletionRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'deletion-1',
    userId: 'user-1',
    status: 'PENDING',
    requestedAt: new Date('2026-07-05T00:00:00Z'),
    scheduledFor: new Date('2026-08-04T00:00:00Z'),
    processedAt: null,
    user: { id: 'user-1', displayName: 'Tendai', city: 'Harare' },
    ...overrides,
  };
}

describe('GET /api/v1/admin/deletion-requests/due', () => {
  beforeEach(() => {
    deletionFindManyMock.mockReset();
  });

  it('lists deletion requests past their scheduled date', async () => {
    deletionFindManyMock.mockResolvedValue([fakeDeletionRequest()]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/deletion-requests/due').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(deletionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING', scheduledFor: { lte: expect.any(Date) } } }),
    );
  });

  it('rejects without a valid admin token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/admin/deletion-requests/due');

    expect(res.status).toBe(401);
    expect(deletionFindManyMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/deletion-requests/:id/process', () => {
  beforeEach(() => {
    deletionFindUniqueMock.mockReset();
    deletionUpdateMock.mockReset();
    updateUserByIdMock.mockReset();
    transactionMock.mockReset();
  });

  it('anonymizes the user and marks the request processed', async () => {
    deletionFindUniqueMock.mockResolvedValue(fakeDeletionRequest());
    updateUserByIdMock.mockResolvedValue({ data: {}, error: null });
    transactionMock.mockResolvedValue([{}, {}, {}]);

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/deletion-requests/deletion-1/process').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'deletion-1', status: 'PROCESSED' });
    expect(updateUserByIdMock).toHaveBeenCalledWith('user-1', { ban_duration: '87600h' });
    expect(transactionMock).toHaveBeenCalled();
  });

  it('surfaces a failure from the ban/anonymize call and does not touch the DB', async () => {
    deletionFindUniqueMock.mockResolvedValue(fakeDeletionRequest());
    updateUserByIdMock.mockResolvedValue({ data: null, error: { message: 'boom', status: 500 } });

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/deletion-requests/deletion-1/process').set(ADMIN_HEADER);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('ANONYMIZATION_FAILED');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects processing a request that is not pending', async () => {
    deletionFindUniqueMock.mockResolvedValue(fakeDeletionRequest({ status: 'PROCESSED' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/deletion-requests/deletion-1/process').set(ADMIN_HEADER);

    expect(res.status).toBe(400);
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent request', async () => {
    deletionFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/deletion-requests/nonexistent/process').set(ADMIN_HEADER);

    expect(res.status).toBe(404);
  });

  it('rejects without a valid admin token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/admin/deletion-requests/deletion-1/process');

    expect(res.status).toBe(401);
    expect(deletionFindUniqueMock).not.toHaveBeenCalled();
  });
});

function fakeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-1',
    buyerId: 'buyer-1',
    status: 'PAID',
    deliveryReminderDay3SentAt: null,
    deliveryReminderDay4SentAt: null,
    listing: { title: 'Nike Air Max' },
    buyer: { expoPushToken: 'ExponentPushToken[abc]', pushNotificationsEnabled: true },
    payments: [{ status: 'CONFIRMED', confirmedAt: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000) }],
    ...overrides,
  };
}

describe('GET /api/v1/admin/orders/delivery-reminders-due', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('flags an order paid 3.5 days ago as due for the day-3 reminder', async () => {
    orderFindManyMock.mockResolvedValue([fakeOrder()]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/orders/delivery-reminders-due').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ id: 'order-1', reminderDay: 3 }),
    ]);
  });

  it('skips an order that already got its day-3 reminder and is not yet at day 4', async () => {
    orderFindManyMock.mockResolvedValue([fakeOrder({ deliveryReminderDay3SentAt: new Date() })]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/orders/delivery-reminders-due').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('flags an order paid 4.5 days ago as due for the day-4 reminder', async () => {
    orderFindManyMock.mockResolvedValue([
      fakeOrder({
        deliveryReminderDay3SentAt: new Date(),
        payments: [{ status: 'CONFIRMED', confirmedAt: new Date(Date.now() - 4.5 * 24 * 60 * 60 * 1000) }],
      }),
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/orders/delivery-reminders-due').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ id: 'order-1', reminderDay: 4 }),
    ]);
  });
});

describe('POST /api/v1/admin/orders/:id/send-delivery-reminder', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    sendPushNotificationMock.mockReset().mockResolvedValue(undefined);
    orderUpdateMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('sends the push notification and records the reminder timestamp', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder());

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/orders/order-1/send-delivery-reminder')
      .set(ADMIN_HEADER)
      .send({ reminderDay: 3 });

    expect(res.status).toBe(200);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ExponentPushToken[abc]' }),
    );
    expect(orderUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveryReminderDay3SentAt: expect.any(Date) }) }),
    );
  });

  it('409s if that reminder was already sent', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ deliveryReminderDay3SentAt: new Date() }));

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/orders/order-1/send-delivery-reminder')
      .set(ADMIN_HEADER)
      .send({ reminderDay: 3 });

    expect(res.status).toBe(409);
    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });

  it('409s if the order is not PAID', async () => {
    orderFindUniqueMock.mockResolvedValue(fakeOrder({ status: 'DELIVERED' }));

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/orders/order-1/send-delivery-reminder')
      .set(ADMIN_HEADER)
      .send({ reminderDay: 3 });

    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/admin/orders/auto-release-due', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('lists an order paid 5.5 days ago', async () => {
    orderFindManyMock.mockResolvedValue([
      fakeOrder({ payments: [{ status: 'CONFIRMED', confirmedAt: new Date(Date.now() - 5.5 * 24 * 60 * 60 * 1000) }] }),
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/orders/auto-release-due').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'order-1', buyerId: 'buyer-1' }]);
  });

  it('excludes an order paid only 2 days ago', async () => {
    orderFindManyMock.mockResolvedValue([
      fakeOrder({ payments: [{ status: 'CONFIRMED', confirmedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }] }),
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/orders/auto-release-due').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('POST /api/v1/admin/orders/:id/auto-release', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    releaseEscrowFundsMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('releases escrow for an eligible order', async () => {
    releaseEscrowFundsMock.mockResolvedValue({ released: true, order: { id: 'order-1' } });

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/orders/order-1/auto-release').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'order-1', status: 'COMPLETED' });
  });

  it('409s when the order is not eligible for release', async () => {
    releaseEscrowFundsMock.mockResolvedValue({ released: false, order: { id: 'order-1', status: 'PENDING' } });

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/orders/order-1/auto-release').set(ADMIN_HEADER);

    expect(res.status).toBe(409);
  });

  it('404s when the order does not exist', async () => {
    releaseEscrowFundsMock.mockResolvedValue({ released: false, order: null });

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/orders/nonexistent/auto-release').set(ADMIN_HEADER);

    expect(res.status).toBe(404);
  });
});

function fakeDispute(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'dispute-1',
    orderId: 'order-1',
    reason: 'Item arrived damaged',
    evidenceImageUrls: ['https://res.cloudinary.com/x/disputes/a.jpg'],
    status: 'OPEN',
    createdAt: new Date('2026-07-10T00:00:00Z'),
    raisedBy: { id: 'buyer-1', displayName: 'Tendai' },
    order: {
      id: 'order-1',
      status: 'DISPUTED',
      priceAtPurchase: 100,
      listing: { title: 'Nike Air Max', sellerId: 'seller-1' },
    },
    ...overrides,
  };
}

describe('GET /api/v1/admin/disputes', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('lists open disputes with order and buyer context', async () => {
    paymentDisputeFindManyMock.mockResolvedValue([fakeDispute()]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/disputes').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ id: 'dispute-1', sellerId: 'seller-1', listingTitle: 'Nike Air Max' }),
    ]);
  });
});

describe('POST /api/v1/admin/disputes/:id/resolve', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    orderUpdateManyMock.mockReset().mockResolvedValue({ count: 1 });
    escrowLedgerEntryCreateMock.mockReset();
    paymentDisputeUpdateMock.mockReset();
    transactionMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('issues a full refund: REFUND entry only, order REFUNDED, dispute RESOLVED_BUYER', async () => {
    paymentDisputeFindUniqueMock.mockResolvedValue(fakeDispute());

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/disputes/dispute-1/resolve')
      .set(ADMIN_HEADER)
      .send({ refundAmount: 100 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'dispute-1', status: 'RESOLVED_BUYER', refundAmount: 100, orderStatus: 'REFUNDED' });
    expect(orderUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'DISPUTED' },
      data: { status: 'REFUNDED' },
    });
    expect(escrowLedgerEntryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'REFUND', amount: 100 }) }),
    );
    expect(escrowLedgerEntryCreateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RELEASE' }) }),
    );
  });

  it('issues a partial refund: REFUND + RELEASE + COMMISSION on the remainder', async () => {
    paymentDisputeFindUniqueMock.mockResolvedValue(fakeDispute());

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/disputes/dispute-1/resolve')
      .set(ADMIN_HEADER)
      .send({ refundAmount: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RESOLVED_BUYER');
    expect(escrowLedgerEntryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'REFUND', amount: 20 }) }),
    );
    expect(escrowLedgerEntryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RELEASE', amount: 76 }) }),
    );
    expect(escrowLedgerEntryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'COMMISSION', amount: 4 }) }),
    );
  });

  it('rejects the dispute (no refund): RELEASE + COMMISSION on the full amount, order COMPLETED, RESOLVED_SELLER', async () => {
    paymentDisputeFindUniqueMock.mockResolvedValue(fakeDispute());

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/disputes/dispute-1/resolve').set(ADMIN_HEADER).send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'dispute-1', status: 'RESOLVED_SELLER', refundAmount: 0, orderStatus: 'COMPLETED' });
    expect(escrowLedgerEntryCreateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'REFUND' }) }),
    );
    expect(escrowLedgerEntryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RELEASE', amount: 95 }) }),
    );
  });

  it('400s when refundAmount exceeds the order price', async () => {
    paymentDisputeFindUniqueMock.mockResolvedValue(fakeDispute());

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/disputes/dispute-1/resolve')
      .set(ADMIN_HEADER)
      .send({ refundAmount: 150 });

    expect(res.status).toBe(400);
    expect(orderUpdateManyMock).not.toHaveBeenCalled();
  });

  it('409s when the dispute is already resolved', async () => {
    paymentDisputeFindUniqueMock.mockResolvedValue(fakeDispute({ status: 'RESOLVED_SELLER' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/disputes/dispute-1/resolve').set(ADMIN_HEADER).send({});

    expect(res.status).toBe(409);
  });

  it('404s when the dispute does not exist', async () => {
    paymentDisputeFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/disputes/nonexistent/resolve').set(ADMIN_HEADER).send({});

    expect(res.status).toBe(404);
  });

  it('409s when another request already changed the order status (race)', async () => {
    paymentDisputeFindUniqueMock.mockResolvedValue(fakeDispute());
    orderUpdateManyMock.mockResolvedValue({ count: 0 });

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/disputes/dispute-1/resolve').set(ADMIN_HEADER).send({});

    expect(res.status).toBe(409);
    expect(escrowLedgerEntryCreateMock).not.toHaveBeenCalled();
  });
});

function fakePayoutRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'payout-1',
    sellerId: 'seller-1',
    amount: { toString: () => '50' },
    status: 'PENDING',
    payoutMethodDetails: '+263771234567',
    requestedAt: new Date('2026-07-10T00:00:00Z'),
    seller: { id: 'seller-1', displayName: 'Rudo' },
    ...overrides,
  };
}

describe('GET /api/v1/admin/payout-requests', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('defaults to listing PENDING requests', async () => {
    payoutRequestFindManyMock.mockResolvedValue([fakePayoutRequest()]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/payout-requests').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([expect.objectContaining({ id: 'payout-1', amount: '50' })]);
    expect(payoutRequestFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' } }),
    );
  });
});

describe('POST /api/v1/admin/payout-requests/:id/mark-paid', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    payoutRequestUpdateMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('marks a PENDING request PAID', async () => {
    payoutRequestFindUniqueMock.mockResolvedValue(fakePayoutRequest());

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/payout-requests/payout-1/mark-paid').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'payout-1', status: 'PAID' });
    expect(payoutRequestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
    expect(escrowLedgerEntryCreateMock).not.toHaveBeenCalled();
  });

  it('409s when the request was already resolved', async () => {
    payoutRequestFindUniqueMock.mockResolvedValue(fakePayoutRequest({ status: 'PAID' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/payout-requests/payout-1/mark-paid').set(ADMIN_HEADER);

    expect(res.status).toBe(409);
  });

  it('404s when the request does not exist', async () => {
    payoutRequestFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/payout-requests/nonexistent/mark-paid').set(ADMIN_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/admin/payout-requests/:id/mark-failed', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    payoutRequestUpdateMock.mockReset();
    escrowLedgerEntryCreateMock.mockReset();
    transactionMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('marks the request FAILED and reverses the reserved amount with a RELEASE entry', async () => {
    payoutRequestFindUniqueMock.mockResolvedValue(fakePayoutRequest());

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/payout-requests/payout-1/mark-failed').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'payout-1', status: 'FAILED' });
    expect(escrowLedgerEntryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'RELEASE', sellerId: 'seller-1', payoutRequestId: 'payout-1' }),
      }),
    );
  });

  it('409s when the request was already resolved', async () => {
    payoutRequestFindUniqueMock.mockResolvedValue(fakePayoutRequest({ status: 'FAILED' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/admin/payout-requests/payout-1/mark-failed').set(ADMIN_HEADER);

    expect(res.status).toBe(409);
    expect(escrowLedgerEntryCreateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/delivery-fee-rates', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('lists configured rates', async () => {
    deliveryFeeRateFindManyMock.mockResolvedValue([
      { id: 'rate-1', city: 'Harare', weightTier: 'LIGHT', fee: { toString: () => '2.00' } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/delivery-fee-rates').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'rate-1', city: 'Harare', weightTier: 'LIGHT', fee: '2.00' }]);
  });
});

describe('PUT /api/v1/admin/delivery-fee-rates', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    deliveryFeeRateUpsertMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('upserts a rate for a city/weight tier', async () => {
    deliveryFeeRateUpsertMock.mockResolvedValue({
      id: 'rate-1',
      city: 'Harare',
      weightTier: 'HEAVY',
      fee: { toString: () => '6.00' },
    });

    const app = createApp();
    const res = await request(app)
      .put('/api/v1/admin/delivery-fee-rates')
      .set(ADMIN_HEADER)
      .send({ city: 'Harare', weightTier: 'HEAVY', fee: 6 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'rate-1', city: 'Harare', weightTier: 'HEAVY', fee: '6.00' });
    expect(deliveryFeeRateUpsertMock).toHaveBeenCalledWith({
      where: { city_weightTier: { city: 'Harare', weightTier: 'HEAVY' } },
      update: { fee: 6 },
      create: { city: 'Harare', weightTier: 'HEAVY', fee: 6 },
    });
  });

  it('400s on an invalid payload', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/v1/admin/delivery-fee-rates')
      .set(ADMIN_HEADER)
      .send({ city: 'Harare', weightTier: 'ULTRA_HEAVY', fee: 6 });

    expect(res.status).toBe(400);
    expect(deliveryFeeRateUpsertMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/review-flags', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    reviewFlagFindManyMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('lists PENDING flags oldest first with reviewer/review context', async () => {
    reviewFlagFindManyMock.mockResolvedValue([
      {
        id: 'flag-1',
        reason: 'This is abusive',
        createdAt: new Date('2026-07-11T00:00:00Z'),
        flaggedBy: { id: 'user-1', displayName: 'Tino' },
        review: { id: 'review-1', rating: 1, comment: 'Terrible', reviewerId: 'user-2', revieweeId: 'user-1' },
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/admin/review-flags').set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: 'flag-1',
        reason: 'This is abusive',
        createdAt: '2026-07-11T00:00:00.000Z',
        flaggedBy: { id: 'user-1', displayName: 'Tino' },
        review: { id: 'review-1', rating: 1, comment: 'Terrible', reviewerId: 'user-2', revieweeId: 'user-1' },
      },
    ]);
    expect(reviewFlagFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
    );
  });

  it('rejects a request without the admin token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/admin/review-flags');

    expect(res.status).toBe(401);
    expect(reviewFlagFindManyMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/review-flags/:id/resolve', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    reviewFlagFindUniqueMock.mockReset();
    reviewFlagUpdateMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it('dismisses a flag, making the review visible again', async () => {
    reviewFlagFindUniqueMock.mockResolvedValue({ id: 'flag-1', status: 'PENDING' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/review-flags/flag-1/resolve')
      .set(ADMIN_HEADER)
      .send({ decision: 'DISMISS' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'flag-1', status: 'DISMISSED' });
    expect(reviewFlagUpdateMock).toHaveBeenCalledWith({
      where: { id: 'flag-1' },
      data: { status: 'DISMISSED', resolvedAt: expect.any(Date) },
    });
  });

  it('removes a flag, keeping the review permanently hidden', async () => {
    reviewFlagFindUniqueMock.mockResolvedValue({ id: 'flag-1', status: 'PENDING' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/review-flags/flag-1/resolve')
      .set(ADMIN_HEADER)
      .send({ decision: 'REMOVE' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'flag-1', status: 'REMOVED' });
  });

  it('409s when the flag has already been resolved', async () => {
    reviewFlagFindUniqueMock.mockResolvedValue({ id: 'flag-1', status: 'DISMISSED' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/review-flags/flag-1/resolve')
      .set(ADMIN_HEADER)
      .send({ decision: 'REMOVE' });

    expect(res.status).toBe(409);
    expect(reviewFlagUpdateMock).not.toHaveBeenCalled();
  });

  it('404s when the flag does not exist', async () => {
    reviewFlagFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/review-flags/nonexistent/resolve')
      .set(ADMIN_HEADER)
      .send({ decision: 'DISMISS' });

    expect(res.status).toBe(404);
  });

  it('400s on an invalid decision', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/review-flags/flag-1/resolve')
      .set(ADMIN_HEADER)
      .send({ decision: 'MAYBE' });

    expect(res.status).toBe(400);
    expect(reviewFlagUpdateMock).not.toHaveBeenCalled();
  });
});
