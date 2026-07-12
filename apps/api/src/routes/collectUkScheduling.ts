import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requireAdmin } from '../middleware/requireAdmin';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';

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
      })),
    },
  });
});

// The dispatcher's queue -- every REQUESTED booking across every company,
// since one driver's route can (and typically will) carry bookings from
// several different companies in the same collection round.
router.get('/bookings/unscheduled', requireAdmin, async (_req: Request, res: Response) => {
  const bookings = await prisma.collectUkCollectionBooking.findMany({
    where: { status: 'REQUESTED' },
    include: { company: true },
    orderBy: { preferredDate: 'asc' },
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
      parcelSizeTier: b.parcelSizeTier,
    })),
  });
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
