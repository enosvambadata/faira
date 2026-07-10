import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin } from '../middleware/requireAdmin';
import { supabaseAdmin } from '../supabase';
import { ApiError } from '../errors/ApiError';
import { sendPushNotification } from '../lib/push';
import { releaseEscrowFunds, splitCommission } from '../services/escrowRelease';

const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

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

// Same "list what's due, then act on it" shape as the deletion-request
// endpoints above — there's no in-process scheduler (see requireAdmin's
// comment: no admin dashboard/worker exists yet), so something external
// (a human, or a cron pinger once one exists) is expected to poll these.
router.get('/orders/delivery-reminders-due', requireAdmin, async (_req: Request, res: Response) => {
  const orders = await prisma.order.findMany({
    where: {
      status: 'PAID',
      payments: { some: { status: 'CONFIRMED' } },
      // An open dispute pauses the whole delivery-confirmation clock — a
      // "please confirm delivery" nudge would be confusing once the buyer
      // has already flagged a problem (SCRUM-57).
      disputes: { none: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } },
    },
    include: {
      listing: { select: { title: true } },
      payments: { where: { status: 'CONFIRMED' }, orderBy: { confirmedAt: 'desc' }, take: 1 },
    },
  });

  const now = Date.now();
  const due = orders
    .map(order => {
      const confirmedAt = order.payments[0]?.confirmedAt;
      if (!confirmedAt) return null;

      const daysSincePaid = (now - confirmedAt.getTime()) / DAY_MS;
      let reminderDay: 3 | 4 | null = null;
      if (daysSincePaid >= 4 && !order.deliveryReminderDay4SentAt) reminderDay = 4;
      else if (daysSincePaid >= 3 && !order.deliveryReminderDay3SentAt) reminderDay = 3;
      if (!reminderDay) return null;

      return {
        id: order.id,
        listingTitle: order.listing.title,
        buyerId: order.buyerId,
        reminderDay,
        daysSincePaid: Math.floor(daysSincePaid),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  res.status(200).json({ data: due });
});

const sendReminderSchema = z.object({
  reminderDay: z.union([z.literal(3), z.literal(4)]),
});

router.post(
  '/orders/:id/send-delivery-reminder',
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = sendReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        listing: { select: { title: true } },
        buyer: { select: { expoPushToken: true, pushNotificationsEnabled: true } },
      },
    });

    if (!order) {
      next(new ApiError('NOT_FOUND', 'Order not found', 404));
      return;
    }
    if (order.status !== 'PAID') {
      next(new ApiError('INVALID_STATE', 'Order is not awaiting delivery confirmation', 409));
      return;
    }

    const { reminderDay } = parsed.data;
    const alreadySent = reminderDay === 3 ? order.deliveryReminderDay3SentAt : order.deliveryReminderDay4SentAt;
    if (alreadySent) {
      next(new ApiError('INVALID_STATE', 'This reminder was already sent', 409));
      return;
    }

    if (order.buyer.pushNotificationsEnabled && order.buyer.expoPushToken) {
      await sendPushNotification({
        to: order.buyer.expoPushToken,
        title: 'Confirm your delivery',
        body: `Have you received "${order.listing.title}"? Confirm delivery, or the seller is paid automatically soon.`,
        data: { orderId: order.id },
      });
    }

    await prisma.order.update({
      where: { id: order.id },
      data:
        reminderDay === 3 ? { deliveryReminderDay3SentAt: new Date() } : { deliveryReminderDay4SentAt: new Date() },
    });

    res.status(200).json({ data: { id: order.id, reminderDay } });
  },
);

router.get('/orders/auto-release-due', requireAdmin, async (_req: Request, res: Response) => {
  const orders = await prisma.order.findMany({
    where: {
      status: 'PAID',
      payments: { some: { status: 'CONFIRMED' } },
      // Same dispute pause as delivery-reminders-due — releaseEscrowFunds
      // would refuse anyway, but filtering here keeps this list honest
      // about what's actually actionable (SCRUM-57).
      disputes: { none: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } },
    },
    include: { payments: { where: { status: 'CONFIRMED' }, orderBy: { confirmedAt: 'desc' }, take: 1 } },
  });

  const now = Date.now();
  const due = orders.filter(order => {
    const confirmedAt = order.payments[0]?.confirmedAt;
    return confirmedAt !== undefined && confirmedAt !== null && now - confirmedAt.getTime() >= 5 * DAY_MS;
  });

  res.status(200).json({ data: due.map(order => ({ id: order.id, buyerId: order.buyerId })) });
});

