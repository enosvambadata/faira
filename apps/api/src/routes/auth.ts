import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase';
import { ApiError } from '../errors/ApiError';

const signupSchema = z
  .object({
    email: z.email().optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format, e.g. +263771234567')
      .optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  })
  .refine(data => Boolean(data.email) !== Boolean(data.phone), {
    message: 'Provide exactly one of email or phone',
  })
  .refine(data => !data.email || Boolean(data.password), {
    message: 'Password is required when signing up with email',
    path: ['password'],
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

  res.status(201).json({
    data: {
      id: data.user.id,
      email: data.user.email || null,
      phone: data.user.phone || null,
    },
  });
});

export default router;
