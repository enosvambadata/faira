import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin, supabasePublic } from '../supabase';
import { ApiError } from '../errors/ApiError';
import { logger } from '../logger';

export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format, e.g. +263771234567');

const signupSchema = z
  .object({
    email: z.email().optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').optional(),
    // Where the confirmation link returns after the user clicks it. Supabase
    // enforces this against the project's Redirect URLs allowlist, so an
    // arbitrary value can't be used to redirect elsewhere.
    redirectTo: z.string().url().optional(),
  })
  .refine(data => Boolean(data.email) !== Boolean(data.phone), {
    message: 'Provide exactly one of email or phone',
  })
  .refine(data => !data.email || Boolean(data.password), {
    message: 'Password is required when signing up with email',
    path: ['password'],
  });

const otpResendSchema = z.object({ phone: phoneSchema });

const otpVerifySchema = z.object({
  phone: phoneSchema,
  token: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const passwordResetRequestSchema = z
  .object({
    email: z.email().optional(),
    phone: phoneSchema.optional(),
  })
  .refine(data => Boolean(data.email) !== Boolean(data.phone), {
    message: 'Provide exactly one of email or phone',
  });

const passwordResetVerifySchema = z.object({
  phone: phoneSchema,
  token: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const router = Router();

function sessionResponse(session: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email?: string | null; phone?: string | null };
}) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    user: {
      id: session.user.id,
      email: session.user.email || null,
      phone: session.user.phone || null,
    },
  };
}

router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = signupSchema.safeParse(req.body);

  if (!parsed.success) {
    next(
      new ApiError('VALIDATION_ERROR', 'Invalid signup payload', 400, z.flattenError(parsed.error)),
    );
    return;
  }

  const { email, phone, password, redirectTo } = parsed.data;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    phone,
    password,
    // Email ownership is proven via a confirmation link before the account
    // can log in -- creating it auto-confirmed is exactly the hole that lets
    // a bot mass-register fake companies. Requires "Confirm email" enabled on
    // the Supabase project (see docs/collect-uk/email-verification.md).
    // Phone stays OTP-verified via signInWithOtp below (SCRUM-24).
    email_confirm: false,
    phone_confirm: false,
  });

  if (error) {
    if (error.code === 'email_exists' || error.code === 'phone_exists') {
      next(new ApiError('ACCOUNT_ALREADY_EXISTS', error.message, 409));
      return;
    }
    next(new ApiError('SIGNUP_FAILED', error.message, error.status ?? 500));
    return;
  }

  let otpSent = true;
  if (phone) {
    const { error: otpError } = await supabasePublic.auth.signInWithOtp({ phone });
    if (otpError) {
      otpSent = false;
      logger.error({ err: otpError }, 'Failed to send initial signup OTP');
    }
  }

  // Best-effort, mirroring the OTP path: a mail outage must not fail the
  // signup -- the account exists and the user can resend from the
  // "check your inbox" screen.
  let confirmationEmailSent = true;
  if (email) {
    const { error: mailError } = await supabasePublic.auth.resend({
      type: 'signup',
      email,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
    if (mailError) {
      confirmationEmailSent = false;
      logger.error({ err: mailError }, 'Failed to send signup confirmation email');
    }
  }

  res.status(201).json({
    data: {
      id: data.user.id,
      email: data.user.email || null,
      phone: data.user.phone || null,
      otpSent: phone ? otpSent : undefined,
      confirmationEmailSent: email ? confirmationEmailSent : undefined,
    },
  });
});

const emailResendSchema = z.object({ email: z.email(), redirectTo: z.string().url().optional() });

// Resend the signup confirmation link. Always 200 (even when Supabase reports
// the address is unknown or already confirmed) so the endpoint can't be used
// to enumerate which emails are registered.
router.post('/email/resend', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = emailResendSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid resend payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const { error } = await supabasePublic.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: parsed.data.redirectTo ? { emailRedirectTo: parsed.data.redirectTo } : undefined,
  });
  if (error) {
    logger.warn({ err: error }, 'Confirmation email resend reported an error');
  }

  res.status(200).json({ data: { message: 'Confirmation email sent' } });
});

