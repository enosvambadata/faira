import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../prisma';
import { ApiError } from '../errors/ApiError';
import { generateBookingReference } from '../services/collectUkBookingReference';
import { generateBookingTrackingToken, verifyBookingTrackingToken } from '../lib/collectUkBookingToken';
import { collectUkBuyerStatus } from '../lib/collectUkBookingStatus';
import { notifyBookingConfirmed, notifyBookingCancelled } from '../services/collectUkNotifications';
import { geocodePostcode } from '../lib/collectUkGeo';
import { phoneSchema } from './auth';
import { logger } from '../logger';

const router = Router();

// Public endpoints -- no requireAuth anywhere in this file. Rate-limited
// against abuse the same way Fulfilment's buyer tracking is (SCRUM-143):
// this isn't a login form, just lookup/creation, so a generous-but-bounded
// limit is enough to blunt automated spam/scraping without blocking a
// real customer.
// Exported so tests can reset the shared per-process window between
// cases -- the limiter is module-level state that would otherwise leak
// request counts across every createApp() instance in a test file.
export const publicRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });
  },
});

// The company's next open collection window -- "open" meaning it hasn't
// ended yet. Customers book into this window; when none exists the
// booking queues windowless and the customer is told their collection
// week will be confirmed later.
async function findNextWindow(companyId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return prisma.collectUkCollectionWindow.findFirst({
    where: { companyId, endDate: { gte: today } },
    orderBy: { startDate: 'asc' },
  });
}

router.get('/book/:companySlug', publicRateLimiter, async (req: Request<{ companySlug: string }>, res: Response, next: NextFunction) => {
  const company = await prisma.collectUkCompany.findUnique({ where: { slug: req.params.companySlug } });
  if (!company || !company.isActive) {
    next(new ApiError('NOT_FOUND', 'No such company', 404));
    return;
  }

  const nextWindow = await findNextWindow(company.id);

  res.status(200).json({
    data: {
      id: company.id,
      name: company.name,
      countriesServed: company.countriesServed,
      nextWindow: nextWindow ? { startDate: nextWindow.startDate, endDate: nextWindow.endDate } : null,
    },
  });
});

const createBookingSchema = z
  .object({
    customerName: z.string().trim().min(1).max(200),
    // SMS is the only channel to guest customers, so the contact MUST be a
    // real phone -- a name/email/typo would silently swallow every
    // notification (sendSms is best-effort). Normalise the separators the
    // booking form invites ("+44 7700 900000") then validate E.164 via auth's
    // shared phoneSchema, so the stored value is always deliverable.
    customerContact: z
      .string()
      .trim()
      .transform(s => s.replace(/[\s().-]/g, ''))
      .pipe(phoneSchema),
    destinationCountry: z.string().trim().min(1).max(100),
    collectionAddress: z.string().trim().min(1).max(300),
    collectionPostcode: z.string().trim().min(1).max(20),
    parcelSizeTier: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE']),
    numberOfParcels: z.number().int().min(1).max(50).default(1),
    itemTypes: z.array(z.enum(['DRUM', 'SUITCASE', 'FRIDGE', 'STOVE', 'PALLET', 'VEHICLE', 'OTHER'])).min(1),
    itemTypeOther: z.string().trim().min(1).max(200).optional(),
    vehicleType: z.enum(['SEDAN', 'SUV', 'TRUCK']).optional(),
    parcelWeightKg: z.number().positive().optional(),
    specialInstructions: z.string().trim().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.itemTypes.includes('OTHER') && !data.itemTypeOther) {
      ctx.addIssue({ code: 'custom', path: ['itemTypeOther'], message: 'Please describe the other item' });
    }
    if (data.itemTypes.includes('VEHICLE') && !data.vehicleType) {
      ctx.addIssue({ code: 'custom', path: ['vehicleType'], message: 'Please choose the vehicle type' });
    }
  });

