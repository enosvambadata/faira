import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireFulfilmentRole, FulfilmentRequest } from '../middleware/requireFulfilmentRole';
import { isAssignedToHub } from '../lib/hubAssignment';
import { canTransition, displayStatus } from '../lib/shipmentStateMachine';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { notifyDropoffRejected } from '../services/fulfilmentNotifications';
import { signParcelEvidenceUpload } from '../lib/cloudinary';
import { renderShipmentLabelSvg } from '../services/shipmentLabel';

const router = Router();

const HUB_OPS_ROLES = ['HUB_AGENT', 'HUB_SUPERVISOR'] as const;

// Anything before SEALED in the pipeline — a label needs a reference and
// QR code (both set at confirm-time, SCRUM-135) plus confirmation the
// parcel was actually sealed shut, not just accepted or inspected.
const PRE_SEAL_STATUSES = [
  'DRAFT',
  'AWAITING_PAYMENT',
  'AWAITING_DROPOFF',
  'DROPOFF_OVERDUE',
  'RECEIVED_AT_ORIGIN',
  'INSPECTED',
  'REJECTED_AT_ORIGIN',
] as const;

// First hub-ops route (SCRUM-136) — every route here requires the actor
// to hold a hub-scoped role AND be assigned to the specific shipment's
// origin hub (checked per-handler via isAssignedToHub, since the target
// hub is only known once the shipment is loaded, not from the URL).
class ShipmentTransitionConflict extends Error {}

async function loadAssignedShipment(
  req: FulfilmentRequest,
  id: string,
): Promise<{ shipment: NonNullable<Awaited<ReturnType<typeof prisma.shipment.findUnique>>> } | { error: ApiError }> {
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) {
    return { error: new ApiError('NOT_FOUND', 'Shipment not found', 404) };
  }
  if (!isAssignedToHub(req, shipment.originHubId)) {
    await recordAuditLog(req.userId!, 'FULFILMENT_HUB_ASSIGNMENT_DENIED', {
      targetHubId: shipment.originHubId,
      actualHubAssignments: (req.fulfilmentRoles ?? []).map(r => r.hubId),
    });
    return { error: new ApiError('FORBIDDEN', 'You are not assigned to this hub', 403) };
  }
  return { shipment };
}

router.get(
  '/shipments/search',
  requireAuth,
  requireFulfilmentRole(...HUB_OPS_ROLES),
  async (req: FulfilmentRequest, res: Response, next: NextFunction) => {
    const reference = typeof req.query.reference === 'string' ? req.query.reference.trim() : '';
    if (!reference) {
      next(new ApiError('VALIDATION_ERROR', 'reference is required', 400));
      return;
    }

    const shipment = await prisma.shipment.findUnique({ where: { reference } });
    if (!shipment) {
      next(new ApiError('NOT_FOUND', 'No shipment found for that reference', 404));
      return;
    }
    if (!isAssignedToHub(req, shipment.originHubId)) {
      await recordAuditLog(req.userId!, 'FULFILMENT_HUB_ASSIGNMENT_DENIED', {
        targetHubId: shipment.originHubId,
        actualHubAssignments: (req.fulfilmentRoles ?? []).map(r => r.hubId),
      });
      next(new ApiError('FORBIDDEN', 'You are not assigned to this hub', 403));
      return;
    }

    res.status(200).json({
      data: {
        id: shipment.id,
        reference: shipment.reference,
        status: shipment.status,
        displayStatus: displayStatus(shipment.status),
        buyerName: shipment.buyerName,
        buyerContact: shipment.buyerContact,
        category: shipment.category,
        description: shipment.description,
        declaredValue: shipment.declaredValue.toString(),
        sizeTier: shipment.sizeTier,
        originHubId: shipment.originHubId,
        destinationHubId: shipment.destinationHubId,
      },
    });
  },
);

router.post(
  '/shipments/:id/accept-dropoff',
  requireAuth,
  requireFulfilmentRole(...HUB_OPS_ROLES),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const result = await loadAssignedShipment(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { shipment } = result;

    if (!canTransition(shipment.status, 'RECEIVED_AT_ORIGIN')) {
      next(new ApiError('INVALID_STATE', 'This shipment is not awaiting drop-off', 409));
      return;
    }

    try {
      await prisma.$transaction(async tx => {
        const updateResult = await tx.shipment.updateMany({
          where: { id: shipment.id, status: shipment.status },
          data: { status: 'RECEIVED_AT_ORIGIN' },
        });
        if (updateResult.count === 0) {
          throw new ShipmentTransitionConflict();
        }

        await tx.trackingEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: shipment.status,
            toStatus: 'RECEIVED_AT_ORIGIN',
            actorUserId: req.userId!,
            hubId: shipment.originHubId,
          },
        });
      });
    } catch (err) {
      if (err instanceof ShipmentTransitionConflict) {
        next(new ApiError('INVALID_STATE', 'This shipment is not awaiting drop-off', 409));
        return;
      }
      throw err;
    }

    await recordAuditLog(req.userId!, 'FULFILMENT_DROPOFF_ACCEPTED', {
      shipmentId: shipment.id,
      fromStatus: shipment.status,
    });

    res.status(200).json({
      data: { id: shipment.id, status: 'RECEIVED_AT_ORIGIN', displayStatus: displayStatus('RECEIVED_AT_ORIGIN') },
    });
  },
);

const rejectDropoffSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

router.post(
  '/shipments/:id/reject-dropoff',
  requireAuth,
  requireFulfilmentRole(...HUB_OPS_ROLES),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = rejectDropoffSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'A rejection reason is required', 400, z.flattenError(parsed.error)));
      return;
    }

    const result = await loadAssignedShipment(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { shipment } = result;

    if (!canTransition(shipment.status, 'REJECTED_AT_ORIGIN')) {
      next(new ApiError('INVALID_STATE', 'This shipment is not awaiting drop-off', 409));
      return;
    }

    try {
      await prisma.$transaction(async tx => {
        const updateResult = await tx.shipment.updateMany({
          where: { id: shipment.id, status: shipment.status },
          data: { status: 'REJECTED_AT_ORIGIN' },
        });
        if (updateResult.count === 0) {
          throw new ShipmentTransitionConflict();
        }

        await tx.trackingEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: shipment.status,
            toStatus: 'REJECTED_AT_ORIGIN',
            actorUserId: req.userId!,
            hubId: shipment.originHubId,
            notes: parsed.data.reason,
          },
        });
      });
    } catch (err) {
      if (err instanceof ShipmentTransitionConflict) {
        next(new ApiError('INVALID_STATE', 'This shipment is not awaiting drop-off', 409));
        return;
      }
      throw err;
    }

    await recordAuditLog(req.userId!, 'FULFILMENT_DROPOFF_REJECTED', {
      shipmentId: shipment.id,
      fromStatus: shipment.status,
      reason: parsed.data.reason,
    });

    await notifyDropoffRejected(shipment.id, parsed.data.reason);

    res.status(200).json({
      data: { id: shipment.id, status: 'REJECTED_AT_ORIGIN', displayStatus: displayStatus('REJECTED_AT_ORIGIN') },
    });
  },
);

// Doesn't need a specific shipment/hub in scope -- the signed params
// (folder + authenticated type) are the same for every capture, so any
// hub-scoped caller can request them; the actual write to a shipment
// (below) is where hub assignment is enforced.
router.get('/evidence-upload-params', requireAuth, requireFulfilmentRole(...HUB_OPS_ROLES), (_req, res) => {
  res.status(200).json({ data: signParcelEvidenceUpload() });
});

const inspectSchema = z.object({
  weightKg: z.number().positive(),
  dimensions: z.string().trim().min(1).max(100),
  condition: z.enum(['GOOD', 'DAMAGED', 'SUSPICIOUS']),
  photoPublicIds: z.array(z.string().trim().min(1)).min(1, 'At least one photo is required'),
});

router.post(
  '/shipments/:id/inspect',
  requireAuth,
  requireFulfilmentRole(...HUB_OPS_ROLES),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = inspectSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const result = await loadAssignedShipment(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { shipment } = result;

    if (!canTransition(shipment.status, 'INSPECTED')) {
      next(new ApiError('INVALID_STATE', 'This shipment has not been received at this hub yet', 409));
      return;
    }

    try {
      await prisma.$transaction(async tx => {
        const updateResult = await tx.shipment.updateMany({
          where: { id: shipment.id, status: shipment.status },
          data: {
            status: 'INSPECTED',
            weightKg: parsed.data.weightKg,
            dimensions: parsed.data.dimensions,
            condition: parsed.data.condition,
          },
        });
        if (updateResult.count === 0) {
          throw new ShipmentTransitionConflict();
        }

        await tx.parcelEvidence.createMany({
          data: parsed.data.photoPublicIds.map(publicId => ({
            shipmentId: shipment.id,
            type: 'PARCEL_PHOTO' as const,
            imageUrl: publicId,
            capturedById: req.userId!,
          })),
        });

        await tx.trackingEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: shipment.status,
            toStatus: 'INSPECTED',
            actorUserId: req.userId!,
            hubId: shipment.originHubId,
          },
        });
      });
    } catch (err) {
      if (err instanceof ShipmentTransitionConflict) {
        next(new ApiError('INVALID_STATE', 'This shipment has not been received at this hub yet', 409));
        return;
      }
      throw err;
    }

    await recordAuditLog(req.userId!, 'FULFILMENT_PARCEL_INSPECTED', {
      shipmentId: shipment.id,
      condition: parsed.data.condition,
      photoCount: parsed.data.photoPublicIds.length,
    });

    res.status(200).json({
      data: { id: shipment.id, status: 'INSPECTED', displayStatus: displayStatus('INSPECTED') },
    });
  },
);

