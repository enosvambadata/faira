import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin } from '../middleware/requireAdmin';
import { supabaseAdmin } from '../supabase';
import { ApiError } from '../errors/ApiError';
import { releaseEscrowFunds, splitCommission } from '../services/escrowRelease';
import { notifyOrderStatusChange } from '../services/orderNotifications';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { getParcelEvidenceViewUrl } from '../lib/cloudinary';
import {
  countPurgeableRawMessages,
  purgeExpiredMessageRawBodies,
  RAW_MESSAGE_RETENTION_DAYS,
} from '../services/messageRetention';
import { runAutoReleaseSweep, runAutoRefundSweep } from '../services/escrowSweeps';

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

// Escrow timer sweeps (SCRUM-258). No in-process scheduler exists (see
// requireAdmin's comment), so an external cron pings these two endpoints; each
// runs its grace reminders and then actions what's due. Sweep A releases a
// SHIPPED order the buyer never confirmed; Sweep B refunds a PAID order the
// seller never shipped — opposite money directions, both re-checking state
// atomically at fire time (see services/escrowSweeps).
router.post('/orders/sweep-auto-release', requireAdmin, async (_req: Request, res: Response) => {
  const result = await runAutoReleaseSweep();
  res.status(200).json({ data: result });
});

router.post('/orders/sweep-auto-refund', requireAdmin, async (_req: Request, res: Response) => {
  const result = await runAutoRefundSweep();
  res.status(200).json({ data: result });
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

    res.status(200).json({ data: { id: order.id, status: 'COMPLETED' } });
  },
);

// Dispute/audit access to the ORIGINAL (pre-redaction) message text. Buyers and
// sellers only ever see the redacted `body`; admins can read `bodyRaw` here to
// adjudicate a dispute, until it's purged after the retention window.
router.get(
  '/conversations/:id/messages/raw',
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!conversation) {
      next(new ApiError('NOT_FOUND', 'Conversation not found', 404));
      return;
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        senderId: true,
        body: true,
        bodyRaw: true,
        containedContactInfo: true,
        imageUrl: true,
        createdAt: true,
      },
    });

    res.status(200).json({
      data: messages.map(m => ({
        id: m.id,
        senderId: m.senderId,
        body: m.body,
        // bodyRaw is null once purged, or when it equals body (nothing redacted);
        // fall back to the redacted body so the timeline is never blank.
        bodyRaw: m.bodyRaw ?? m.body,
        containedContactInfo: m.containedContactInfo,
        imageUrl: m.imageUrl,
        createdAt: m.createdAt,
      })),
    });
  },
);

// Retention purge for raw message text. Follows the same "no in-process
// scheduler" pattern as the order endpoints above — an external cron pings the
// GET to see how much is due, then the POST to purge.
router.get('/messages/raw-purge-due', requireAdmin, async (_req: Request, res: Response) => {
  const count = await countPurgeableRawMessages();
  res.status(200).json({ data: { count, retentionDays: RAW_MESSAGE_RETENTION_DAYS } });
});

router.post('/messages/purge-raw', requireAdmin, async (_req: Request, res: Response) => {
  const purged = await purgeExpiredMessageRawBodies();
  res.status(200).json({ data: { purged, retentionDays: RAW_MESSAGE_RETENTION_DAYS } });
});

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
    // Raising a dispute already transitioned the order to DISPUTED
    // (SCRUM-60) — resolving it is the only way out of that state.
    if (order.status !== 'DISPUTED') {
      next(new ApiError('INVALID_STATE', 'Order is no longer eligible for dispute resolution', 409));
      return;
    }

    // A refund of any size (full or partial) means the sale didn't
    // complete normally — REFUNDED. A rejected dispute (no refund) is a
    // normal completed sale, same as an undisputed delivery.
    const newOrderStatus = refundAmount > 0 ? 'REFUNDED' : 'COMPLETED';

    const remainder = orderAmount - refundAmount;
    const resolvedStatus = refundAmount > 0 ? 'RESOLVED_BUYER' : 'RESOLVED_SELLER';

    // The order status flip, the escrow ledger entries, and the dispute update
    // must all commit together -- a crash between a standalone status update and
    // a separate ledger write would settle the order while leaving the dispute
    // OPEN and the refund/release unrecorded, with the status guard blocking any
    // retry. count===0 means the order changed under us.
    const applied = await prisma.$transaction(async tx => {
      const { count } = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: newOrderStatus },
      });
      if (count === 0) return false;

      if (refundAmount > 0) {
        await tx.escrowLedgerEntry.create({
          data: { orderId: order.id, sellerId: order.listing.sellerId, type: 'REFUND', amount: refundAmount },
        });
      }
      if (remainder > 0) {
        const { sellerAmount, commissionAmount } = splitCommission(remainder);
        await tx.escrowLedgerEntry.create({
          data: { orderId: order.id, sellerId: order.listing.sellerId, type: 'RELEASE', amount: sellerAmount },
        });
        await tx.escrowLedgerEntry.create({
          data: { orderId: order.id, sellerId: order.listing.sellerId, type: 'COMMISSION', amount: commissionAmount },
        });
      }
      await tx.paymentDispute.update({
        where: { id: dispute.id },
        data: { status: resolvedStatus, resolutionNotes: parsed.data.notes ?? null, resolvedAt: new Date() },
      });
      return true;
    });

    if (!applied) {
      next(new ApiError('INVALID_STATE', 'Order changed state before this resolution could be applied', 409));
      return;
    }

    await notifyOrderStatusChange(order.id, newOrderStatus);

    res.status(200).json({
      data: { id: dispute.id, status: resolvedStatus, refundAmount, orderStatus: newOrderStatus },
    });
  },
);

