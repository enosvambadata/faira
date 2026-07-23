import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma';
import { ApiError } from '../errors/ApiError';
import { verifyTrackingToken } from '../lib/trackingToken';
import { buyerDisplayStatus } from '../lib/buyerTrackingStatus';

const router = Router();

// Public and unauthenticated (buyers have no account) -- rate-limited per
// IP against token brute-forcing, per the ticket's explicit requirement.
// A fixed window is enough here: this isn't a login form, just a lookup,
// and 20/15min is generous for a real buyer checking their own parcel while
// still blunting automated guessing.
const trackingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many tracking requests. Please try again later.' },
    });
  },
});

router.get(
  '/:token',
  trackingRateLimiter,
  async (req: Request<{ token: string }>, res: Response, next: NextFunction) => {
    const verified = verifyTrackingToken(req.params.token);
    if (!verified) {
      next(new ApiError('INVALID_TOKEN', 'This tracking link is invalid or has expired', 404));
      return;
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: verified.shipmentId },
      include: { originHub: true, destinationHub: true },
    });
    if (!shipment) {
      next(new ApiError('INVALID_TOKEN', 'This tracking link is invalid or has expired', 404));
      return;
    }

    // Deliberately excludes reference, seller name/phone, and declared
    // value -- the buyer only ever had this link, never the seller's
    // identifying details, per the ticket's PII-minimization requirement.
    res.status(200).json({
      data: {
        status: buyerDisplayStatus(shipment.status),
        originHub: { name: shipment.originHub.name, city: shipment.originHub.city },
        destinationHub: {
          name: shipment.destinationHub.name,
          city: shipment.destinationHub.city,
          address: shipment.destinationHub.address,
          openingHours: shipment.destinationHub.openingHours,
        },
        estimatedCollectionDate: shipment.collectionWindowEndsAt,
        paymentComplete: shipment.status !== 'AWAITING_PAYMENT' && shipment.status !== 'DRAFT',
      },
    });
  },
);

export default router;
