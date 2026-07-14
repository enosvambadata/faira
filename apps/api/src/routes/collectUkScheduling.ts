import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requireAdmin } from '../middleware/requireAdmin';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { notifyCollectionScheduled, notifyCollectionWillBeRescheduled } from '../services/collectUkNotifications';
import { geocodePostcode, estimatedRoadMiles, orderByNearestNeighbour, GeoPoint } from '../lib/collectUkGeo';
import { getCollectUkDriverDocViewUrl } from '../lib/cloudinary';
import { isCompanyMember, COMPANY_BLOCKS_DRIVER } from '../lib/collectUkRoleExclusion';

const router = Router();

// Faira-internal dispatcher tooling -- drivers belong to Faira, not any
// company (steering doc, explicit), and a dispatcher needs cross-company
// visibility to route one shared driver efficiently. That's why this is
// admin-gated (same x-admin-token pattern as Fulfilment's transport/
// reconciliation tooling) rather than scoped through CollectUkCompanyRole,
// which must never see across companies. API-only for now, no dedicated
// dispatch UI -- there's no ops team using this yet (matches the
// SCRUM-139/142 precedent). No route-optimisation here either -- sequence
// order is whatever the caller assigns, per the Collect UK ADR's explicit
// deferral of that decision.

class BookingTransitionConflict extends Error {}

const createDriverSchema = z.object({
  userId: z.string().uuid(),
  vehicleReference: z.string().trim().max(100).optional(),
  capacityParcels: z.number().int().positive().optional(),
});

router.post('/drivers', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = createDriverSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) {
    next(new ApiError('NOT_FOUND', 'User not found', 404));
    return;
  }

  if (await isCompanyMember(parsed.data.userId)) {
    next(new ApiError('ROLE_CONFLICT', COMPANY_BLOCKS_DRIVER, 409));
    return;
  }

  try {
    const driver = await prisma.collectUkDriver.create({
      data: {
        userId: parsed.data.userId,
        vehicleReference: parsed.data.vehicleReference,
        capacityParcels: parsed.data.capacityParcels,
      },
    });
    await recordAuditLog(parsed.data.userId, 'COLLECT_UK_DRIVER_CREATED', { driverId: driver.id });
    res.status(201).json({ data: driver });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      next(new ApiError('ALREADY_A_DRIVER', 'This user is already a driver', 409));
      return;
    }
    throw err;
  }
});

router.get('/drivers', requireAdmin, async (_req: Request, res: Response) => {
  const drivers = await prisma.collectUkDriver.findMany({ orderBy: { createdAt: 'asc' } });
  res.status(200).json({ data: drivers });
});

// Own-van applications awaiting review, with signed short-lived view URLs
// for the insurance documents (authenticated Cloudinary delivery -- the
// raw public IDs are useless without a signature).
router.get('/driver-applications', requireAdmin, async (_req: Request, res: Response) => {
  const applications = await prisma.collectUkDriver.findMany({
    where: { status: 'APPLIED' },
    orderBy: { appliedAt: 'asc' },
  });

  res.status(200).json({
    data: applications.map(a => ({
      id: a.id,
      fullName: a.fullName,
      phone: a.phone,
      county: a.county,
      basePostcode: a.basePostcode,
      vehicleMakeModel: a.vehicleMakeModel,
      vehicleReference: a.vehicleReference,
      capacityParcels: a.capacityParcels,
      appliedAt: a.appliedAt,
      documents: {
        vanPhoto: a.vanPhotoUrl ? getCollectUkDriverDocViewUrl(a.vanPhotoUrl) : null,
        motorInsurance: a.motorInsuranceUrl ? getCollectUkDriverDocViewUrl(a.motorInsuranceUrl) : null,
        gitInsurance: a.gitInsuranceUrl ? getCollectUkDriverDocViewUrl(a.gitInsuranceUrl) : null,
        liability: a.liabilityUrl ? getCollectUkDriverDocViewUrl(a.liabilityUrl) : null,
      },
    })),
  });
});

