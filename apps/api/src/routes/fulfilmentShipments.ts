import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { requireFulfilmentRole, FulfilmentRequest } from '../middleware/requireFulfilmentRole';
import { ApiError } from '../errors/ApiError';
import { SYSTEM_CONFIG_KEYS } from '../lib/systemConfigKeys';
import { calculateShipmentQuote } from '../services/shipmentQuote';
import { canTransition, displayStatus } from '../lib/shipmentStateMachine';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { generateShipmentReference } from '../services/shipmentReference';
import { generateTrackingToken } from '../lib/trackingToken';

const router = Router();

const DEFAULT_DROPOFF_DEADLINE_HOURS = 48;

// Sentinel thrown inside the confirm transaction when the atomic
// updateMany's WHERE clause matched zero rows (a concurrent request
// already transitioned this shipment) — caught outside to return 409
// rather than leaking a generic 500.
class ShipmentTransitionConflict extends Error {}

const DEFAULT_DECLARED_VALUE_LIMIT_UNVERIFIED = 200;
const DEFAULT_DECLARED_VALUE_LIMIT_VERIFIED = 2000;

const createShipmentSchema = z
  .object({
    buyerName: z.string().trim().min(1).max(200),
    buyerContact: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Buyer contact must be in E.164 format, e.g. +263771234567'),
    originHubId: z.string().uuid(),
    destinationHubId: z.string().uuid(),
    category: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).optional(),
    declaredValue: z.number().positive(),
    sizeTier: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE']),
  })
  .refine(data => data.originHubId !== data.destinationHubId, {
    message: 'Origin and destination hub must be different',
    path: ['destinationHubId'],
  });

async function getDeclaredValueLimit(sellerId: string): Promise<number> {
  const [verification, config] = await Promise.all([
    prisma.fulfilmentVerificationRequest.findFirst({
      where: { sellerId, status: 'APPROVED' },
    }),
    prisma.systemConfiguration.findMany({
      where: { key: { in: [SYSTEM_CONFIG_KEYS.DECLARED_VALUE_LIMIT_UNVERIFIED, SYSTEM_CONFIG_KEYS.DECLARED_VALUE_LIMIT_VERIFIED] } },
    }),
  ]);

  const configMap = Object.fromEntries(config.map(c => [c.key, Number(c.value)]));
  return verification
    ? configMap[SYSTEM_CONFIG_KEYS.DECLARED_VALUE_LIMIT_VERIFIED] ?? DEFAULT_DECLARED_VALUE_LIMIT_VERIFIED
    : configMap[SYSTEM_CONFIG_KEYS.DECLARED_VALUE_LIMIT_UNVERIFIED] ?? DEFAULT_DECLARED_VALUE_LIMIT_UNVERIFIED;
}

router.post(
  '/',
  requireAuth,
  requireFulfilmentRole('SELLER'),
  async (req: FulfilmentRequest, res: Response, next: NextFunction) => {
    const parsed = createShipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const { originHubId, destinationHubId, declaredValue } = parsed.data;

    const [originHub, destinationHub] = await Promise.all([
      prisma.hub.findUnique({ where: { id: originHubId } }),
      prisma.hub.findUnique({ where: { id: destinationHubId } }),
    ]);
    if (!originHub || !originHub.isActive) {
      next(new ApiError('NOT_FOUND', 'Origin hub not found', 404));
      return;
    }
    if (!destinationHub || !destinationHub.isActive) {
      next(new ApiError('NOT_FOUND', 'Destination hub not found', 404));
      return;
    }

    const limit = await getDeclaredValueLimit(req.userId!);
    if (declaredValue > limit) {
      next(
        new ApiError(
          'DECLARED_VALUE_EXCEEDS_LIMIT',
          `Declared value exceeds your current limit of $${limit}. Get verified to raise this limit.`,
          400,
          { limit },
        ),
      );
      return;
    }

    const shipment = await prisma.shipment.create({
      data: {
        sellerId: req.userId!,
        buyerName: parsed.data.buyerName,
        buyerContact: parsed.data.buyerContact,
        originHubId,
        destinationHubId,
        category: parsed.data.category,
        description: parsed.data.description ?? null,
        declaredValue,
        sizeTier: parsed.data.sizeTier,
      },
    });

    res.status(201).json({
      data: {
        id: shipment.id,
        status: shipment.status,
        buyerName: shipment.buyerName,
        buyerContact: shipment.buyerContact,
        originHubId: shipment.originHubId,
        destinationHubId: shipment.destinationHubId,
        category: shipment.category,
        description: shipment.description,
        declaredValue: shipment.declaredValue.toString(),
        sizeTier: shipment.sizeTier,
        createdAt: shipment.createdAt,
      },
    });
  },
);

