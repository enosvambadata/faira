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

const router = Router();

const HUB_OPS_ROLES = ['HUB_AGENT', 'HUB_SUPERVISOR'] as const;

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

export default router;