// Approving is what turns an applicant into a routable driver -- the
// reviewer is asserting they have checked the hire & reward, GIT and
// public liability documents.
router.post('/drivers/:id/approve', requireAdmin, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  const driver = await prisma.collectUkDriver.findUnique({ where: { id: req.params.id } });
  if (!driver) {
    next(new ApiError('NOT_FOUND', 'Driver not found', 404));
    return;
  }
  if (driver.status !== 'APPLIED') {
    next(new ApiError('INVALID_STATE', 'Only a pending application can be approved', 409));
    return;
  }

  await prisma.collectUkDriver.update({
    where: { id: driver.id },
    data: { status: 'ACTIVE', reviewedAt: new Date(), reviewNotes: null },
  });
  await recordAuditLog(driver.userId, 'COLLECT_UK_DRIVER_APPROVED', { driverId: driver.id });

  res.status(200).json({ data: { id: driver.id, status: 'ACTIVE' } });
});

const rejectSchema = z.object({ reviewNotes: z.string().trim().min(1).max(500) });

router.post('/drivers/:id/reject', requireAdmin, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'A reason is required', 400, z.flattenError(parsed.error)));
    return;
  }

  const driver = await prisma.collectUkDriver.findUnique({ where: { id: req.params.id } });
  if (!driver) {
    next(new ApiError('NOT_FOUND', 'Driver not found', 404));
    return;
  }
  if (driver.status !== 'APPLIED') {
    next(new ApiError('INVALID_STATE', 'Only a pending application can be rejected', 409));
    return;
  }

  await prisma.collectUkDriver.update({
    where: { id: driver.id },
    data: { status: 'REJECTED', reviewedAt: new Date(), reviewNotes: parsed.data.reviewNotes },
  });
  await recordAuditLog(driver.userId, 'COLLECT_UK_DRIVER_REJECTED', { driverId: driver.id, reason: parsed.data.reviewNotes });

  res.status(200).json({ data: { id: driver.id, status: 'REJECTED' } });
});

const createRouteSchema = z.object({
  driverId: z.string().uuid(),
  routeDate: z.coerce.date(),
});

router.post('/routes', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = createRouteSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const driver = await prisma.collectUkDriver.findUnique({ where: { id: parsed.data.driverId } });
  if (!driver) {
    next(new ApiError('NOT_FOUND', 'Driver not found', 404));
    return;
  }

  const route = await prisma.collectUkCollectionRoute.create({
    data: { driverId: parsed.data.driverId, routeDate: parsed.data.routeDate },
  });
  await recordAuditLog(driver.userId, 'COLLECT_UK_ROUTE_CREATED', { routeId: route.id, driverId: driver.id });

  res.status(201).json({ data: route });
});

// Companies with their negotiated rates -- the dispatch board's rate
// management view. Rates are Faira-set (B2B negotiation), never
// company-editable.
router.get('/companies', requireAdmin, async (_req: Request, res: Response) => {
  const companies = await prisma.collectUkCompany.findMany({
    include: { rate: true },
    orderBy: { createdAt: 'asc' },
  });
  res.status(200).json({
    data: companies.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      isActive: c.isActive,
      rate: c.rate
        ? {
            basePerStopPence: c.rate.basePerStopPence,
            tierSmallPence: c.rate.tierSmallPence,
            tierMediumPence: c.rate.tierMediumPence,
            tierLargePence: c.rate.tierLargePence,
            tierXlPence: c.rate.tierXlPence,
          }
        : null,
    })),
  });
});

