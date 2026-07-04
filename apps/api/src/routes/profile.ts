import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase';
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

interface ProfileMetadata {
  display_name?: string;
  city?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

function profileResponse(userId: string, metadata: ProfileMetadata) {
  return {
    id: userId,
    displayName: metadata.display_name || null,
    city: metadata.city || null,
    avatarUrl: metadata.avatar_url || null,
  };
}

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(req.userId!);

  if (error || !data.user) {
    next(new ApiError('PROFILE_NOT_FOUND', 'User not found', 404));
    return;
  }

  res.status(200).json({ data: profileResponse(data.user.id, data.user.user_metadata ?? {}) });
});

router.patch('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = updateProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid profile payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const { data: existing, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(req.userId!);

  if (fetchError || !existing.user) {
    next(new ApiError('PROFILE_NOT_FOUND', 'User not found', 404));
    return;
  }

  // admin.updateUserById replaces user_metadata wholesale, so merge by hand
  // to avoid clobbering fields (e.g. email_verified) we didn't touch here.
  const mergedMetadata: ProfileMetadata = {
    ...(existing.user.user_metadata as ProfileMetadata),
    ...parsed.data.displayName !== undefined && { display_name: parsed.data.displayName },
    ...parsed.data.city !== undefined && { city: parsed.data.city },
  };

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.userId!, {
    user_metadata: mergedMetadata,
  });

  if (error || !data.user) {
    next(new ApiError('PROFILE_UPDATE_FAILED', error?.message ?? 'Update failed', error?.status ?? 500));
    return;
  }

  res.status(200).json({ data: profileResponse(data.user.id, data.user.user_metadata ?? {}) });
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

    const { data: existing, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(req.userId!);

    if (fetchError || !existing.user) {
      next(new ApiError('PROFILE_NOT_FOUND', 'User not found', 404));
      return;
    }

    const mergedMetadata: ProfileMetadata = {
      ...(existing.user.user_metadata as ProfileMetadata),
      avatar_url: uploadResult.secure_url,
    };

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.userId!, {
      user_metadata: mergedMetadata,
    });

    if (error || !data.user) {
      next(new ApiError('PROFILE_UPDATE_FAILED', error?.message ?? 'Update failed', error?.status ?? 500));
      return;
    }

    res.status(200).json({ data: profileResponse(data.user.id, data.user.user_metadata ?? {}) });
  },
);

export default router;