router.post('/book/:companySlug', publicRateLimiter, async (req: Request<{ companySlug: string }>, res: Response, next: NextFunction) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const company = await prisma.collectUkCompany.findUnique({ where: { slug: req.params.companySlug } });
  if (!company || !company.isActive) {
    next(new ApiError('NOT_FOUND', 'No such company', 404));
    return;
  }

  if (!company.countriesServed.includes(parsed.data.destinationCountry)) {
    next(new ApiError('COUNTRY_NOT_SERVED', 'This company does not serve that destination country', 400));
    return;
  }

  const warehouse = await prisma.collectUkCompanyWarehouse.findFirst({
    where: { companyId: company.id, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!warehouse) {
    next(new ApiError('NO_WAREHOUSE_CONFIGURED', 'This company has no active warehouse to deliver to yet', 409));
    return;
  }

  // Customers never pick dates -- the booking attaches to the company's
  // next open collection window (or queues windowless when none exists,
  // to be attached when the company declares one).
  const nextWindow = await findNextWindow(company.id);

  // Best-effort, resolved before the transaction (no network calls inside
  // a DB transaction) -- a geocoding outage must never block a booking;
  // the route optimiser retries missing coordinates later.
  const geo = await geocodePostcode(parsed.data.collectionPostcode);

  const booking = await prisma.$transaction(async tx => {
    const reference = await generateBookingReference(tx, company.id);
    return tx.collectUkCollectionBooking.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse.id,
        reference,
        customerName: parsed.data.customerName,
        customerContact: parsed.data.customerContact,
        destinationCountry: parsed.data.destinationCountry,
        collectionAddress: parsed.data.collectionAddress,
        collectionPostcode: parsed.data.collectionPostcode,
        collectionWindowId: nextWindow?.id,
        parcelSizeTier: parsed.data.parcelSizeTier,
        numberOfParcels: parsed.data.numberOfParcels,
        itemTypes: Array.from(new Set(parsed.data.itemTypes)),
        itemTypeOther: parsed.data.itemTypes.includes('OTHER') ? parsed.data.itemTypeOther : undefined,
        vehicleType: parsed.data.itemTypes.includes('VEHICLE') ? parsed.data.vehicleType : undefined,
        parcelWeightKg: parsed.data.parcelWeightKg,
        specialInstructions: parsed.data.specialInstructions,
        collectionLatitude: geo?.latitude,
        collectionLongitude: geo?.longitude,
      },
    });
  });

  await notifyBookingConfirmed(booking.id);

  const token = generateBookingTrackingToken(booking.id);
  const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3100';

  res.status(201).json({
    data: { reference: booking.reference, trackingUrl: `${webAppUrl}/collect-uk/track/${token}` },
  });
});

router.get('/tracking/:token', publicRateLimiter, async (req: Request<{ token: string }>, res: Response, next: NextFunction) => {
  const verified = verifyBookingTrackingToken(req.params.token);
  if (!verified) {
    next(new ApiError('INVALID_TOKEN', 'This tracking link is invalid or has expired', 404));
    return;
  }

  const booking = await prisma.collectUkCollectionBooking.findUnique({
    where: { id: verified.bookingId },
    include: { company: true, collectionWindow: true },
  });
  if (!booking) {
    next(new ApiError('INVALID_TOKEN', 'This tracking link is invalid or has expired', 404));
    return;
  }

  res.status(200).json({
    data: {
      reference: booking.reference,
      status: collectUkBuyerStatus(booking.status),
      companyName: booking.company.name,
      destinationCountry: booking.destinationCountry,
      collectionAddress: booking.collectionAddress,
      collectionPostcode: booking.collectionPostcode,
      preferredDate: booking.preferredDate,
      collectionWindow: booking.collectionWindow
        ? { startDate: booking.collectionWindow.startDate, endDate: booking.collectionWindow.endDate }
        : null,
    },
  });
});

// Guest self-service cancellation via the signed tracking token -- only
// while the booking is still REQUESTED. Once a driver is assigned the
// round is planned around it, so later cancellations go through the
// company (which releases the stop properly).
router.post('/tracking/:token/cancel', publicRateLimiter, async (req: Request<{ token: string }>, res: Response, next: NextFunction) => {
  const verified = verifyBookingTrackingToken(req.params.token);
  if (!verified) {
    next(new ApiError('INVALID_TOKEN', 'This tracking link is invalid or has expired', 404));
    return;
  }

  const booking = await prisma.collectUkCollectionBooking.findUnique({ where: { id: verified.bookingId } });
  if (!booking) {
    next(new ApiError('INVALID_TOKEN', 'This tracking link is invalid or has expired', 404));
    return;
  }
  if (booking.status !== 'REQUESTED') {
    next(
      new ApiError(
        'INVALID_STATE',
        'This booking is already being processed -- please contact your shipping company to cancel',
        409,
      ),
    );
    return;
  }

  const updated = await prisma.collectUkCollectionBooking.updateMany({
    where: { id: booking.id, status: 'REQUESTED' },
    data: { status: 'CANCELLED' },
  });
  if (updated.count === 0) {
    next(new ApiError('INVALID_STATE', 'This booking is already being processed', 409));
    return;
  }

  // Guests have no User row, so this can't go through recordAuditLog
  // (AuditLog.userId is a users FK) -- structured log instead.
  logger.info({ bookingId: booking.id }, 'collect uk booking cancelled by customer');
  await notifyBookingCancelled(booking.id);

  res.status(200).json({ data: { reference: booking.reference, status: collectUkBuyerStatus('CANCELLED') } });
});

export default router;
