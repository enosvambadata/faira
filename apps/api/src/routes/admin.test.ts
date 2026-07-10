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

vi.mock('../services/escrowRelease', () => ({
  releaseEscrowFunds: (...args: unknown[]) => releaseEscrowFundsMock(...args),
}));

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
    },
    sellerProfile: { upsert: vi.fn() },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
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
    expect(res.body.data).toEqual({ id: 'order-1', status: 'DELIVERED' });
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
