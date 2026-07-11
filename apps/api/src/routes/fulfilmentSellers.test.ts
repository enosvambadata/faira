import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const profileFindUniqueMock = vi.fn();
const profileUpsertMock = vi.fn();
const profileUpdateMock = vi.fn();
const hubFindUniqueMock = vi.fn();
const userRoleFindFirstMock = vi.fn();
const userRoleCreateMock = vi.fn();
const auditLogCreateMock = vi.fn();
const verificationFindFirstMock = vi.fn();
const verificationCreateMock = vi.fn();
const transactionMock = vi.fn();
const createSignedUploadUrlMock = vi.fn();
const createSignedUrlMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: {
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    storage: {
      from: () => ({
        createSignedUploadUrl: (...args: unknown[]) => createSignedUploadUrlMock(...args),
        createSignedUrl: (...args: unknown[]) => createSignedUrlMock(...args),
      }),
    },
  },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    hub: { findUnique: (...args: unknown[]) => hubFindUniqueMock(...args) },
    fulfilmentSellerProfile: {
      findUnique: (...args: unknown[]) => profileFindUniqueMock(...args),
      upsert: (...args: unknown[]) => profileUpsertMock(...args),
      update: (...args: unknown[]) => profileUpdateMock(...args),
    },
    userRole: {
      findFirst: (...args: unknown[]) => userRoleFindFirstMock(...args),
      create: (...args: unknown[]) => userRoleCreateMock(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    fulfilmentVerificationRequest: {
      findFirst: (...args: unknown[]) => verificationFindFirstMock(...args),
      create: (...args: unknown[]) => verificationCreateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const USER_ID = 'seller-1';
const HUB_ID = '22222222-2222-4222-8222-222222222222';

function fakeProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'profile-1',
    fullName: null,
    mobileNumber: null,
    sellerType: null,
    businessName: null,
    productCategories: [],
    hasPhysicalShop: null,
    shopAddress: null,
    city: null,
    preferredHubId: null,
    nationalIdNumber: null,
    agreedToTermsAt: null,
    status: 'DRAFT',
    submittedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe('GET /api/v1/fulfilment/sellers/me/onboarding', () => {
  it('lazily creates a draft on first access', async () => {
    profileUpsertMock.mockResolvedValue(fakeProfile());

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/sellers/me/onboarding').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DRAFT');
    expect(profileUpsertMock).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      update: {},
      create: { userId: USER_ID },
    });
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/sellers/me/onboarding');

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/fulfilment/sellers/me/onboarding', () => {
  it('saves a partial draft', async () => {
    profileFindUniqueMock.mockResolvedValue(fakeProfile());
    profileUpsertMock.mockResolvedValue(fakeProfile({ fullName: 'Tendai Moyo' }));

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/fulfilment/sellers/me/onboarding')
      .set(AUTH_HEADER)
      .send({ fullName: 'Tendai Moyo' });

    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('Tendai Moyo');
  });

  it('converts agreeToTerms into agreedToTermsAt', async () => {
    profileFindUniqueMock.mockResolvedValue(fakeProfile());
    profileUpsertMock.mockResolvedValue(fakeProfile({ agreedToTermsAt: new Date() }));

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/fulfilment/sellers/me/onboarding')
      .set(AUTH_HEADER)
      .send({ agreeToTerms: true });

    expect(res.status).toBe(200);
    expect(profileUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ agreedToTermsAt: expect.any(Date) }) }),
    );
  });

  it('404s when preferredHubId does not reference a real hub', async () => {
    profileFindUniqueMock.mockResolvedValue(fakeProfile());
    hubFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/fulfilment/sellers/me/onboarding')
      .set(AUTH_HEADER)
      .send({ preferredHubId: HUB_ID });

    expect(res.status).toBe(404);
    expect(profileUpsertMock).not.toHaveBeenCalled();
  });

  it('409s once registration has already been submitted', async () => {
    profileFindUniqueMock.mockResolvedValue(fakeProfile({ status: 'SUBMITTED' }));

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/fulfilment/sellers/me/onboarding')
      .set(AUTH_HEADER)
      .send({ fullName: 'Tendai Moyo' });

    expect(res.status).toBe(409);
    expect(profileUpsertMock).not.toHaveBeenCalled();
  });

  it('400s on an invalid mobile number format', async () => {
    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/fulfilment/sellers/me/onboarding')
      .set(AUTH_HEADER)
      .send({ mobileNumber: '0771234567' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/fulfilment/sellers/me/onboarding/submit', () => {
  it('submits a complete draft and assigns the SELLER role', async () => {
    const completeProfile = fakeProfile({
      fullName: 'Tendai Moyo',
      mobileNumber: '+263771234567',
      sellerType: 'INDIVIDUAL',
      city: 'Harare',
      preferredHubId: HUB_ID,
      agreedToTermsAt: new Date(),
    });
    profileFindUniqueMock.mockResolvedValue(completeProfile);
    userRoleFindFirstMock.mockResolvedValue(null);
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        fulfilmentSellerProfile: {
          update: (...args: unknown[]) => {
            profileUpdateMock(...args);
            return Promise.resolve({ ...completeProfile, status: 'SUBMITTED', submittedAt: new Date() });
          },
        },
        userRole: {
          findFirst: (...args: unknown[]) => userRoleFindFirstMock(...args),
          create: (...args: unknown[]) => userRoleCreateMock(...args),
        },
      }),
    );

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/sellers/me/onboarding/submit').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUBMITTED');
    expect(userRoleCreateMock).toHaveBeenCalledWith({ data: { userId: USER_ID, role: 'SELLER' } });
  });

  it('400s when required fields are missing', async () => {
    profileFindUniqueMock.mockResolvedValue(fakeProfile());

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/sellers/me/onboarding/submit').set(AUTH_HEADER);

    expect(res.status).toBe(400);
    expect(res.body.error.details.missing).toContain('fullName');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('404s when no draft exists', async () => {
    profileFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/sellers/me/onboarding/submit').set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  it('409s when already submitted', async () => {
    profileFindUniqueMock.mockResolvedValue(fakeProfile({ status: 'SUBMITTED' }));

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/sellers/me/onboarding/submit').set(AUTH_HEADER);

    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/fulfilment/sellers/me/verification/upload-url', () => {
  it('returns a signed upload URL for a valid document type', async () => {
    createSignedUploadUrlMock.mockResolvedValue({ data: { signedUrl: 'https://signed-upload', token: 'tok' }, error: null });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/sellers/me/verification/upload-url')
      .set(AUTH_HEADER)
      .send({ docType: 'ID' });

    expect(res.status).toBe(200);
    expect(res.body.data.signedUrl).toBe('https://signed-upload');
    expect(res.body.data.path).toMatch(new RegExp(`^${USER_ID}/id-`));
  });

  it('400s on an invalid document type', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/sellers/me/verification/upload-url')
      .set(AUTH_HEADER)
      .send({ docType: 'PASSPORT' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/fulfilment/sellers/me/verification', () => {
  it('returns NOT_STARTED when no verification request exists', async () => {
    verificationFindFirstMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/sellers/me/verification').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('NOT_STARTED');
  });

  it('returns signed view URLs for uploaded documents', async () => {
    verificationFindFirstMock.mockResolvedValue({
      id: 'v1',
      status: 'SUBMITTED',
      idDocumentUrl: `${USER_ID}/id-123`,
      businessDocumentUrl: null,
      shopPhotoUrl: null,
      reviewNotes: null,
      createdAt: new Date(),
      reviewedAt: null,
    });
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://signed-view' }, error: null });

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/sellers/me/verification').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.idDocumentUrl).toBe('https://signed-view');
  });
});

describe('POST /api/v1/fulfilment/sellers/me/verification/submit', () => {
  it('submits a verification request', async () => {
    verificationFindFirstMock.mockResolvedValueOnce(null); // in-progress check
    verificationCreateMock.mockResolvedValue({ id: 'v1', status: 'SUBMITTED' });
    verificationFindFirstMock.mockResolvedValueOnce({
      id: 'v1',
      status: 'SUBMITTED',
      idDocumentUrl: `${USER_ID}/id-123`,
      businessDocumentUrl: null,
      shopPhotoUrl: null,
      reviewNotes: null,
      createdAt: new Date(),
      reviewedAt: null,
    });
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://signed-view' }, error: null });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/sellers/me/verification/submit')
      .set(AUTH_HEADER)
      .send({ idDocumentPath: `${USER_ID}/id-123` });

    expect(res.status).toBe(201);
    expect(verificationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sellerId: USER_ID, status: 'SUBMITTED' }) }),
    );
  });

  it('409s when a verification request is already in progress', async () => {
    verificationFindFirstMock.mockResolvedValueOnce({ id: 'v1', status: 'UNDER_REVIEW' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/sellers/me/verification/submit')
      .set(AUTH_HEADER)
      .send({ idDocumentPath: `${USER_ID}/id-123` });

    expect(res.status).toBe(409);
    expect(verificationCreateMock).not.toHaveBeenCalled();
  });
});
