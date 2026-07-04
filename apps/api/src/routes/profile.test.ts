import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUserMock = vi.fn();
const getUserByIdMock = vi.fn();
const updateUserByIdMock = vi.fn();
const uploadAvatarMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
      admin: {
        getUserById: (...args: unknown[]) => getUserByIdMock(...args),
        updateUserById: (...args: unknown[]) => updateUserByIdMock(...args),
      },
    },
  },
  supabasePublic: {
    auth: {},
  },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { upsert: vi.fn().mockResolvedValue({}) },
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
    getUserByIdMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('returns the current user profile', async () => {
    getUserByIdMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          user_metadata: { display_name: 'Tendai', city: 'Harare', avatar_url: 'https://cdn/x.jpg' },
        },
      },
      error: null,
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

  it('returns nulls for a profile with no metadata set yet', async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { id: 'user-1', user_metadata: {} } },
      error: null,
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
    expect(getUserByIdMock).not.toHaveBeenCalled();
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
    getUserByIdMock.mockReset();
    updateUserByIdMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('sets the display name and city, merging with existing metadata', async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { id: 'user-1', user_metadata: { email_verified: true } } },
      error: null,
    });
    updateUserByIdMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          user_metadata: { email_verified: true, display_name: 'Tendai', city: 'Harare' },
        },
      },
      error: null,
    });

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/profile')
      .set(AUTH_HEADER)
      .send({ displayName: 'Tendai', city: 'Harare' });

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('Tendai');
    expect(updateUserByIdMock).toHaveBeenCalledWith('user-1', {
      user_metadata: { email_verified: true, display_name: 'Tendai', city: 'Harare' },
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
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/profile/avatar', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getUserByIdMock.mockReset();
    updateUserByIdMock.mockReset();
    uploadAvatarMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('uploads the image and saves the resulting URL', async () => {
    uploadAvatarMock.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/avatars/user-1.jpg' });
    getUserByIdMock.mockResolvedValue({
      data: { user: { id: 'user-1', user_metadata: { display_name: 'Tendai' } } },
      error: null,
    });
    updateUserByIdMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          user_metadata: {
            display_name: 'Tendai',
            avatar_url: 'https://res.cloudinary.com/x/avatars/user-1.jpg',
          },
        },
      },
      error: null,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profile/avatar')
      .set(AUTH_HEADER)
      .attach('avatar', Buffer.from('fake-image-bytes'), { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.data.avatarUrl).toBe('https://res.cloudinary.com/x/avatars/user-1.jpg');
    expect(uploadAvatarMock).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', 'user-1');
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
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });
});
