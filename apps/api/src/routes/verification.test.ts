import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const verificationFindFirstMock = vi.fn();
const verificationCreateMock = vi.fn();
const signVerificationUploadMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
    },
  },
  supabasePublic: { auth: {} },
}));

vi.mock('../lib/cloudinary', () => ({
  signVerificationUpload: (...args: unknown[]) => signVerificationUploadMock(...args),
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    verificationRequest: {
      findFirst: (...args: unknown[]) => verificationFindFirstMock(...args),
      create: (...args: unknown[]) => verificationCreateMock(...args),
    },
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const SELLER_ID = 'seller-1';

function fakeRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'verification-1',
    sellerId: SELLER_ID,
    status: 'PENDING',
    rejectionReason: null,
    createdAt: new Date('2026-07-05T00:00:00Z'),
    reviewedAt: null,
    ...overrides,
  };
}

describe('POST /api/v1/verification/upload-signature', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    signVerificationUploadMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
  });

  it('returns a signed upload payload', async () => {
    signVerificationUploadMock.mockReturnValue({ signature: 'sig', timestamp: 1, apiKey: 'k', cloudName: 'c', folder: 'verification', transformation: 't' });

    const app = createApp();
    const res = await request(app).post('/api/v1/verification/upload-signature').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.folder).toBe('verification');
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/verification/upload-signature');

    expect(res.status).toBe(401);
    expect(signVerificationUploadMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/verification/mine', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    verificationFindFirstMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
  });

  it('returns the latest verification request', async () => {
    verificationFindFirstMock.mockResolvedValue(fakeRequest());

    const app = createApp();
    const res = await request(app).get('/api/v1/verification/mine').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
    expect(verificationFindFirstMock).toHaveBeenCalledWith({
      where: { sellerId: SELLER_ID },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns null when the seller has never submitted', async () => {
    verificationFindFirstMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/verification/mine').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/verification/mine');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/verification', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    verificationFindFirstMock.mockReset();
    verificationCreateMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } }, error: null });
  });

  const payload = {
    idDocumentUrl: 'https://res.cloudinary.com/x/verification/id.jpg',
    selfieUrl: 'https://res.cloudinary.com/x/verification/selfie.jpg',
  };

  it('creates a new verification request', async () => {
    verificationFindFirstMock.mockResolvedValue(null);
    verificationCreateMock.mockResolvedValue(fakeRequest());

    const app = createApp();
    const res = await request(app).post('/api/v1/verification').set(AUTH_HEADER).send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(verificationCreateMock).toHaveBeenCalledWith({
      data: { sellerId: SELLER_ID, idDocumentUrl: payload.idDocumentUrl, selfieUrl: payload.selfieUrl },
    });
  });

  it('allows resubmission after a rejection', async () => {
    verificationFindFirstMock.mockResolvedValue(fakeRequest({ status: 'REJECTED', rejectionReason: 'Blurry photo' }));
    verificationCreateMock.mockResolvedValue(fakeRequest());

    const app = createApp();
    const res = await request(app).post('/api/v1/verification').set(AUTH_HEADER).send(payload);

    expect(res.status).toBe(201);
    expect(verificationCreateMock).toHaveBeenCalled();
  });

  it('rejects a second submission while one is already pending', async () => {
    verificationFindFirstMock.mockResolvedValue(fakeRequest({ status: 'PENDING' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/verification').set(AUTH_HEADER).send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VERIFICATION_ALREADY_PENDING');
    expect(verificationCreateMock).not.toHaveBeenCalled();
  });

  it('rejects a submission when already approved', async () => {
    verificationFindFirstMock.mockResolvedValue(fakeRequest({ status: 'APPROVED' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/verification').set(AUTH_HEADER).send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VERIFICATION_ALREADY_APPROVED');
    expect(verificationCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid payload', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/verification').set(AUTH_HEADER).send({ idDocumentUrl: 'not-a-url' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(verificationCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/verification').send(payload);

    expect(res.status).toBe(401);
    expect(verificationCreateMock).not.toHaveBeenCalled();
  });
});