// "Processed via Paynow or manual bank transfer" (SCRUM-58) means this app
// only needs to log and track the request — the actual disbursement
// happens outside it (a manual EcoCash/bank transfer, or a Paynow payout
// call once real Paynow credentials exist, see the payments blocker noted
// elsewhere). These two endpoints just record the outcome.
router.get('/payout-requests', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const statusSchema = z.object({ status: z.enum(['PENDING', 'PROCESSING', 'PAID', 'FAILED']).optional() });
  const parsed = statusSchema.safeParse(req.query);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid status filter', 400, z.flattenError(parsed.error)));
    return;
  }

  const requests = await prisma.payoutRequest.findMany({
    where: { status: parsed.data.status ?? 'PENDING' },
    orderBy: { requestedAt: 'asc' },
    include: { seller: { select: { id: true, displayName: true } } },
  });

  res.status(200).json({
    data: requests.map(r => ({
      id: r.id,
      seller: r.seller,
      amount: r.amount.toString(),
      payoutMethodDetails: r.payoutMethodDetails,
      status: r.status,
      requestedAt: r.requestedAt,
    })),
  });
});

router.post(
  '/payout-requests/:id/mark-paid',
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const request = await prisma.payoutRequest.findUnique({ where: { id: req.params.id } });
    if (!request) {
      next(new ApiError('NOT_FOUND', 'Payout request not found', 404));
      return;
    }
    if (request.status !== 'PENDING' && request.status !== 'PROCESSING') {
      next(new ApiError('INVALID_STATE', 'This payout request has already been resolved', 409));
      return;
    }

    await prisma.payoutRequest.update({
      where: { id: request.id },
      data: { status: 'PAID', processedAt: new Date() },
    });

    res.status(200).json({ data: { id: request.id, status: 'PAID' } });
  },
);

router.post(
  '/payout-requests/:id/mark-failed',
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const request = await prisma.payoutRequest.findUnique({ where: { id: req.params.id } });
    if (!request) {
      next(new ApiError('NOT_FOUND', 'Payout request not found', 404));
      return;
    }
    if (request.status !== 'PENDING' && request.status !== 'PROCESSING') {
      next(new ApiError('INVALID_STATE', 'This payout request has already been resolved', 409));
      return;
    }

    // A failed payout must give the reserved amount back — otherwise the
    // seller's available balance would be permanently short by the failed
    // amount even though they never actually got paid.
    await prisma.$transaction([
      prisma.payoutRequest.update({
        where: { id: request.id },
        data: { status: 'FAILED', processedAt: new Date() },
      }),
      prisma.escrowLedgerEntry.create({
        data: { sellerId: request.sellerId, type: 'RELEASE', amount: request.amount, payoutRequestId: request.id },
      }),
    ]);

    res.status(200).json({ data: { id: request.id, status: 'FAILED' } });
  },
);

// Delivery fee rates (SCRUM-64) — configurable by city/weight tier, no
// admin dashboard exists so this is the only way to adjust them. A
// missing (city, weightTier) combo just falls back to a hardcoded
// default at quote time (see deliveryFee.ts) rather than blocking
// checkout, so there's no strict requirement to cover every combination.
router.get('/delivery-fee-rates', requireAdmin, async (_req: Request, res: Response) => {
  const rates = await prisma.deliveryFeeRate.findMany({
    orderBy: [{ city: 'asc' }, { weightTier: 'asc' }],
  });

  res.status(200).json({
    data: rates.map(r => ({ id: r.id, city: r.city, weightTier: r.weightTier, fee: r.fee.toString() })),
  });
});

const upsertDeliveryFeeRateSchema = z.object({
  city: z.string().trim().min(1),
  weightTier: z.enum(['LIGHT', 'MEDIUM', 'HEAVY']),
  fee: z.number().nonnegative(),
});

router.put('/delivery-fee-rates', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = upsertDeliveryFeeRateSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const { city, weightTier, fee } = parsed.data;
  const rate = await prisma.deliveryFeeRate.upsert({
    where: { city_weightTier: { city, weightTier } },
    update: { fee },
    create: { city, weightTier, fee },
  });

  res.status(200).json({ data: { id: rate.id, city: rate.city, weightTier: rate.weightTier, fee: rate.fee.toString() } });
});