router.post('/otp/resend', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = otpResendSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid resend payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const { error } = await supabasePublic.auth.signInWithOtp({ phone: parsed.data.phone });

  if (error) {
    if (error.code === 'over_sms_send_rate_limit') {
      next(new ApiError('RATE_LIMITED', 'Please wait before requesting another code', 429));
      return;
    }
    next(new ApiError('OTP_RESEND_FAILED', error.message, error.status ?? 500));
    return;
  }

  res.status(200).json({ data: { message: 'OTP sent' } });
});

router.post('/otp/verify', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = otpVerifySchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid verify payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const { phone, token } = parsed.data;
  const { data, error } = await supabasePublic.auth.verifyOtp({ phone, token, type: 'sms' });

  if (error) {
    next(new ApiError('INVALID_OTP', error.message, 400));
    return;
  }

  if (!data.session || !data.user) {
    next(new ApiError('OTP_VERIFY_FAILED', 'Verification succeeded but no session was returned', 500));
    return;
  }

  res.status(200).json({
    data: {
      ...sessionResponse({ ...data.session, user: data.user }),
      phoneConfirmed: Boolean(data.user.phone_confirmed_at),
    },
  });
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid login payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const { email, password } = parsed.data;
  const { data, error } = await supabasePublic.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    next(new ApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401));
    return;
  }

  res.status(200).json({ data: sessionResponse({ ...data.session, user: data.user }) });
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = refreshSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid refresh payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const { data, error } = await supabasePublic.auth.refreshSession({
    refresh_token: parsed.data.refreshToken,
  });

  if (error || !data.session || !data.user) {
    next(new ApiError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired', 401));
    return;
  }

  res.status(200).json({ data: sessionResponse({ ...data.session, user: data.user }) });
});

router.post('/password/reset-request', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    next(
      new ApiError(
        'VALIDATION_ERROR',
        'Invalid password reset request payload',
        400,
        z.flattenError(parsed.error),
      ),
    );
    return;
  }

  const { email, phone } = parsed.data;

  if (email) {
    // Supabase's Free tier can't send a short code by email (see reset-verify
    // for the phone flow); email-based reset needs deep-linking or custom
    // SMTP first. Tracked as a follow-up, not built yet.
    next(
      new ApiError(
        'NOT_SUPPORTED',
        'Password reset via email is not supported yet — use your phone number instead',
        400,
      ),
    );
    return;
  }

  const { error } = await supabasePublic.auth.signInWithOtp({
    phone: phone!,
    options: { shouldCreateUser: false },
  });

  if (error && error.code === 'over_sms_send_rate_limit') {
    next(new ApiError('RATE_LIMITED', 'Please wait before requesting another code', 429));
    return;
  }

  // Generic response either way — don't reveal whether the phone number
  // has an account (error is otherwise swallowed; e.g. "user not found").
  res.status(200).json({ data: { message: 'If this phone number has an account, a code was sent' } });
});

router.post('/password/reset-verify', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = passwordResetVerifySchema.safeParse(req.body);

  if (!parsed.success) {
    next(
      new ApiError(
        'VALIDATION_ERROR',
        'Invalid password reset verify payload',
        400,
        z.flattenError(parsed.error),
      ),
    );
    return;
  }

  const { phone, token, newPassword } = parsed.data;
  const { data, error } = await supabasePublic.auth.verifyOtp({ phone, token, type: 'sms' });

  if (error || !data.user) {
    next(new ApiError('INVALID_OTP', 'Code is invalid or expired', 400));
    return;
  }

  // Updating the password via the admin API kills the user's other
  // sessions/refresh tokens as a side effect, satisfying "old sessions
  // invalidated after password reset" without an extra sign-out call.
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
    password: newPassword,
  });

  if (updateError) {
    next(new ApiError('PASSWORD_RESET_FAILED', updateError.message, updateError.status ?? 500));
    return;
  }

  res.status(200).json({ data: { message: 'Password reset successfully' } });
});

export default router;
