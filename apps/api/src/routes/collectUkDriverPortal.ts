import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireCollectUkDriver, DriverRequest } from '../middleware/requireCollectUkDriver';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { advanceRouteProgress } from '../services/collectUkRouteProgress';
import { signCollectUkProofUpload } from '../lib/cloudinary';
import { notifyParcelCollected, notifyUnableToCollect, notifyArrivedAtWarehouse } from '../services/collectUkNotifications';

const router = Router();

class StopTransitionConflict extends Error {}

router.get('/me', requireAuth, requireCollectUkDriver, async (req: DriverRequest, res: Response) => {
  res.status(200).json({ data: req.driver });
});

router.get('/evidence-upload-params', requireAuth, requireCollectUkDriver, (_req, res: Response) => {
  res.status(200).json({ data: signCollectUkProofUpload() });
});

router.get('/routes', requireAuth, requireCollectUkDriver, async (req: DriverRequest, res: Response) => {
  const routes = await prisma.collectUkCollectionRoute.findMany({
    where: { driverId: req.driver!.id },
    orderBy: { routeDate: 'desc' },
  });
  res.status(200).json({ data: routes });
});

function stopResponse(s: {
  id: string;
  sequenceOrder: number;
  status: string;
  bookingId: string;
  distanceFromPreviousMiles: number | null;
  booking: {
    reference: string | null;
    customerName: string;
    customerContact: string;
    collectionAddress: string;
    collectionPostcode: string;
    destinationCountry: string;
    parcelSizeTier: string;
    numberOfParcels: number;
    itemTypes: string[];
    itemTypeOther: string | null;
    vehicleType: string | null;
    specialInstructions: string | null;
    company: { name: string };
  };
}) {
  return {
    id: s.id,
    sequenceOrder: s.sequenceOrder,
    status: s.status,
    bookingId: s.bookingId,
    distanceFromPreviousMiles: s.distanceFromPreviousMiles,
    bookingReference: s.booking.reference,
    companyName: s.booking.company.name,
    customerName: s.booking.customerName,
    customerContact: s.booking.customerContact,
    collectionAddress: s.booking.collectionAddress,
    collectionPostcode: s.booking.collectionPostcode,
    destinationCountry: s.booking.destinationCountry,
    parcelSizeTier: s.booking.parcelSizeTier,
    numberOfParcels: s.booking.numberOfParcels,
    itemTypes: s.booking.itemTypes,
    itemTypeOther: s.booking.itemTypeOther,
    vehicleType: s.booking.vehicleType,
    specialInstructions: s.booking.specialInstructions,
  };
}

router.get(
  '/routes/:id',
  requireAuth,
  requireCollectUkDriver,
  async (req: DriverRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    const route = await prisma.collectUkCollectionRoute.findUnique({
      where: { id: req.params.id },
      include: {
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          include: { booking: { include: { company: true } } },
        },
      },
    });
    if (!route || route.driverId !== req.driver!.id) {
      next(new ApiError('NOT_FOUND', 'Route not found', 404));
      return;
    }

    res.status(200).json({
      data: {
        id: route.id,
        routeDate: route.routeDate,
        status: route.status,
        totalDistanceMiles: route.totalDistanceMiles,
        stops: route.stops.map(stopResponse),
      },
    });
  },
);

async function loadOwnStop(req: DriverRequest, stopId: string) {
  const stop = await prisma.collectUkCollectionStop.findUnique({ where: { id: stopId } });
  if (!stop || stop.driverId !== req.driver!.id) {
    return { error: new ApiError('NOT_FOUND', 'Stop not found', 404) };
  }
  return { stop };
}

const collectSchema = z.object({
  proofPhotoUrl: z.string().trim().max(500).optional(),
  signatureUrl: z.string().trim().max(500).optional(),
});