const sealSchema = z.object({
  sealNumber: z.string().trim().min(1).max(100),
});

router.post(
  '/shipments/:id/seal',
  requireAuth,
  requireFulfilmentRole(...HUB_OPS_ROLES),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = sealSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'A seal number is required', 400, z.flattenError(parsed.error)));
      return;
    }

    const result = await loadAssignedShipment(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { shipment } = result;

    if (!canTransition(shipment.status, 'SEALED')) {
      next(new ApiError('INVALID_STATE', 'This shipment has not been inspected yet', 409));
      return;
    }

    // Re-checked here (not just at /inspect time) since inspection and
    // sealing are separate calls -- defense in depth against a shipment
    // somehow reaching INSPECTED with no recorded evidence.
    const evidenceCount = await prisma.parcelEvidence.count({ where: { shipmentId: shipment.id } });
    if (evidenceCount === 0) {
      next(new ApiError('EVIDENCE_REQUIRED', 'At least one photo must be recorded before sealing', 409));
      return;
    }

    try {
      await prisma.$transaction(async tx => {
        const updateResult = await tx.shipment.updateMany({
          where: { id: shipment.id, status: shipment.status },
          data: { status: 'SEALED' },
        });
        if (updateResult.count === 0) {
          throw new ShipmentTransitionConflict();
        }

        await tx.parcelSeal.create({
          data: { shipmentId: shipment.id, sealNumber: parsed.data.sealNumber, appliedById: req.userId! },
        });

        await tx.trackingEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: shipment.status,
            toStatus: 'SEALED',
            actorUserId: req.userId!,
            hubId: shipment.originHubId,
          },
        });
      });
    } catch (err) {
      if (err instanceof ShipmentTransitionConflict) {
        next(new ApiError('INVALID_STATE', 'This shipment has not been inspected yet', 409));
        return;
      }
      throw err;
    }

    await recordAuditLog(req.userId!, 'FULFILMENT_PARCEL_SEALED', {
      shipmentId: shipment.id,
      sealNumber: parsed.data.sealNumber,
    });

    res.status(200).json({
      data: { id: shipment.id, status: 'SEALED', displayStatus: displayStatus('SEALED') },
    });
  },
);

// Reprintable any number of times, on purpose (a torn/lost physical label
// shouldn't strand a parcel) — every generation, first print or Nth
// reprint alike, is logged identically to AuditLog so an unusual reprint
// pattern (e.g. many reprints of the same shipment) is investigable,
// per the ticket's label-swapping-fraud security note.
router.get(
  '/shipments/:id/label',
  requireAuth,
  requireFulfilmentRole(...HUB_OPS_ROLES),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const result = await loadAssignedShipment(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { shipment } = result;

    if ((PRE_SEAL_STATUSES as readonly string[]).includes(shipment.status)) {
      next(new ApiError('INVALID_STATE', 'This shipment has not been sealed yet', 409));
      return;
    }
    if (!shipment.reference || !shipment.qrCodeUrl) {
      next(new ApiError('INVALID_STATE', 'This shipment has no reference or QR code yet', 409));
      return;
    }

    const [originHub, destinationHub] = await Promise.all([
      prisma.hub.findUnique({ where: { id: shipment.originHubId } }),
      prisma.hub.findUnique({ where: { id: shipment.destinationHubId } }),
    ]);

    const svg = renderShipmentLabelSvg({
      reference: shipment.reference,
      qrCodeUrl: shipment.qrCodeUrl,
      originHubName: originHub?.name ?? 'Unknown hub',
      destinationHubName: destinationHub?.name ?? 'Unknown hub',
      sizeTier: shipment.sizeTier,
      declaredValue: shipment.declaredValue.toString(),
    });

    await recordAuditLog(req.userId!, 'FULFILMENT_LABEL_PRINTED', {
      shipmentId: shipment.id,
      reference: shipment.reference,
    });

    res.status(200).type('image/svg+xml').send(svg);
  },
);

export default router;
