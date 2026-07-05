import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const listingFindUniqueMock = vi.fn();
const conversationUpsertMock = vi.fn();
const conversationFindUniqueMock = vi.fn();
const conversationFindManyMock = vi.fn();
const conversationUpdateMock = vi.fn();
const messageUpdateManyMock = vi.fn();
const messageFindManyMock = vi.fn();
const messageCreateMock = vi.fn();
const messageCountMock = vi.fn();
const transactionMock = vi.fn();
const signChatUploadMock = vi.fn();
const sendPushNotificationMock = vi.fn();

vi.mock('../lib/cloudinary', () => ({
  signChatUpload: (...args: unknown[]) => signChatUploadMock(...args),
}));

vi.mock('../lib/push', () => ({
  sendPushNotification: (...args: unknown[]) => sendPushNotificationMock(...args),
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
    user: { upsert: vi.fn().mockResolvedValue({}) },
    listing: { findUnique: (...args: unknown[]) => listingFindUniqueMock(...args) },
    conversation: {
      upsert: (...args: unknown[]) => conversationUpsertMock(...args),
      findUnique: (...args: unknown[]) => conversationFindUniqueMock(...args),
      findMany: (...args: unknown[]) => conversationFindManyMock(...args),
      update: (...args: unknown[]) => conversationUpdateMock(...args),
    },
    message: {
      updateMany: (...args: unknown[]) => messageUpdateManyMock(...args),
      findMany: (...args: unknown[]) => messageFindManyMock(...args),
      create: (...args: unknown[]) => messageCreateMock(...args),
      count: (...args: unknown[]) => messageCountMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';

function fakeListing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '64d25c37-d8f0-4a11-b92e-ecb9b168f516',
    title: 'Nike Air Max',
    price: { toString: () => '45.5' },
    imageUrls: ['https://res.cloudinary.com/x/listings/a.jpg'],
    sellerId: SELLER_ID,
    deletedAt: null,
    ...overrides,
  };
}

function fakeConversation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'conversation-1',
    listingId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516',
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    createdAt: new Date('2026-07-04T00:00:00Z'),
    updatedAt: new Date('2026-07-04T00:00:00Z'),
    listing: fakeListing(),
    buyer: { id: BUYER_ID, displayName: 'Tendai', avatarUrl: null, expoPushToken: null, pushNotificationsEnabled: true },
    seller: { id: SELLER_ID, displayName: 'Rudo', avatarUrl: null, expoPushToken: null, pushNotificationsEnabled: true },
    mutedByBuyer: false,
    mutedBySeller: false,
    ...overrides,
  };
}

