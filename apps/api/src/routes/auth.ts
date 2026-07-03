import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin, supabasePublic } from '../supabase';
import { ApiError } from '../errors/ApiError';
import { logger } from '../logger';

const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format, e.g. +263771234567');

const signupSchema = z
  .object({
    email: z.email().optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').optional(),
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

const router = Router();

router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = signupSchema.safeParse(req.body);

  if (!parsed.success) {
    next(
      new ApiError('VALIDATION_ERROR', 'Invalid signup payload', 400, z.flattenError(parsed.error)),
    );
    return;
  }

  const { email, phone, password } = parsed.data;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    phone,
    password,
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

  res.status(201).json({
    data: {
      id: data.user.id,
      email: data.user.email || null,
      phone: data.user.phone || null,
      otpSent: phone ? otpSent : undefined,
    },
  });
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

  res.status(200).json({
    data: {
      id: data.user?.id,
      phone: data.user?.phone || null,
      phoneConfirmed: Boolean(data.user?.phone_confirmed_at),
    },
  });
});

export default router;
