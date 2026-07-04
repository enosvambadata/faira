import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const userUpsertMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userUpdateMock = vi.fn();
const uploadAvatarMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
    },
  },
  supabasePublic: {
    auth: {},
  },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: {
      upsert: (...args: unknown[]) => userUpsertMock(...args),
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
      update: (...args: unknown[]) => userUpdateMock(...args),
    },
  },
}));

vi.mock('../lib/cloudinary', () => ({
  uploadAvatar: (...args: unknown[]) => uploadAvatarMock(...args),
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };

describe('GET /api/v1/profile', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    userUpsertMock.mockReset();
    userFindUniqueMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    userUpsertMock.mockResolvedValue({});
  });

  it('returns the current user profile', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'user-1',
      displayName: 'Tendai',
      city: 'Harare',
      avatarUrl: 'https://cdn/x.jpg',
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/profile').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: 'user-1',
      displayName: 'Tendai',
      city: 'Harare',
      avatarUrl: 'https://cdn/x.jpg',
    });
  });

  it('returns nulls for a profile with nothing set yet', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'user-1',
      displayName: null,
      city: null,
      avatarUrl: null,
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/profile').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'user-1', displayName: null, city: null, avatarUrl: null });
  });

  it('rejects a request with no Authorization header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/profile');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid access token', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'invalid', status: 401 } });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/profile')
      .set({ Authorization: 'Bearer garbage' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('PATCH /api/v1/profile', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    userUpsertMock.mockReset();
    userUpdateMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    userUpsertMock.mockResolvedValue({});
  });

  it('sets the display name and city', async () => {
    userUpdateMock.mockResolvedValue({
      id: 'user-1',
      displayName: 'Tendai',
      city: 'Harare',
      avatarUrl: null,
    });

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/profile')
      .set(AUTH_HEADER)
      .send({ displayName: 'Tendai', city: 'Harare' });

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('Tendai');
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { displayName: 'Tendai', city: 'Harare' },
    });
  });

  it('rejects a display name that is too long', async () => {
    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/profile')
      .set(AUTH_HEADER)
      .send({ displayName: 'x'.repeat(61) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(userUpdateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/profile/avatar', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    userUpsertMock.mockReset();
    userUpdateMock.mockReset();
    uploadAvatarMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    userUpsertMock.mockResolvedValue({});
  });

  it('uploads the image and saves the resulting URL', async () => {
    uploadAvatarMock.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/avatars/user-1.jpg' });
    userUpdateMock.mockResolvedValue({
      id: 'user-1',
      displayName: 'Tendai',
      city: null,
      avatarUrl: 'https://res.cloudinary.com/x/avatars/user-1.jpg',
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profile/avatar')
      .set(AUTH_HEADER)
      .attach('avatar', Buffer.from('fake-image-bytes'), { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.data.avatarUrl).toBe('https://res.cloudinary.com/x/avatars/user-1.jpg');
    expect(uploadAvatarMock).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', 'user-1');
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { avatarUrl: 'https://res.cloudinary.com/x/avatars/user-1.jpg' },
    });
  });

  it('rejects a request with no file attached', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/profile/avatar').set(AUTH_HEADER);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(uploadAvatarMock).not.toHaveBeenCalled();
  });

  it('returns 500 if the Cloudinary upload fails', async () => {
    uploadAvatarMock.mockRejectedValue(new Error('cloudinary unreachable'));

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profile/avatar')
      .set(AUTH_HEADER)
      .attach('avatar', Buffer.from('fake-image-bytes'), { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('AVATAR_UPLOAD_FAILED');
    expect(userUpdateMock).not.toHaveBeenCalled();
  });
});