router.get(
  '/:id',
  requireAuth,
  requireFulfilmentRole('SELLER'),
  async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
    if (!shipment) {
      next(new ApiError('NOT_FOUND', 'Shipment not found', 404));
      return;
    }
    if (shipment.sellerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not your shipment', 403));
      return;
    }

    res.status(200).json({
      data: {
        id: shipment.id,
        status: shipment.status,
        buyerName: shipment.buyerName,
        buyerContact: shipment.buyerContact,
        originHubId: shipment.originHubId,
        destinationHubId: shipment.destinationHubId,
        category: shipment.category,
        description: shipment.description,
        declaredValue: shipment.declaredValue.toString(),
        sizeTier: shipment.sizeTier,
        feePayer: shipment.feePayer,
        deliveryFee: shipment.deliveryFee?.toString() ?? null,
        reference: shipment.reference,
        qrCodeUrl: shipment.qrCodeUrl,
        dropoffDeadline: shipment.dropoffDeadline,
        createdAt: shipment.createdAt,
      },
    });
  },
);

// Lets a seller fetch (and re-fetch) the buyer's tracking link without
// needing to intercept the SMS the buyer was actually sent -- useful for
// support/testing, and for a seller who wants to resend it themselves.
router.get(
  '/:id/tracking-link',
  requireAuth,
  requireFulfilmentRole('SELLER'),
  async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
    if (!shipment) {
      next(new ApiError('NOT_FOUND', 'Shipment not found', 404));
      return;
    }
    if (shipment.sellerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not your shipment', 403));
      return;
    }

    const token = generateTrackingToken(shipment.id);
    const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3100';

    res.status(200).json({
      data: { token, url: `${webAppUrl}/track/${token}` },
    });
  },
);

const selectFeePayerSchema = z.object({
  feePayer: z.enum(['SELLER', 'BUYER']),
});

// Preview only — never persists. The seller may check this repeatedly while
// deciding who should pay before committing via the POST below.
router.get(
  '/:id/quote',
  requireAuth,
  requireFulfilmentRole('SELLER'),
  async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
    if (!shipment) {
      next(new ApiError('NOT_FOUND', 'Shipment not found', 404));
      return;
    }
    if (shipment.sellerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not your shipment', 403));
      return;
    }
    if (shipment.status !== 'DRAFT') {
      next(new ApiError('INVALID_STATE', 'Only draft shipments can be quoted', 409));
      return;
    }

    const quote = await calculateShipmentQuote(shipment.originHubId, shipment.destinationHubId, shipment.sizeTier);

    res.status(200).json({
      data: {
        fee: quote.fee,
        source: quote.source,
        sizeTier: shipment.sizeTier,
      },
    });
  },
);

// Recomputes the quote server-side (never trusts a client-supplied fee) and
// persists it alongside the seller's fee-payer choice. Still leaves the
// shipment in DRAFT — confirming it into the state machine is SCRUM-134.
router.post(
  '/:id/quote',
  requireAuth,
  requireFulfilmentRole('SELLER'),
  async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = selectFeePayerSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
    if (!shipment) {
      next(new ApiError('NOT_FOUND', 'Shipment not found', 404));
      return;
    }
    if (shipment.sellerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not your shipment', 403));
      return;
    }
    if (shipment.status !== 'DRAFT') {
      next(new ApiError('INVALID_STATE', 'Only draft shipments can be quoted', 409));
      return;
    }

    const quote = await calculateShipmentQuote(shipment.originHubId, shipment.destinationHubId, shipment.sizeTier);

    const updated = await prisma.shipment.update({
      where: { id: shipment.id },
      data: { deliveryFee: quote.fee, feePayer: parsed.data.feePayer },
    });

    res.status(200).json({
      data: {
        id: updated.id,
        status: updated.status,
        feePayer: updated.feePayer,
        deliveryFee: updated.deliveryFee?.toString() ?? null,
        quoteSource: quote.source,
      },
    });
  },
);