router.post(
  '/orders/:id/auto-release',
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const { released, order } = await releaseEscrowFunds(req.params.id);

    if (!order) {
      next(new ApiError('NOT_FOUND', 'Order not found', 404));
      return;
    }
    if (!released) {
      next(new ApiError('INVALID_STATE', 'Order is not eligible for auto-release', 409));
      return;
    }

    res.status(200).json({ data: { id: order.id, status: 'DELIVERED' } });
  },
);

router.get('/disputes', requireAdmin, async (_req: Request, res: Response) => {
  const disputes = await prisma.paymentDispute.findMany({
    where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } },
    orderBy: { createdAt: 'asc' },
    include: {
      order: { select: { id: true, priceAtPurchase: true, status: true, listing: { select: { title: true, sellerId: true } } } },
      raisedBy: { select: { id: true, displayName: true } },
    },
  });

  res.status(200).json({
    data: disputes.map(d => ({
      id: d.id,
      orderId: d.orderId,
      reason: d.reason,
      evidenceImageUrls: d.evidenceImageUrls,
      status: d.status,
      createdAt: d.createdAt,
      buyer: d.raisedBy,
      sellerId: d.order.listing.sellerId,
      listingTitle: d.order.listing.title,
      priceAtPurchase: d.order.priceAtPurchase.toString(),
    })),
  });
});

const resolveDisputeSchema = z.object({
  refundAmount: z.number().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional(),
});

router.post(
  '/disputes/:id/resolve',
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = resolveDisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const dispute = await prisma.paymentDispute.findUnique({
      where: { id: req.params.id },
      include: { order: { include: { listing: true } } },
    });

    if (!dispute) {
      next(new ApiError('NOT_FOUND', 'Dispute not found', 404));
      return;
    }
    if (dispute.status !== 'OPEN' && dispute.status !== 'UNDER_REVIEW') {
      next(new ApiError('INVALID_STATE', 'This dispute has already been resolved', 409));
      return;
    }

    const order = dispute.order;
    const orderAmount = Number(order.priceAtPurchase);
    const refundAmount = parsed.data.refundAmount ?? 0;

    if (refundAmount > orderAmount) {
      next(new ApiError('VALIDATION_ERROR', 'refundAmount cannot exceed the order price', 400));
      return;
    }
    if (order.status !== 'PAID' && order.status !== 'SHIPPED') {
      next(new ApiError('INVALID_STATE', 'Order is no longer eligible for dispute resolution', 409));
      return;
    }

    // A refund of any size (full or partial) means the sale didn't
    // complete normally — CANCELLED. A rejected dispute (no refund) is a
    // normal completed sale, same as an undisputed delivery.
    const newOrderStatus = refundAmount > 0 ? 'CANCELLED' : 'DELIVERED';

    const { count } = await prisma.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: newOrderStatus },
    });
    if (count === 0) {
      next(new ApiError('INVALID_STATE', 'Order changed state before this resolution could be applied', 409));
      return;
    }

    const remainder = orderAmount - refundAmount;
    const ledgerWrites = [];

    if (refundAmount > 0) {
      ledgerWrites.push(
        prisma.escrowLedgerEntry.create({
          data: { orderId: order.id, sellerId: order.listing.sellerId, type: 'REFUND', amount: refundAmount },
        }),
      );
    }
    if (remainder > 0) {
      const { sellerAmount, commissionAmount } = splitCommission(remainder);
      ledgerWrites.push(
        prisma.escrowLedgerEntry.create({
          data: { orderId: order.id, sellerId: order.listing.sellerId, type: 'RELEASE', amount: sellerAmount },
        }),
        prisma.escrowLedgerEntry.create({
          data: { orderId: order.id, sellerId: order.listing.sellerId, type: 'COMMISSION', amount: commissionAmount },
        }),
      );
    }

    const resolvedStatus = refundAmount > 0 ? 'RESOLVED_BUYER' : 'RESOLVED_SELLER';
    ledgerWrites.push(
      prisma.paymentDispute.update({
        where: { id: dispute.id },
        data: { status: resolvedStatus, resolutionNotes: parsed.data.notes ?? null, resolvedAt: new Date() },
      }),
    );

    await prisma.$transaction(ledgerWrites);

    res.status(200).json({
      data: { id: dispute.id, status: resolvedStatus, refundAmount, orderStatus: newOrderStatus },
    });
  },
);

export default router;
