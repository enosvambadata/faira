import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin } from '../middleware/requireAdmin';
import { supabaseAdmin } from '../supabase';
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

router.get('/deletion-requests/due', requireAdmin, async (_req: Request, res: Response) => {
  const due = await prisma.accountDeletionRequest.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' },
    include: { user: { select: { id: true, displayName: true, city: true } } },
  });

  res.status(200).json({
    data: due.map(r => ({
      id: r.id,
      user: r.user,
      requestedAt: r.requestedAt,
      scheduledFor: r.scheduledFor,
    })),
  });
});

router.post('/deletion-requests/:id/process', requireAdmin, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  const request = await prisma.accountDeletionRequest.findUnique({ where: { id: req.params.id } });

  if (!request) {
    next(new ApiError('DELETION_REQUEST_NOT_FOUND', 'Deletion request not found', 404));
    return;
  }
  if (request.status !== 'PENDING') {
    next(new ApiError('VALIDATION_ERROR', 'Only a pending request can be processed', 400));
    return;
  }

  // Anonymizes our own data (the fields actually surfaced elsewhere in the
  // app — display name, avatar, city, push token) while leaving the user
  // row and everything that references it (listings, conversations,
  // messages) intact, so counterparties don't lose their own history.
  // Banning the Supabase auth user blocks them from logging back in as
  // this identity; there is no "permanent" ban_duration value, so a long
  // fixed duration (10 years) stands in for one.
  const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(request.userId, {
    ban_duration: '87600h',
  });

  if (banError) {
    next(new ApiError('ANONYMIZATION_FAILED', banError.message, banError.status ?? 500));
    return;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: request.userId },
      data: {
        displayName: 'Deleted User',
        avatarUrl: null,
        city: null,
        expoPushToken: null,
        pushNotificationsEnabled: false,
        emailNotificationsEnabled: false,
      },
    }),
    prisma.accountDeletionRequest.update({
      where: { id: request.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: { userId: request.userId, action: 'ACCOUNT_ANONYMIZED' },
    }),
  ]);

  res.status(200).json({ data: { id: request.id, status: 'PROCESSED' } });
});

export default router;