// Flagged reviews (SCRUM-69) — a PENDING flag already hides the review
// from everyone but its author (see orders.ts/sellers.ts), so this list
// is just the moderation queue, not a visibility switch itself.
router.get('/review-flags', requireAdmin, async (_req: Request, res: Response) => {
  const flags = await prisma.reviewFlag.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: {
      review: { select: { id: true, rating: true, comment: true, reviewerId: true, revieweeId: true } },
      flaggedBy: { select: { id: true, displayName: true } },
    },
  });

  res.status(200).json({
    data: flags.map(f => ({
      id: f.id,
      reason: f.reason,
      createdAt: f.createdAt,
      flaggedBy: f.flaggedBy,
      review: {
        id: f.review.id,
        rating: f.review.rating,
        comment: f.review.comment,
        reviewerId: f.review.reviewerId,
        revieweeId: f.review.revieweeId,
      },
    })),
  });
});

const resolveReviewFlagSchema = z.object({
  decision: z.enum(['DISMISS', 'REMOVE']),
});

router.post(
  '/review-flags/:id/resolve',
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = resolveReviewFlagSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const flag = await prisma.reviewFlag.findUnique({ where: { id: req.params.id } });
    if (!flag) {
      next(new ApiError('NOT_FOUND', 'Review flag not found', 404));
      return;
    }
    if (flag.status !== 'PENDING') {
      next(new ApiError('INVALID_STATE', 'This flag has already been resolved', 409));
      return;
    }

    const newStatus = parsed.data.decision === 'DISMISS' ? 'DISMISSED' : 'REMOVED';
    await prisma.reviewFlag.update({
      where: { id: flag.id },
      data: { status: newStatus, resolvedAt: new Date() },
    });

    res.status(200).json({ data: { id: flag.id, status: newStatus } });
  },
);

// Seller verification queue (SCRUM-131) — a stopgap admin-token-gated
// review surface, same as every other moderation queue in this file,
// until the full admin dashboard (SCRUM-152) exists.
router.get('/fulfilment/verification-requests', requireAdmin, async (_req: Request, res: Response) => {
  const requests = await prisma.fulfilmentVerificationRequest.findMany({
    where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
    orderBy: { createdAt: 'asc' },
    include: { seller: { select: { id: true, displayName: true } } },
  });

  res.status(200).json({
    data: requests.map(r => ({
      id: r.id,
      status: r.status,
      seller: r.seller,
      hasIdDocument: !!r.idDocumentUrl,
      hasBusinessDocument: !!r.businessDocumentUrl,
      hasShopPhoto: !!r.shopPhotoUrl,
      createdAt: r.createdAt,
    })),
  });
});

const resolveVerificationSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'MORE_INFO_REQUIRED']),
  notes: z.string().trim().max(1000).optional(),
});

router.post(
  '/fulfilment/verification-requests/:id/resolve',
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = resolveVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const verification = await prisma.fulfilmentVerificationRequest.findUnique({ where: { id: req.params.id } });
    if (!verification) {
      next(new ApiError('NOT_FOUND', 'Verification request not found', 404));
      return;
    }
    if (verification.status !== 'SUBMITTED' && verification.status !== 'UNDER_REVIEW') {
      next(new ApiError('INVALID_STATE', 'This verification request has already been resolved', 409));
      return;
    }

    const newStatus =
      parsed.data.decision === 'APPROVE' ? 'APPROVED' : parsed.data.decision === 'REJECT' ? 'REJECTED' : 'MORE_INFO_REQUIRED';

    await prisma.fulfilmentVerificationRequest.update({
      where: { id: verification.id },
      data: { status: newStatus, reviewNotes: parsed.data.notes ?? null, reviewedAt: new Date() },
    });
    await recordAuditLog(verification.sellerId, 'FULFILMENT_VERIFICATION_RESOLVED', { verificationId: verification.id, decision: newStatus });

    res.status(200).json({ data: { id: verification.id, status: newStatus } });
  },
);

// Immutable by design (SCRUM-146) -- read-only, no update/delete route
// exists for CollectionEvent anywhere in the app. Queryable here for
// dispute investigation, per that ticket's acceptance criterion.
router.get('/fulfilment/collection-events/:shipmentId', requireAdmin, async (req: Request<{ shipmentId: string }>, res: Response, next: NextFunction) => {
  const event = await prisma.collectionEvent.findUnique({
    where: { shipmentId: req.params.shipmentId },
    include: { shipment: { select: { reference: true } }, verifiedBy: { select: { id: true, displayName: true } } },
  });
  if (!event) {
    next(new ApiError('NOT_FOUND', 'No collection event found for this shipment', 404));
    return;
  }

  res.status(200).json({
    data: {
      id: event.id,
      shipmentId: event.shipmentId,
      shipmentReference: event.shipment.reference,
      verifiedBy: event.verifiedBy,
      idCheckPerformed: event.idCheckPerformed,
      idCheckOverrideReason: event.idCheckOverrideReason,
      proofImageUrl: event.proofImageUrl ? getParcelEvidenceViewUrl(event.proofImageUrl) : null,
      createdAt: event.createdAt,
    },
  });
});

export default router;
