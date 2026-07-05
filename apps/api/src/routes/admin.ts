import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin } from '../middleware/requireAdmin';
import { ApiError } from '../errors/ApiError';

const router = Router();

const rejectSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

const statusQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

router.get('/verification', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = statusQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid status filter', 400, z.flattenError(parsed.error)));
    return;
  }

  const requests = await prisma.verificationRequest.findMany({
    where: { status: parsed.data.status ?? 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: { seller: { select: { id: true, displayName: true, city: true } } },
  });

  res.status(200).json({
    data: requests.map(r => ({
      id: r.id,
      seller: r.seller,
      idDocumentUrl: r.idDocumentUrl,
      selfieUrl: r.selfieUrl,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
    })),
  });
});

router.post('/verification/:id/approve', requireAdmin, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  const request = await prisma.verificationRequest.findUnique({ where: { id: req.params.id } });

  if (!request) {
    next(new ApiError('VERIFICATION_NOT_FOUND', 'Verification request not found', 404));
    return;
  }
  if (request.status !== 'PENDING') {
    next(new ApiError('VALIDATION_ERROR', 'Only a pending request can be approved', 400));
    return;
  }

  await prisma.$transaction([
    prisma.verificationRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', reviewedAt: new Date() },
    }),
    prisma.sellerProfile.upsert({
      where: { userId: request.sellerId },
      update: { isVerified: true },
      create: { userId: request.sellerId, isVerified: true },
    }),
  ]);

  res.status(200).json({ data: { id: request.id, status: 'APPROVED' } });
});

router.post('/verification/:id/reject', requireAdmin, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  const parsed = rejectSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid rejection payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const request = await prisma.verificationRequest.findUnique({ where: { id: req.params.id } });

  if (!request) {
    next(new ApiError('VERIFICATION_NOT_FOUND', 'Verification request not found', 404));
    return;
  }
  if (request.status !== 'PENDING') {
    next(new ApiError('VALIDATION_ERROR', 'Only a pending request can be rejected', 400));
    return;
  }

  await prisma.verificationRequest.update({
    where: { id: request.id },
    data: { status: 'REJECTED', reviewedAt: new Date(), rejectionReason: parsed.data.reason ?? null },
  });

  res.status(200).json({ data: { id: request.id, status: 'REJECTED' } });
});

export default router;