// First real use of the shipment state machine (SCRUM-108). Only valid
// from DRAFT, and only once the seller has chosen a fee-payer via the
// quote step (SCRUM-133) — that choice decides the next status: seller-pays
// stops at AWAITING_PAYMENT (a future ticket confirms payment and advances
// it to AWAITING_DROPOFF), buyer-pays skips straight there since there's
// nothing to collect upfront.
router.post(
  '/:id/confirm',
  requireAuth,
  requireFulfilmentRole('SELLER'),
  async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
    if (!shipment) {
      next(new ApiError('NOT_FOUND', 'Shipment not found', 404));
      return;
    }
    if (shipment.sellerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not your shipment', 403));
      return;
    }
    if (!shipment.feePayer) {
      next(new ApiError('DELIVERY_FEE_NOT_SET', 'Confirm a delivery fee before confirming this shipment', 409));
      return;
    }

    const targetStatus = shipment.feePayer === 'SELLER' ? 'AWAITING_PAYMENT' : 'AWAITING_DROPOFF';
    if (!canTransition(shipment.status, targetStatus)) {
      next(new ApiError('INVALID_STATE', 'Only draft shipments can be confirmed', 409));
      return;
    }

    const deadlineConfig = await prisma.systemConfiguration.findUnique({
      where: { key: SYSTEM_CONFIG_KEYS.SHIPMENT_DROPOFF_DEADLINE_HOURS },
    });
    const deadlineHours = deadlineConfig ? Number(deadlineConfig.value) : DEFAULT_DROPOFF_DEADLINE_HOURS;
    const dropoffDeadline = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);

    let reference = '';
    let qrCodeUrl = '';

    try {
      await prisma.$transaction(async tx => {
        const result = await tx.shipment.updateMany({
          where: { id: shipment.id, status: shipment.status },
          data: { status: targetStatus, dropoffDeadline },
        });
        if (result.count === 0) {
          throw new ShipmentTransitionConflict();
        }

        // Generated inside the same transaction as the status transition —
        // a shipment never ends up confirmed without a reference/QR, and
        // the hub's sequence counter never increments for a confirm that
        // ultimately rolls back.
        ({ reference, qrCodeUrl } = await generateShipmentReference(tx, shipment.originHubId));
        await tx.shipment.update({ where: { id: shipment.id }, data: { reference, qrCodeUrl } });

        await tx.trackingEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: shipment.status,
            toStatus: targetStatus,
            actorUserId: req.userId!,
          },
        });
      });
    } catch (err) {
      if (err instanceof ShipmentTransitionConflict) {
        next(new ApiError('INVALID_STATE', 'Only draft shipments can be confirmed', 409));
        return;
      }
      throw err;
    }

    await recordAuditLog(req.userId!, 'FULFILMENT_SHIPMENT_CONFIRMED', {
      shipmentId: shipment.id,
      fromStatus: shipment.status,
      toStatus: targetStatus,
    });

    res.status(200).json({
      data: {
        id: shipment.id,
        status: targetStatus,
        displayStatus: displayStatus(targetStatus),
        dropoffDeadline,
        reference,
        qrCodeUrl,
      },
    });
  },
);

// Abandoning a draft is a hard delete, not a status transition — a DRAFT
// has no TrackingEvent history yet (that only starts once confirmed, per
// docs/fulfilment/03-shipment-state-machine.md), so there's nothing to
// preserve for chain-of-custody once it's deleted at this stage.
router.delete(
  '/:id',
  requireAuth,
  requireFulfilmentRole('SELLER'),
  async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
    if (!shipment) {
      next(new ApiError('NOT_FOUND', 'Shipment not found', 404));
      return;
    }
    if (shipment.sellerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not your shipment', 403));
      return;
    }
    if (shipment.status !== 'DRAFT') {
      next(new ApiError('INVALID_STATE', 'Only draft shipments can be abandoned', 409));
      return;
    }

    await prisma.shipment.delete({ where: { id: shipment.id } });
    res.status(204).send();
  },
);

export default router;
