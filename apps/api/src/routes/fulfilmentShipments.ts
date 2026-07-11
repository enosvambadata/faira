import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { requireFulfilmentRole, FulfilmentRequest } from '../middleware/requireFulfilmentRole';
import { ApiError } from '../errors/ApiError';
import { SYSTEM_CONFIG_KEYS } from '../lib/systemConfigKeys';

const router = Router();

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
        createdAt: shipment.createdAt,
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
