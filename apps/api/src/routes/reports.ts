import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { ApiError } from '../errors/ApiError';
import { signReportEvidenceUpload } from '../lib/cloudinary';

const router = Router();

// MESSAGE reporting isn't built yet — the schema (SCRUM-70) anticipates it,
// but this ticket's acceptance criteria only calls for a report button on
// listing detail and seller profile.
const createReportSchema = z.object({
  targetType: z.enum(['LISTING', 'USER']),
  targetId: z.string().uuid(),
  reason: z.enum(['FAKE_ITEM', 'SCAM', 'INAPPROPRIATE', 'OTHER']),
  note: z.string().trim().max(1000).optional(),
  evidenceImageUrls: z.array(z.string().url()).max(6).optional(),
});

router.post('/upload-signature', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({ data: signReportEvidenceUpload() });
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createReportSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const { targetType, targetId, reason, note, evidenceImageUrls } = parsed.data;

  if (targetType === 'LISTING') {
    const listing = await prisma.listing.findUnique({ where: { id: targetId } });
    if (!listing || listing.deletedAt) {
      next(new ApiError('NOT_FOUND', 'Listing not found', 404));
      return;
    }
  } else {
    const user = await prisma.user.findUnique({ where: { id: targetId } });
    if (!user) {
      next(new ApiError('NOT_FOUND', 'User not found', 404));
      return;
    }
    if (targetId === req.userId) {
      next(new ApiError('VALIDATION_ERROR', 'You cannot report yourself', 400));
      return;
    }
  }

  const report = await prisma.report.create({
    data: {
      reporterId: req.userId!,
      targetType,
      targetId,
      reason,
      note: note ?? null,
      evidenceImageUrls: evidenceImageUrls ?? [],
    },
  });

  res.status(201).json({
    data: {
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      status: report.status,
      createdAt: report.createdAt,
    },
  });
});

export default router;