describe('GET /api/v1/conversations', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    conversationFindManyMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } }, error: null });
  });

  it('lists conversations sorted by most recent activity with unread count and last message', async () => {
    conversationFindManyMock.mockResolvedValue([
      {
        ...fakeConversation(),
        messages: [{ id: 'm2', body: 'Hello', imageUrl: null, senderId: SELLER_ID, createdAt: new Date('2026-07-04T00:01:00Z') }],
        _count: { messages: 1 },
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/conversations').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].unreadCount).toBe(1);
    expect(res.body.data[0].lastMessage).toEqual(
      expect.objectContaining({ body: 'Hello', senderId: SELLER_ID }),
    );
    expect(conversationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { buyerId: BUYER_ID, archivedByBuyer: false },
            { sellerId: BUYER_ID, archivedBySeller: false },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });

  it('returns an empty list with no conversations', async () => {
    conversationFindManyMock.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/conversations').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/conversations');

    expect(res.status).toBe(401);
    expect(conversationFindManyMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/conversations/unread-count', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    messageCountMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } }, error: null });
  });

  it('returns the total unread count across all conversations', async () => {
    messageCountMock.mockResolvedValue(3);

    const app = createApp();
    const res = await request(app).get('/api/v1/conversations/unread-count').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(3);
    expect(messageCountMock).toHaveBeenCalledWith({
      where: {
        senderId: { not: BUYER_ID },
        readAt: null,
        conversation: { OR: [{ buyerId: BUYER_ID }, { sellerId: BUYER_ID }] },
      },
    });
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/conversations/unread-count');

    expect(res.status).toBe(401);
    expect(messageCountMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/conversations/:id/archive', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    conversationFindUniqueMock.mockReset();
    conversationUpdateMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } }, error: null });
  });

  it('archives the conversation for the buyer', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation());
    conversationUpdateMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app).patch('/api/v1/conversations/conversation-1/archive').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.archived).toBe(true);
    expect(conversationUpdateMock).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { archivedByBuyer: true },
    });
  });

  it('archives the conversation for the seller', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
    conversationFindUniqueMock.mockResolvedValue(fakeConversation());
    conversationUpdateMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app).patch('/api/v1/conversations/conversation-1/archive').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(conversationUpdateMock).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { archivedBySeller: true },
    });
  });

  it('returns 403 for a non-participant', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation({ buyerId: 'x', sellerId: 'y' }));

    const app = createApp();
    const res = await request(app).patch('/api/v1/conversations/conversation-1/archive').set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(conversationUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent conversation', async () => {
    conversationFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).patch('/api/v1/conversations/nonexistent/archive').set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).patch('/api/v1/conversations/conversation-1/archive');

    expect(res.status).toBe(401);
    expect(conversationUpdateMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/conversations/:id/mute', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    conversationFindUniqueMock.mockReset();
    conversationUpdateMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } }, error: null });
  });

  it('mutes the conversation for the buyer', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation());
    conversationUpdateMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app).patch('/api/v1/conversations/conversation-1/mute').set(AUTH_HEADER).send({ muted: true });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'conversation-1', muted: true });
    expect(conversationUpdateMock).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { mutedByBuyer: true },
    });
  });

  it('unmutes the conversation for the seller', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
    conversationFindUniqueMock.mockResolvedValue(fakeConversation({ mutedBySeller: true }));
    conversationUpdateMock.mockResolvedValue({});

    const app = createApp();
    const res = await request(app).patch('/api/v1/conversations/conversation-1/mute').set(AUTH_HEADER).send({ muted: false });

    expect(res.status).toBe(200);
    expect(conversationUpdateMock).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { mutedBySeller: false },
    });
  });

  it('rejects a non-boolean muted value', async () => {
    const app = createApp();
    const res = await request(app).patch('/api/v1/conversations/conversation-1/mute').set(AUTH_HEADER).send({ muted: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(conversationUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-participant', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation({ buyerId: 'x', sellerId: 'y' }));

    const app = createApp();
    const res = await request(app).patch('/api/v1/conversations/conversation-1/mute').set(AUTH_HEADER).send({ muted: true });

    expect(res.status).toBe(403);
    expect(conversationUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent conversation', async () => {
    conversationFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).patch('/api/v1/conversations/nonexistent/mute').set(AUTH_HEADER).send({ muted: true });

    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).patch('/api/v1/conversations/conversation-1/mute').send({ muted: true });

    expect(res.status).toBe(401);
    expect(conversationUpdateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/conversations/upload-signature', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    signChatUploadMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } }, error: null });
  });

  it('returns a signed upload payload for an authenticated user', async () => {
    signChatUploadMock.mockReturnValue({
      signature: 'sig',
      timestamp: 123,
      apiKey: 'key',
      cloudName: 'cloud',
      folder: 'chat',
      transformation: 'w_1600,h_1600,c_limit',
    });

    const app = createApp();
    const res = await request(app).post('/api/v1/conversations/upload-signature').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.folder).toBe('chat');
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/conversations/upload-signature');

    expect(res.status).toBe(401);
    expect(signChatUploadMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/conversations', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    listingFindUniqueMock.mockReset();
    conversationUpsertMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } }, error: null });
  });

  it('creates a conversation and returns the listing summary and other participant', async () => {
    listingFindUniqueMock.mockResolvedValue(fakeListing());
    conversationUpsertMock.mockResolvedValue(fakeConversation());

    const app = createApp();
    const res = await request(app).post('/api/v1/conversations').set(AUTH_HEADER).send({ listingId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516' });

    expect(res.status).toBe(200);
    expect(res.body.data.listing).toEqual({ id: '64d25c37-d8f0-4a11-b92e-ecb9b168f516', title: 'Nike Air Max', price: '45.5', imageUrl: 'https://res.cloudinary.com/x/listings/a.jpg' });
    expect(res.body.data.otherParticipant).toEqual({ id: SELLER_ID, displayName: 'Rudo', avatarUrl: null });
    expect(res.body.data.isMuted).toBe(false);
    expect(conversationUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { listingId_buyerId: { listingId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516', buyerId: BUYER_ID } },
        create: { listingId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516', buyerId: BUYER_ID, sellerId: SELLER_ID },
      }),
    );
  });

  it('is idempotent when the conversation already exists (upsert reuses it)', async () => {
    listingFindUniqueMock.mockResolvedValue(fakeListing());
    conversationUpsertMock.mockResolvedValue(fakeConversation());

    const app = createApp();
    await request(app).post('/api/v1/conversations').set(AUTH_HEADER).send({ listingId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516' });
    const res = await request(app).post('/api/v1/conversations').set(AUTH_HEADER).send({ listingId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516' });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('conversation-1');
  });

  it('rejects starting a conversation on your own listing', async () => {
    listingFindUniqueMock.mockResolvedValue(fakeListing({ sellerId: BUYER_ID }));

    const app = createApp();
    const res = await request(app).post('/api/v1/conversations').set(AUTH_HEADER).send({ listingId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516' });

    expect(res.status).toBe(400);
    expect(conversationUpsertMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent listing', async () => {
    listingFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/conversations').set(AUTH_HEADER).send({ listingId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516' });

    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/conversations').send({ listingId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516' });

    expect(res.status).toBe(401);
    expect(conversationUpsertMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid listingId', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/conversations').set(AUTH_HEADER).send({ listingId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/conversations/:id', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    conversationFindUniqueMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } }, error: null });
  });

  it('returns the conversation for a participant', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation());

    const app = createApp();
    const res = await request(app).get('/api/v1/conversations/conversation-1').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('conversation-1');
  });

  it('returns 403 for a non-participant', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation({ buyerId: 'someone-else', sellerId: 'someone-else-2' }));

    const app = createApp();
    const res = await request(app).get('/api/v1/conversations/conversation-1').set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent conversation', async () => {
    conversationFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/conversations/nonexistent').set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/conversations/:id/messages', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    conversationFindUniqueMock.mockReset();
    messageUpdateManyMock.mockReset();
    messageFindManyMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } }, error: null });
  });

  it('returns messages oldest-first and marks the other participant\'s messages read', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation());
    messageUpdateManyMock.mockResolvedValue({ count: 1 });
    messageFindManyMock.mockResolvedValue([
      { id: 'm1', senderId: BUYER_ID, body: 'Hi', imageUrl: null, readAt: null, createdAt: new Date('2026-07-04T00:00:00Z') },
      { id: 'm2', senderId: SELLER_ID, body: 'Hello', imageUrl: null, readAt: new Date(), createdAt: new Date('2026-07-04T00:01:00Z') },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/conversations/conversation-1/messages').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe('m1');
    expect(messageUpdateManyMock).toHaveBeenCalledWith({
      where: { conversationId: 'conversation-1', senderId: { not: BUYER_ID }, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('returns 403 for a non-participant', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation({ buyerId: 'x', sellerId: 'y' }));

    const app = createApp();
    const res = await request(app).get('/api/v1/conversations/conversation-1/messages').set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(messageFindManyMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/conversations/:id/messages', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    conversationFindUniqueMock.mockReset();
    conversationUpdateMock.mockReset();
    transactionMock.mockReset();
    sendPushNotificationMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } }, error: null });
  });

  it('sends a text message', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation());
    transactionMock.mockResolvedValue([
      { id: 'm1', senderId: BUYER_ID, body: 'Is this still available?', imageUrl: null, readAt: null, createdAt: new Date() },
      {},
    ]);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/conversations/conversation-1/messages')
      .set(AUTH_HEADER)
      .send({ body: 'Is this still available?' });

    expect(res.status).toBe(201);
    expect(res.body.data.body).toBe('Is this still available?');
  });

  it('un-archives the conversation for both sides when a message is sent', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation({ archivedByBuyer: true }));
    transactionMock.mockResolvedValue([
      { id: 'm1', senderId: BUYER_ID, body: 'Still here?', imageUrl: null, readAt: null, createdAt: new Date() },
      {},
    ]);

    const app = createApp();
    await request(app)
      .post('/api/v1/conversations/conversation-1/messages')
      .set(AUTH_HEADER)
      .send({ body: 'Still here?' });

    expect(conversationUpdateMock).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { updatedAt: expect.any(Date), archivedByBuyer: false, archivedBySeller: false },
    });
  });

  it('sends an image-only message', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation());
    transactionMock.mockResolvedValue([
      { id: 'm1', senderId: BUYER_ID, body: null, imageUrl: 'https://res.cloudinary.com/x/img.jpg', readAt: null, createdAt: new Date() },
      {},
    ]);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/conversations/conversation-1/messages')
      .set(AUTH_HEADER)
      .send({ imageUrl: 'https://res.cloudinary.com/x/img.jpg' });

    expect(res.status).toBe(201);
    expect(res.body.data.imageUrl).toBe('https://res.cloudinary.com/x/img.jpg');
  });

  it('rejects a message with neither body nor image', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/conversations/conversation-1/messages').set(AUTH_HEADER).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-participant', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation({ buyerId: 'x', sellerId: 'y' }));

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/conversations/conversation-1/messages')
      .set(AUTH_HEADER)
      .send({ body: 'Hi' });

    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent conversation', async () => {
    conversationFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/conversations/nonexistent/messages')
      .set(AUTH_HEADER)
      .send({ body: 'Hi' });

    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/conversations/conversation-1/messages').send({ body: 'Hi' });

    expect(res.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('sends a push notification to the recipient when they have a token and have not muted the conversation', async () => {
    conversationFindUniqueMock.mockResolvedValue(
      fakeConversation({ seller: { id: SELLER_ID, displayName: 'Rudo', avatarUrl: null, expoPushToken: 'ExponentPushToken[seller]', pushNotificationsEnabled: true } }),
    );
    transactionMock.mockResolvedValue([
      { id: 'm1', senderId: BUYER_ID, body: 'Is this still available?', imageUrl: null, readAt: null, createdAt: new Date() },
      {},
    ]);

    const app = createApp();
    await request(app)
      .post('/api/v1/conversations/conversation-1/messages')
      .set(AUTH_HEADER)
      .send({ body: 'Is this still available?' });

    expect(sendPushNotificationMock).toHaveBeenCalledWith({
      to: 'ExponentPushToken[seller]',
      title: 'Tendai',
      body: 'Is this still available?',
      data: { conversationId: 'conversation-1', listingId: '64d25c37-d8f0-4a11-b92e-ecb9b168f516' },
    });
  });

  it('uses a photo placeholder as the push body for an image-only message', async () => {
    conversationFindUniqueMock.mockResolvedValue(
      fakeConversation({ seller: { id: SELLER_ID, displayName: 'Rudo', avatarUrl: null, expoPushToken: 'ExponentPushToken[seller]', pushNotificationsEnabled: true } }),
    );
    transactionMock.mockResolvedValue([
      { id: 'm1', senderId: BUYER_ID, body: null, imageUrl: 'https://res.cloudinary.com/x/img.jpg', readAt: null, createdAt: new Date() },
      {},
    ]);

    const app = createApp();
    await request(app)
      .post('/api/v1/conversations/conversation-1/messages')
      .set(AUTH_HEADER)
      .send({ imageUrl: 'https://res.cloudinary.com/x/img.jpg' });

    expect(sendPushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ body: '📷 Photo' }));
  });

  it('does not send a push when the recipient has muted the conversation', async () => {
    conversationFindUniqueMock.mockResolvedValue(
      fakeConversation({
        seller: { id: SELLER_ID, displayName: 'Rudo', avatarUrl: null, expoPushToken: 'ExponentPushToken[seller]', pushNotificationsEnabled: true },
        mutedBySeller: true,
      }),
    );
    transactionMock.mockResolvedValue([
      { id: 'm1', senderId: BUYER_ID, body: 'Hi', imageUrl: null, readAt: null, createdAt: new Date() },
      {},
    ]);

    const app = createApp();
    await request(app).post('/api/v1/conversations/conversation-1/messages').set(AUTH_HEADER).send({ body: 'Hi' });

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });

  it('does not send a push when the recipient has disabled push notifications', async () => {
    conversationFindUniqueMock.mockResolvedValue(
      fakeConversation({
        seller: { id: SELLER_ID, displayName: 'Rudo', avatarUrl: null, expoPushToken: 'ExponentPushToken[seller]', pushNotificationsEnabled: false },
      }),
    );
    transactionMock.mockResolvedValue([
      { id: 'm1', senderId: BUYER_ID, body: 'Hi', imageUrl: null, readAt: null, createdAt: new Date() },
      {},
    ]);

    const app = createApp();
    await request(app).post('/api/v1/conversations/conversation-1/messages').set(AUTH_HEADER).send({ body: 'Hi' });

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });

  it('does not send a push when the recipient has no registered token', async () => {
    conversationFindUniqueMock.mockResolvedValue(fakeConversation());
    transactionMock.mockResolvedValue([
      { id: 'm1', senderId: BUYER_ID, body: 'Hi', imageUrl: null, readAt: null, createdAt: new Date() },
      {},
    ]);

    const app = createApp();
    await request(app).post('/api/v1/conversations/conversation-1/messages').set(AUTH_HEADER).send({ body: 'Hi' });

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });
});
