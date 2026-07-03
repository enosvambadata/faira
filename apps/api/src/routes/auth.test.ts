import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const createUserMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: (...args: unknown[]) => createUserMock(...args),
      },
    },
  },
}));

// Imported after the mock so the route picks up the mocked client.
const { createApp } = await import('../app');

describe('POST /api/v1/auth/signup', () => {
  beforeEach(() => {
    createUserMock.mockReset();
  });

  it('registers a user with email + password', async () => {
    createUserMock.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'buyer@example.com', phone: null } },
      error: null,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'buyer@example.com', password: 'longenough1' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      data: { id: 'user-1', email: 'buyer@example.com', phone: null },
    });
    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'buyer@example.com', password: 'longenough1' }),
    );
  });

  it('registers a user with phone only, no password required', async () => {
    createUserMock.mockResolvedValue({
      data: { user: { id: 'user-2', email: null, phone: '+263771234567' } },
      error: null,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ phone: '+263771234567' });

    expect(res.status).toBe(201);
    expect(res.body.data.phone).toBe('+263771234567');
  });

  it('rejects a password shorter than 8 characters', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'buyer@example.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('rejects when neither email nor phone is provided', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/auth/signup').send({ password: 'longenough1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects when both email and phone are provided', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'buyer@example.com', phone: '+263771234567', password: 'longenough1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 with a clear error for a duplicate email', async () => {
    createUserMock.mockResolvedValue({
      data: { user: null },
      error: {
        message: 'A user with this email address has already been registered',
        status: 422,
        code: 'email_exists',
      },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'buyer@example.com', password: 'longenough1' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'ACCOUNT_ALREADY_EXISTS',
        message: 'A user with this email address has already been registered',
        details: null,
      },
    });
  });

  it('returns 409 with a clear error for a duplicate phone', async () => {
    createUserMock.mockResolvedValue({
      data: { user: null },
      error: {
        message: 'Phone number already registered by another user',
        status: 422,
        code: 'phone_exists',
      },
    });

    const app = createApp();
    const res = await request(app).post('/api/v1/auth/signup').send({ phone: '+263771234567' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_ALREADY_EXISTS');
  });
});
