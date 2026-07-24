import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin } from '../middleware/requireAdmin';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { getParcelEvidenceViewUrl } from '../lib/cloudinary';

// Fulfilment's admin-token-gated review surfaces. Mounted at /api/v1/admin so
// the public paths (/api/v1/admin/fulfilment/*) stay byte-identical to when
// these lived in the marketplace API — only the host changes.
const router = Router();

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
