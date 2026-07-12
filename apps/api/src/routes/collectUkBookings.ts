import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../prisma';
import { ApiError } from '../errors/ApiError';
import { generateBookingReference } from '../services/collectUkBookingReference';
import { generateBookingTrackingToken, verifyBookingTrackingToken } from '../lib/collectUkBookingToken';
import { collectUkBuyerStatus } from '../lib/collectUkBookingStatus';
import { notifyBookingConfirmed } from '../services/collectUkNotifications';

const router = Router();

// Public endpoints -- no requireAuth anywhere in this file. Rate-limited
// against abuse the same way Fulfilment's buyer tracking is (SCRUM-143):
// this isn't a login form, just lookup/creation, so a generous-but-bounded
// limit is enough to blunt automated spam/scraping without blocking a
// real customer.
const publicRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });
  },
});

router.get('/book/:companySlug', publicRateLimiter, async (req: Request<{ companySlug: string }>, res: Response, next: NextFunction) => {
  const company = await prisma.collectUkCompany.findUnique({ where: { slug: req.params.companySlug } });
  if (!company || !company.isActive) {
    next(new ApiError('NOT_FOUND', 'No such company', 404));
    return;
  }

  res.status(200).json({
    data: { id: company.id, name: company.name, countriesServed: company.countriesServed },
  });
});

const createBookingSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerContact: z.string().trim().min(1).max(50),
  destinationCountry: z.string().trim().min(1).max(100),
  collectionAddress: z.string().trim().min(1).max(300),
  collectionPostcode: z.string().trim().min(1).max(20),
  preferredDate: z.coerce.date(),
  parcelSizeTier: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE']),
  parcelWeightKg: z.number().positive().optional(),
  specialInstructions: z.string().trim().max(1000).optional(),
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
        preferredDate: parsed.data.preferredDate,
        parcelSizeTier: parsed.data.parcelSizeTier,
        parcelWeightKg: parsed.data.parcelWeightKg,
        specialInstructions: parsed.data.specialInstructions,
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
    include: { company: true },
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
    },
  });
});

export default router;
