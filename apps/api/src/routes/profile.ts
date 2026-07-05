import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { uploadAvatar } from '../lib/cloudinary';
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

function profileResponse(user: { id: string; displayName: string | null; city: string | null; avatarUrl: string | null }) {
  return {
    id: user.id,
    displayName: user.displayName,
    city: user.city,
    avatarUrl: user.avatarUrl,
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