router.post(
  '/stops/:id/collect',
  requireAuth,
  requireCollectUkDriver,
  async (req: DriverRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    const parsed = collectSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const result = await loadOwnStop(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { stop } = result;

    if (stop.status !== 'PENDING') {
      next(new ApiError('INVALID_STATE', 'This stop has already been resolved', 409));
      return;
    }

    let arrivedBookingIds: string[];
    try {
      arrivedBookingIds = await prisma.$transaction(async tx => {
        const stopUpdate = await tx.collectUkCollectionStop.updateMany({
          where: { id: stop.id, status: 'PENDING' },
          data: {
            status: 'COLLECTED',
            proofPhotoUrl: parsed.data.proofPhotoUrl,
            signatureUrl: parsed.data.signatureUrl,
            completedAt: new Date(),
          },
        });
        if (stopUpdate.count === 0) throw new StopTransitionConflict();

        const bookingUpdate = await tx.collectUkCollectionBooking.updateMany({
          where: { id: stop.bookingId, status: { in: ['DRIVER_ASSIGNED', 'EN_ROUTE'] } },
          data: { status: 'COLLECTED' },
        });
        if (bookingUpdate.count === 0) throw new StopTransitionConflict();

        return advanceRouteProgress(tx, stop.routeId);
      });
    } catch (err) {
      if (err instanceof StopTransitionConflict) {
        next(new ApiError('INVALID_STATE', 'This stop has already been resolved', 409));
        return;
      }
      throw err;
    }

    await recordAuditLog(req.userId!, 'COLLECT_UK_STOP_COLLECTED', { stopId: stop.id, bookingId: stop.bookingId });
    await notifyParcelCollected(stop.bookingId);
    for (const bookingId of arrivedBookingIds) {
      await notifyArrivedAtWarehouse(bookingId);
    }
    res.status(200).json({ data: { id: stop.id, status: 'COLLECTED' } });
  },
);

const unableToCollectSchema = z.object({
  failureReason: z.string().trim().min(1).max(500),
});

router.post(
  '/stops/:id/unable-to-collect',
  requireAuth,
  requireCollectUkDriver,
  async (req: DriverRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    const parsed = unableToCollectSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'A reason is required', 400, z.flattenError(parsed.error)));
      return;
    }

    const result = await loadOwnStop(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { stop } = result;

    if (stop.status !== 'PENDING') {
      next(new ApiError('INVALID_STATE', 'This stop has already been resolved', 409));
      return;
    }

    let arrivedBookingIds: string[];
    try {
      arrivedBookingIds = await prisma.$transaction(async tx => {
        const stopUpdate = await tx.collectUkCollectionStop.updateMany({
          where: { id: stop.id, status: 'PENDING' },
          data: { status: 'UNABLE_TO_COLLECT', failureReason: parsed.data.failureReason, completedAt: new Date() },
        });
        if (stopUpdate.count === 0) throw new StopTransitionConflict();

        const bookingUpdate = await tx.collectUkCollectionBooking.updateMany({
          where: { id: stop.bookingId, status: { in: ['DRIVER_ASSIGNED', 'EN_ROUTE'] } },
          data: { status: 'UNABLE_TO_COLLECT' },
        });
        if (bookingUpdate.count === 0) throw new StopTransitionConflict();

        return advanceRouteProgress(tx, stop.routeId);
      });
    } catch (err) {
      if (err instanceof StopTransitionConflict) {
        next(new ApiError('INVALID_STATE', 'This stop has already been resolved', 409));
        return;
      }
      throw err;
    }

    await recordAuditLog(req.userId!, 'COLLECT_UK_STOP_UNABLE_TO_COLLECT', {
      stopId: stop.id,
      bookingId: stop.bookingId,
      reason: parsed.data.failureReason,
    });
    await notifyUnableToCollect(stop.bookingId, parsed.data.failureReason);
    // A failed stop can still be the route's last unresolved one -- the
    // OTHER bookings collected earlier on the route arrive regardless.
    for (const bookingId of arrivedBookingIds) {
      await notifyArrivedAtWarehouse(bookingId);
    }
    res.status(200).json({ data: { id: stop.id, status: 'UNABLE_TO_COLLECT' } });
  },
);

export default router;
