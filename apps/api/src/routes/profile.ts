import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { uploadAvatar } from '../lib/cloudinary';
import { supabaseAdmin } from '../supabase';
import { ApiError } from '../errors/ApiError';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  city: z.string().min(1).max(60).optional(),
});

const pushTokenSchema = z.object({
  token: z.string().min(1),
});

const notificationPrefsSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
});

const passwordChangeSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

function profileResponse(user: {
  id: string;
  displayName: string | null;
  city: string | null;
  avatarUrl: string | null;
  pushNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
}) {
  return {
    id: user.id,
    displayName: user.displayName,
    city: user.city,
    avatarUrl: user.avatarUrl,
    pushNotificationsEnabled: user.pushNotificationsEnabled,
    emailNotificationsEnabled: user.emailNotificationsEnabled,
  };
}

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });

  if (!user) {
    next(new ApiError('PROFILE_NOT_FOUND', 'User not found', 404));
    return;
  }

  res.status(200).json({ data: profileResponse(user) });
});

router.patch('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = updateProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid profile payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: parsed.data,
  });

  res.status(200).json({ data: profileResponse(user) });
});

router.patch('/notifications', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = notificationPrefsSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid notification preferences payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: {
      ...(parsed.data.pushEnabled !== undefined && { pushNotificationsEnabled: parsed.data.pushEnabled }),
      ...(parsed.data.emailEnabled !== undefined && { emailNotificationsEnabled: parsed.data.emailEnabled }),
    },
  });

  res.status(200).json({ data: profileResponse(user) });
});

router.patch('/password', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = passwordChangeSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid password payload', 400, z.flattenError(parsed.error)));
    return;
  }

  // Updating via the admin API (rather than requiring the current password
  // and calling signInWithPassword) also invalidates the user's other
  // refresh tokens as a side effect — consistent with the existing
  // password-reset flow in auth.ts, and reasonable here since requireAuth
  // already establishes the caller holds a currently-valid session.
  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.userId!, {
    password: parsed.data.newPassword,
  });

  if (error) {
    next(new ApiError('PASSWORD_CHANGE_FAILED', error.message, error.status ?? 500));
    return;
  }

  res.status(200).json({ data: { message: 'Password updated successfully' } });
});

router.post('/push-token', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = pushTokenSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid push token payload', 400, z.flattenError(parsed.error)));
    return;
  }

  await prisma.user.update({
    where: { id: req.userId! },
    data: { expoPushToken: parsed.data.token },
  });

  res.status(200).json({ data: { registered: true } });
});

router.post(
  '/avatar',
  requireAuth,
  upload.single('avatar'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.file) {
      next(new ApiError('VALIDATION_ERROR', 'No image file provided under the "avatar" field', 400));
      return;
    }

    let uploadResult;
    try {
      uploadResult = await uploadAvatar(req.file.buffer, req.file.mimetype, req.userId!);
    } catch (err) {
      next(new ApiError('AVATAR_UPLOAD_FAILED', (err as Error).message, 500));
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: { avatarUrl: uploadResult.secure_url },
    });

    res.status(200).json({ data: profileResponse(user) });
  },
);

export default router;
