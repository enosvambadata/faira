import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireCollectUkDriver, DriverRequest } from '../middleware/requireCollectUkDriver';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { advanceRouteProgress } from '../services/collectUkRouteProgress';
import { signCollectUkProofUpload, signCollectUkDriverDocUpload } from '../lib/cloudinary';
import { notifyParcelCollected, notifyUnableToCollect, notifyArrivedAtWarehouse } from '../services/collectUkNotifications';
import { AuthenticatedRequest } from '../middleware/requireAuth';
import { isCompanyMember, COMPANY_BLOCKS_DRIVER } from '../lib/collectUkRoleExclusion';

const router = Router();

class StopTransitionConflict extends Error {}

// requireAuth only (no ACTIVE gate): this is how an applicant checks
// where their application stands. null = never applied.
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const driver = await prisma.collectUkDriver.findUnique({ where: { userId: req.userId! } });
  res.status(200).json({ data: driver });
});

const vehicleSchema = z.object({
  makeModel: z.string().trim().min(1).max(200),
  registrationPlate: z.string().trim().min(1).max(30),
  capacityParcels: z.number().int().positive().max(500).optional(),
  photoUrl: z.string().trim().min(1).max(500),
});

const applySchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(5).max(30),
  basePostcode: z.string().trim().min(1).max(20),
  county: z.string().trim().min(1).max(100),
  drivingLicenceUrl: z.string().trim().min(1).max(500),
  // Relaxed onboarding: driving licence + the van's own insurance + a current
  // MOT are required. Hire & reward, Goods-in-Transit and public liability are
  // optional for now (to be reintroduced) -- kept in the schema so older
  // clients/records still validate.
  motorInsuranceUrl: z.string().trim().min(1).max(500),
  motUrl: z.string().trim().min(1).max(500),
  gitInsuranceUrl: z.string().trim().min(1).max(500).optional(),
  liabilityUrl: z.string().trim().min(1).max(500).optional(),
  vehicles: z.array(vehicleSchema).min(1).max(10),
});

// Own-van driver application. Relaxed doc set for the initial recruitment
// push: driving licence + the van's own insurance + a current MOT are
// required; hire & reward, Goods in Transit and public liability are optional
// for now (legally needed for paid carriage -- to be reintroduced). Vehicles
// are a list: a driver with two or more vans registers them all, each with its
// own plate/capacity/photo. A REJECTED applicant may resubmit (same row
// returns to APPLIED, vehicles replaced).
router.post('/apply', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  if (await isCompanyMember(req.userId!)) {
    next(new ApiError('ROLE_CONFLICT', COMPANY_BLOCKS_DRIVER, 409));
    return;
  }

  const existing = await prisma.collectUkDriver.findUnique({ where: { userId: req.userId! } });
  if (existing && existing.status !== 'REJECTED') {
    next(new ApiError('ALREADY_APPLIED', 'You already have a driver record with Vamba Collect', 409));
    return;
  }

  const { vehicles, ...driverFields } = parsed.data;
  const primary = vehicles[0];
  const driverData = {
    ...driverFields,
    status: 'APPLIED' as const,
    appliedAt: new Date(),
    reviewedAt: null,
    reviewNotes: null,
    // Primary-vehicle summary (denormalized from vehicles[0]) so the
    // dispatch board and route displays keep working without a join.
    vehicleMakeModel: primary.makeModel,
    vehicleReference: primary.registrationPlate,
    capacityParcels: primary.capacityParcels ?? 20,
    vanPhotoUrl: primary.photoUrl,
  };

  const driver = await prisma.$transaction(async tx => {
    const d = existing
      ? await tx.collectUkDriver.update({ where: { id: existing.id }, data: driverData })
      : await tx.collectUkDriver.create({ data: { userId: req.userId!, ...driverData } });
    // Replace the vehicle list wholesale (matters on resubmit).
    await tx.collectUkDriverVehicle.deleteMany({ where: { driverId: d.id } });
    await tx.collectUkDriverVehicle.createMany({
      data: vehicles.map(v => ({
        driverId: d.id,
        makeModel: v.makeModel,
        registrationPlate: v.registrationPlate,
        capacityParcels: v.capacityParcels ?? 20,
        photoUrl: v.photoUrl,
      })),
    });
    return d;
  });

  await recordAuditLog(req.userId!, 'COLLECT_UK_DRIVER_APPLIED', {
    driverId: driver.id,
    county: driver.county,
    vehicleCount: vehicles.length,
  });

  res.status(201).json({ data: { id: driver.id, status: driver.status } });
});

// Signed upload params for application documents -- requireAuth only,
// since applicants are by definition not yet drivers.
router.get('/apply/upload-params', requireAuth, (_req, res: Response) => {
  res.status(200).json({ data: signCollectUkDriverDocUpload() });
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
