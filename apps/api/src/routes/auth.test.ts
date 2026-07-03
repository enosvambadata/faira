import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const createUserMock = vi.fn();
const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: (...args: unknown[]) => createUserMock(...args),
      },
    },
  },
  supabasePublic: {
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
      verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
    },
  },
}));

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

  it('verifies a correct OTP', async () => {
    verifyOtpMock.mockResolvedValue({
      data: {
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
