import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { signVerificationUpload } from '../lib/cloudinary';
import { ApiError } from '../errors/ApiError';

const router = Router();

const submitSchema = z.object({
  idDocumentUrl: z.string().url(),
  selfieUrl: z.string().url(),
});

function verificationResponse(v: {
  id: string;
  status: string;
  rejectionReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}) {
  return {
    id: v.id,
    status: v.status,
    rejectionReason: v.rejectionReason,
    createdAt: v.createdAt,
    reviewedAt: v.reviewedAt,
  };
}

router.post('/upload-signature', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({ data: signVerificationUpload() });
});

router.get('/mine', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const latest = await prisma.verificationRequest.findFirst({
    where: { sellerId: req.userId! },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({ data: latest ? verificationResponse(latest) : null });
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = submitSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid verification submission', 400, z.flattenError(parsed.error)));
    return;
  }

  const latest = await prisma.verificationRequest.findFirst({
    where: { sellerId: req.userId! },
    orderBy: { createdAt: 'desc' },
  });

  if (latest?.status === 'PENDING') {
    next(new ApiError('VERIFICATION_ALREADY_PENDING', 'You already have a verification request awaiting review', 400));
    return;
  }
  if (latest?.status === 'APPROVED') {
    next(new ApiError('VERIFICATION_ALREADY_APPROVED', 'You are already verified', 400));
    return;
  }

  const created = await prisma.verificationRequest.create({
    data: {
      sellerId: req.userId!,
      idDocumentUrl: parsed.data.idDocumentUrl,
      selfieUrl: parsed.data.selfieUrl,
    },
  });

  res.status(201).json({ data: verificationResponse(created) });
});

export default router;
