import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const createUserMock = vi.fn();
const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const refreshSessionMock = vi.fn();
const updateUserByIdMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: (...args: unknown[]) => createUserMock(...args),
        updateUserById: (...args: unknown[]) => updateUserByIdMock(...args),
      },
    },
  },
  supabasePublic: {
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
      verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
      refreshSession: (...args: unknown[]) => refreshSessionMock(...args),
    },
  },
}));

const fakeSession = {
  access_token: 'access-token-1',
  refresh_token: 'refresh-token-1',
  expires_in: 900,
};

// Imported after the mock so the route picks up the mocked client.
const { createApp } = await import('../app');

describe('POST /api/v1/auth/signup', () => {
  beforeEach(() => {
    createUserMock.mockReset();
    signInWithOtpMock.mockReset();
    verifyOtpMock.mockReset();
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
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
    expect(res.body.data.otpSent).toBe(true);
    expect(signInWithOtpMock).toHaveBeenCalledWith({ phone: '+263771234567' });
  });

  it('still creates the account but reports otpSent: false if the OTP dispatch fails', async () => {
    createUserMock.mockResolvedValue({
      data: { user: { id: 'user-2', email: null, phone: '+263771234567' } },
      error: null,
    });
    signInWithOtpMock.mockResolvedValue({
      data: {},
      error: { message: 'SMS provider unavailable', status: 500 },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ phone: '+263771234567' });

    expect(res.status).toBe(201);
    expect(res.body.data.otpSent).toBe(false);
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

describe('POST /api/v1/auth/otp/resend', () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset();
  });

  it('resends an OTP for a valid phone number', async () => {
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/otp/resend')
      .send({ phone: '+263771234567' });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('OTP sent');
    expect(signInWithOtpMock).toHaveBeenCalledWith({ phone: '+263771234567' });
  });

  it('rejects an invalid phone number', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/auth/otp/resend').send({ phone: '0771234567' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it('returns 429 when Supabase reports the resend rate limit', async () => {
    signInWithOtpMock.mockResolvedValue({
      data: {},
      error: { message: 'For security purposes, you can only request this after 60 seconds', code: 'over_sms_send_rate_limit', status: 429 },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/otp/resend')
      .send({ phone: '+263771234567' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('POST /api/v1/auth/otp/verify', () => {
  beforeEach(() => {
    verifyOtpMock.mockReset();
  });

  it('verifies a correct OTP and returns a session', async () => {
    verifyOtpMock.mockResolvedValue({
      data: {
        session: fakeSession,
        user: { id: 'user-2', phone: '+263771234567', phone_confirmed_at: '2026-07-02T00:00:00Z' },
      },
      error: null,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+263771234567', token: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.data.phoneConfirmed).toBe(true);
    expect(res.body.data.accessToken).toBe('access-token-1');
    expect(res.body.data.refreshToken).toBe('refresh-token-1');
    expect(verifyOtpMock).toHaveBeenCalledWith({
      phone: '+263771234567',
      token: '123456',
      type: 'sms',
    });
  });

  it('rejects a malformed token', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+263771234567', token: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an incorrect or expired OTP', async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token has expired or is invalid', status: 400 },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+263771234567', token: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_OTP');
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => {
    signInWithPasswordMock.mockReset();
  });

  it('logs in with correct credentials and returns a session', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: fakeSession, user: { id: 'user-1', email: 'buyer@example.com', phone: null } },
      error: null,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'buyer@example.com', password: 'longenough1' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      accessToken: 'access-token-1',
      refreshToken: 'refresh-token-1',
      expiresIn: 900,
      user: { id: 'user-1', email: 'buyer@example.com', phone: null },
    });
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      password: 'longenough1',
    });
  });

  it('returns a generic 401 for a nonexistent account', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'longenough1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('returns the identical generic 401 for a wrong password on a real account', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'buyer@example.com', password: 'wrongpassword1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('rejects a malformed payload', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'longenough1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(() => {
    refreshSessionMock.mockReset();
  });

  it('rotates the refresh token and returns a new session', async () => {
    const rotatedSession = { ...fakeSession, access_token: 'access-token-2', refresh_token: 'refresh-token-2' };
    refreshSessionMock.mockResolvedValue({
      data: { session: rotatedSession, user: { id: 'user-1', email: 'buyer@example.com', phone: null } },
      error: null,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'refresh-token-1' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('access-token-2');
    expect(res.body.data.refreshToken).toBe('refresh-token-2');
    expect(refreshSessionMock).toHaveBeenCalledWith({ refresh_token: 'refresh-token-1' });
  });

  it('returns 401 for an invalid or reused refresh token', async () => {
    refreshSessionMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid Refresh Token', status: 401 },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'stale-token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects an empty refresh token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/password/reset-request', () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset();
  });

  it('sends a reset code for a phone number, without creating a new user', async () => {
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/password/reset-request')
      .send({ phone: '+263771234567' });

    expect(res.status).toBe(200);
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      phone: '+263771234567',
      options: { shouldCreateUser: false },
    });
  });

  it('returns the same generic response even if the phone has no account', async () => {
    signInWithOtpMock.mockResolvedValue({
      data: {},
      error: { message: 'Signups not allowed for otp', status: 422 },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/password/reset-request')
      .send({ phone: '+263779999999' });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('If this phone number has an account, a code was sent');
  });

  it('returns 429 when rate limited', async () => {
    signInWithOtpMock.mockResolvedValue({
      data: {},
      error: { message: 'rate limited', code: 'over_sms_send_rate_limit', status: 429 },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/password/reset-request')
      .send({ phone: '+263771234567' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('returns a clear NOT_SUPPORTED error for email requests', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/password/reset-request')
      .send({ email: 'buyer@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_SUPPORTED');
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it('rejects when neither email nor phone is provided', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/auth/password/reset-request').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/auth/password/reset-verify', () => {
  beforeEach(() => {
    verifyOtpMock.mockReset();
    updateUserByIdMock.mockReset();
  });

  it('verifies the code and sets the new password', async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: { id: 'user-1', phone: '+263771234567' } },
      error: null,
    });
    updateUserByIdMock.mockResolvedValue({ data: { user: {} }, error: null });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/password/reset-verify')
      .send({ phone: '+263771234567', token: '123456', newPassword: 'newlongenough1' });

    expect(res.status).toBe(200);
    expect(verifyOtpMock).toHaveBeenCalledWith({
      phone: '+263771234567',
      token: '123456',
      type: 'sms',
    });
    expect(updateUserByIdMock).toHaveBeenCalledWith('user-1', { password: 'newlongenough1' });
  });

  it('returns 400 for an incorrect or expired code', async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token has expired or is invalid', status: 400 },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/password/reset-verify')
      .send({ phone: '+263771234567', token: '000000', newPassword: 'newlongenough1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_OTP');
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it('rejects a new password shorter than 8 characters', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/password/reset-verify')
      .send({ phone: '+263771234567', token: '123456', newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });
});