// A company's complete booking history for the dispatch board -- every
// status, not just the operational lanes. Companies see their own list
// via the tenant-scoped portal; this is Faira's cross-tenant view.
router.get(
  '/companies/:companyId/bookings',
  requireAdmin,
  async (req: Request<{ companyId: string }>, res: Response, next: NextFunction) => {
    const company = await prisma.collectUkCompany.findUnique({ where: { id: req.params.companyId } });
    if (!company) {
      next(new ApiError('NOT_FOUND', 'Company not found', 404));
      return;
    }

    const bookings = await prisma.collectUkCollectionBooking.findMany({
      where: { companyId: company.id },
      include: { collectionWindow: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    res.status(200).json({
      data: {
        company: { id: company.id, name: company.name, slug: company.slug },
        bookings: bookings.map(b => ({
          id: b.id,
          reference: b.reference,
          status: b.status,
          customerName: b.customerName,
          customerContact: b.customerContact,
          collectionAddress: b.collectionAddress,
          collectionPostcode: b.collectionPostcode,
          parcelSizeTier: b.parcelSizeTier,
          numberOfParcels: b.numberOfParcels,
          itemTypes: b.itemTypes,
          itemTypeOther: b.itemTypeOther,
          vehicleType: b.vehicleType,
          collectionWindow: b.collectionWindow
            ? { startDate: b.collectionWindow.startDate, endDate: b.collectionWindow.endDate }
            : null,
          chargePence: b.chargePence,
          createdAt: b.createdAt,
        })),
      },
    });
  },
);

const rateSchema = z.object({
  basePerStopPence: z.number().int().min(0),
  tierSmallPence: z.number().int().min(0),
  tierMediumPence: z.number().int().min(0),
  tierLargePence: z.number().int().min(0),
  tierXlPence: z.number().int().min(0),
});

router.put(
  '/companies/:companyId/rate',
  requireAdmin,
  async (req: Request<{ companyId: string }>, res: Response, next: NextFunction) => {
    const parsed = rateSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const company = await prisma.collectUkCompany.findUnique({ where: { id: req.params.companyId } });
    if (!company) {
      next(new ApiError('NOT_FOUND', 'Company not found', 404));
      return;
    }

    const rate = await prisma.collectUkCompanyRate.upsert({
      where: { companyId: company.id },
      create: { companyId: company.id, ...parsed.data },
      update: parsed.data,
    });

    res.status(200).json({ data: { companyId: rate.companyId, ...parsed.data } });
  },
);

// Newest routes first -- the dispatch UI's route board.
router.get('/routes', requireAdmin, async (_req: Request, res: Response) => {
  const routes = await prisma.collectUkCollectionRoute.findMany({
    include: { driver: true, stops: { select: { status: true } } },
    orderBy: [{ routeDate: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });

  res.status(200).json({
    data: routes.map(r => ({
      id: r.id,
      routeDate: r.routeDate,
      status: r.status,
      totalDistanceMiles: r.totalDistanceMiles,
      driverId: r.driverId,
      driverVehicleReference: r.driver.vehicleReference,
      stopCount: r.stops.length,
      pendingStopCount: r.stops.filter(s => s.status === 'PENDING').length,
    })),
  });
});

router.get('/routes/:id', requireAdmin, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  const route = await prisma.collectUkCollectionRoute.findUnique({
    where: { id: req.params.id },
    include: {
      driver: true,
      stops: {
        orderBy: { sequenceOrder: 'asc' },
        include: { booking: { include: { company: true } } },
      },
    },
  });
  if (!route) {
    next(new ApiError('NOT_FOUND', 'Route not found', 404));
    return;
  }

  res.status(200).json({
    data: {
      id: route.id,
      driverId: route.driverId,
      routeDate: route.routeDate,
      status: route.status,
      totalDistanceMiles: route.totalDistanceMiles,
      stops: route.stops.map(s => ({
        id: s.id,
        sequenceOrder: s.sequenceOrder,
        status: s.status,
        bookingId: s.bookingId,
        bookingReference: s.booking.reference,
        companyName: s.booking.company.name,
        customerName: s.booking.customerName,
        collectionAddress: s.booking.collectionAddress,
        collectionPostcode: s.booking.collectionPostcode,
        distanceFromPreviousMiles: s.distanceFromPreviousMiles,
      })),
    },
  });
});

const optimiseRouteSchema = z.object({
  // Where the driver starts the round (e.g. the van's base) -- the first
  // leg's distance is measured from here when given; without it the
  // first stop is chosen arbitrarily and its leg distance is null.
  startPostcode: z.string().trim().min(1).max(20).optional(),
});

// Orders a PLANNED route's stops nearest-neighbour and records estimated
// per-leg + total mileage -- the cost side of every collection round
// (driver pay, per-collection pricing). Estimates only; see collectUkGeo.
router.post(
  '/routes/:id/optimise',
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = optimiseRouteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const route = await prisma.collectUkCollectionRoute.findUnique({
      where: { id: req.params.id },
      include: { driver: true, stops: { include: { booking: true } } },
    });
    if (!route) {
      next(new ApiError('NOT_FOUND', 'Route not found', 404));
      return;
    }
    if (route.status !== 'PLANNED') {
      next(new ApiError('INVALID_STATE', 'Only a route that has not started can be re-ordered', 409));
      return;
    }
    if (route.stops.length === 0) {
      next(new ApiError('EMPTY_ROUTE', 'This route has no stops to optimise', 409));
      return;
    }

    // Fill in coordinates for any booking that failed geocoding at
    // booking time (or predates geocoding entirely).
    const points = new Map<string, GeoPoint>();
    const failedPostcodes: string[] = [];
    for (const stop of route.stops) {
      const { booking } = stop;
      if (booking.collectionLatitude != null && booking.collectionLongitude != null) {
        points.set(stop.id, { latitude: booking.collectionLatitude, longitude: booking.collectionLongitude });
        continue;
      }
      const geo = await geocodePostcode(booking.collectionPostcode);
      if (!geo) {
        failedPostcodes.push(booking.collectionPostcode);
        continue;
      }
      points.set(stop.id, geo);
      await prisma.collectUkCollectionBooking.update({
        where: { id: booking.id },
        data: { collectionLatitude: geo.latitude, collectionLongitude: geo.longitude },
      });
    }
    if (failedPostcodes.length > 0) {
      next(
        new ApiError('UNGEOCODABLE_STOPS', 'Some collection postcodes could not be geocoded', 422, {
          postcodes: failedPostcodes,
        }),
      );
      return;
    }

    let start: GeoPoint | undefined;
    if (parsed.data.startPostcode) {
      const geo = await geocodePostcode(parsed.data.startPostcode);
      if (!geo) {
        next(new ApiError('UNGEOCODABLE_START', 'The start postcode could not be geocoded', 422));
        return;
      }
      start = geo;
    }

    const ordered = orderByNearestNeighbour(route.stops, s => points.get(s.id)!, start);

    const legs: (number | null)[] = ordered.map((stop, i) => {
      const from = i === 0 ? start : points.get(ordered[i - 1].id)!;
      if (!from) return null; // first stop with no start point given
      return estimatedRoadMiles(from, points.get(stop.id)!);
    });
    const totalDistanceMiles = Math.round(legs.reduce<number>((sum, d) => sum + (d ?? 0), 0) * 10) / 10;

    await prisma.$transaction(async tx => {
      for (let i = 0; i < ordered.length; i++) {
        await tx.collectUkCollectionStop.update({
          where: { id: ordered[i].id },
          data: { sequenceOrder: i, distanceFromPreviousMiles: legs[i] },
        });
      }
      await tx.collectUkCollectionRoute.update({
        where: { id: route.id },
        data: { totalDistanceMiles },
      });
    });

    await recordAuditLog(route.driver.userId, 'COLLECT_UK_ROUTE_OPTIMISED', {
      routeId: route.id,
      totalDistanceMiles,
      stopCount: ordered.length,
    });

    res.status(200).json({
      data: {
        id: route.id,
        totalDistanceMiles,
        stops: ordered.map((s, i) => ({
          id: s.id,
          sequenceOrder: i,
          bookingId: s.bookingId,
          bookingReference: s.booking.reference,
          customerName: s.booking.customerName,
          collectionPostcode: s.booking.collectionPostcode,
          distanceFromPreviousMiles: legs[i],
        })),
      },
    });
  },
);

// The dispatcher's queue -- every REQUESTED booking across every company,
// since one driver's route can (and typically will) carry bookings from
// several different companies in the same collection round.
router.get('/bookings/unscheduled', requireAdmin, async (_req: Request, res: Response) => {
  const bookings = await prisma.collectUkCollectionBooking.findMany({
    where: { status: 'REQUESTED' },
    include: { company: true, collectionWindow: true },
    orderBy: { createdAt: 'asc' },
  });

  res.status(200).json({
    data: bookings.map(b => ({
      id: b.id,
      reference: b.reference,
      companyName: b.company.name,
      customerName: b.customerName,
      collectionAddress: b.collectionAddress,
      collectionPostcode: b.collectionPostcode,
      preferredDate: b.preferredDate,
      collectionWindow: b.collectionWindow
        ? { startDate: b.collectionWindow.startDate, endDate: b.collectionWindow.endDate }
        : null,
      parcelSizeTier: b.parcelSizeTier,
      numberOfParcels: b.numberOfParcels,
      itemTypes: b.itemTypes,
      itemTypeOther: b.itemTypeOther,
      vehicleType: b.vehicleType,
    })),
  });
});

// Collections the driver couldn't make -- each needs a dispatcher
// decision: requeue for a fresh route, or leave for the company to
// resolve with the customer.
router.get('/bookings/failed', requireAdmin, async (_req: Request, res: Response) => {
  const bookings = await prisma.collectUkCollectionBooking.findMany({
    where: { status: 'UNABLE_TO_COLLECT' },
    include: { company: true, stop: { select: { failureReason: true, completedAt: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  res.status(200).json({
    data: bookings.map(b => ({
      id: b.id,
      reference: b.reference,
      companyName: b.company.name,
      customerName: b.customerName,
      collectionAddress: b.collectionAddress,
      collectionPostcode: b.collectionPostcode,
      failureReason: b.stop?.failureReason ?? null,
      failedAt: b.stop?.completedAt ?? null,
    })),
  });
});

// Puts a failed collection back in the unscheduled queue. The resolved
// stop is deleted so a fresh route assignment is possible (stop.bookingId
// is unique -- one live stop per booking, ever); its failure reason
// survives in the audit log and the customer is told a new date is coming.
router.post('/bookings/:id/requeue', requireAdmin, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  const booking = await prisma.collectUkCollectionBooking.findUnique({
    where: { id: req.params.id },
    include: { stop: { include: { driver: true } } },
  });
  if (!booking) {
    next(new ApiError('NOT_FOUND', 'Booking not found', 404));
    return;
  }
  if (booking.status !== 'UNABLE_TO_COLLECT') {
    next(new ApiError('INVALID_STATE', 'Only a failed collection can be requeued', 409));
    return;
  }

  try {
    await prisma.$transaction(async tx => {
      const updated = await tx.collectUkCollectionBooking.updateMany({
        where: { id: booking.id, status: 'UNABLE_TO_COLLECT' },
        data: { status: 'REQUESTED' },
      });
      if (updated.count === 0) throw new BookingTransitionConflict();

      if (booking.stop) {
        await tx.collectUkCollectionStop.delete({ where: { id: booking.stop.id } });
      }
    });
  } catch (err) {
    if (err instanceof BookingTransitionConflict) {
      next(new ApiError('INVALID_STATE', 'Only a failed collection can be requeued', 409));
      return;
    }
    throw err;
  }

  if (booking.stop) {
    await recordAuditLog(booking.stop.driver.userId, 'COLLECT_UK_BOOKING_REQUEUED', {
      bookingId: booking.id,
      previousFailureReason: booking.stop.failureReason,
    });
  }
  await notifyCollectionWillBeRescheduled(booking.id);

  res.status(200).json({ data: { id: booking.id, status: 'REQUESTED' } });
});

const assignStopSchema = z.object({
  bookingId: z.string().uuid(),
  sequenceOrder: z.number().int().nonnegative().optional(),
});

router.post(
  '/routes/:id/stops',
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = assignStopSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const route = await prisma.collectUkCollectionRoute.findUnique({
      where: { id: req.params.id },
      include: { driver: true },
    });
    if (!route) {
      next(new ApiError('NOT_FOUND', 'Route not found', 404));
      return;
    }

    const booking = await prisma.collectUkCollectionBooking.findUnique({ where: { id: parsed.data.bookingId } });
    if (!booking) {
      next(new ApiError('NOT_FOUND', 'Booking not found', 404));
      return;
    }
    if (booking.status !== 'REQUESTED') {
      next(new ApiError('INVALID_STATE', 'This booking is not awaiting scheduling', 409));
      return;
    }

    let sequenceOrder = parsed.data.sequenceOrder;
    if (sequenceOrder === undefined) {
      const lastStop = await prisma.collectUkCollectionStop.findFirst({
        where: { routeId: route.id },
        orderBy: { sequenceOrder: 'desc' },
      });
      sequenceOrder = (lastStop?.sequenceOrder ?? -1) + 1;
    }

    try {
      const stop = await prisma.$transaction(async tx => {
        const updateResult = await tx.collectUkCollectionBooking.updateMany({
          where: { id: booking.id, status: 'REQUESTED' },
          data: { status: 'DRIVER_ASSIGNED' },
        });
        if (updateResult.count === 0) {
          throw new BookingTransitionConflict();
        }

        return tx.collectUkCollectionStop.create({
          data: {
            routeId: route.id,
            bookingId: booking.id,
            driverId: route.driverId,
            sequenceOrder: sequenceOrder!,
          },
        });
      });

      await recordAuditLog(route.driver.userId, 'COLLECT_UK_STOP_ASSIGNED', { routeId: route.id, bookingId: booking.id });
      await notifyCollectionScheduled(booking.id, route.routeDate);
      res.status(201).json({ data: stop });
    } catch (err) {
      if (err instanceof BookingTransitionConflict) {
        next(new ApiError('INVALID_STATE', 'This booking is not awaiting scheduling', 409));
        return;
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        next(new ApiError('ALREADY_ASSIGNED', 'This booking has already been assigned to a route', 409));
        return;
      }
      throw err;
    }
  },
);

export default router;
