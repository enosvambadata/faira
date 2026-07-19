import { Router, Request, Response, NextFunction } from 'express';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { ApiError } from '../errors/ApiError';
import {
  initiateWebPayment,
  initiateMobilePayment,
  pollPaymentStatus,
  isPaidStatus,
  MobileMoneyMethod,
} from '../lib/paynow';
import { confirmOrderPayment } from '../services/paymentConfirmation';
import { releaseEscrowFunds } from '../services/escrowRelease';
import { calculateDeliveryFee } from '../services/deliveryFee';
import { notifyOrderStatusChange } from '../services/orderNotifications';
import { getOrderCompletedAt, isRevealed } from '../services/orderReviews';
import { orderViewerRole, deliveryViewFor } from '../services/orderView';
import { Prisma, OrderStatus } from '@prisma/client';
import { canTransition, displayStatus } from '../lib/orderStateMachine';
import { signDisputeEvidenceUpload } from '../lib/cloudinary';

const router = Router();

interface TimelineEntry {
  status: OrderStatus;
  label: string;
  at: Date;
}

// Reconstructed from timestamps that already exist elsewhere (payment
// confirmation, shipping, escrow release, dispute records) rather than a
// dedicated status-history table — every status this app can currently
// reach already has an accurate timestamp source somewhere, so a new
// table (and threading writes through every transition call site across
// SCRUM-53/55/56/57/60) would just duplicate data that's already correct.
function buildOrderTimeline(order: {
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  shippedAt: Date | null;
  payments: { confirmedAt: Date | null }[];
  escrowEntries: { type: string; createdAt: Date }[];
  disputes: { createdAt: Date; resolvedAt: Date | null }[];
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [{ status: 'PENDING', label: displayStatus('PENDING'), at: order.createdAt }];

  const confirmedAt = order.payments.find(p => p.confirmedAt)?.confirmedAt;
  if (confirmedAt) {
    entries.push({ status: 'PAID', label: displayStatus('PAID'), at: confirmedAt });
  }

  if (order.shippedAt) {
    entries.push({ status: 'SHIPPED', label: displayStatus('SHIPPED'), at: order.shippedAt });
  }

  const latestDispute = order.disputes[0];
  if (latestDispute) {
    entries.push({ status: 'DISPUTED', label: displayStatus('DISPUTED'), at: latestDispute.createdAt });
  }

  if (order.status === 'COMPLETED') {
    const releasedAt = order.escrowEntries.find(e => e.type === 'RELEASE')?.createdAt;
    entries.push({ status: 'COMPLETED', label: displayStatus('COMPLETED'), at: releasedAt ?? order.updatedAt });
  } else if (order.status === 'REFUNDED') {
    entries.push({ status: 'REFUNDED', label: displayStatus('REFUNDED'), at: latestDispute?.resolvedAt ?? order.updatedAt });
  } else if (order.status === 'CANCELLED') {
    entries.push({ status: 'CANCELLED', label: displayStatus('CANCELLED'), at: order.updatedAt });
  }

  return entries;
}

const raiseDisputeSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  evidenceImageUrls: z.array(z.string().url()).min(1).max(6),
});

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

const createOrderSchema = z.object({
  listingId: z.string().uuid(),
  deliveryOption: z.string().min(1),
  // Structured delivery details (SCRUM-259). The buyer provides their contact
  // through this access-controlled field — not the redacted chat — and it's
  // gated per (viewer, status, method) on the way back out. `method` drives the
  // seller-visibility decision table and is known from PAID.
  delivery: z
    .object({
      method: z.enum(['MEETUP', 'COURIER', 'POSTAL']),
      recipientName: z.string().trim().min(1).max(120),
      phone: z.string().trim().min(9).max(20),
      addressLine: z.string().trim().max(200).optional(),
      suburb: z.string().trim().max(120).optional(),
      city: z.string().trim().min(1).max(120),
    })
    .refine(d => d.method === 'MEETUP' || !!d.addressLine, {
      message: 'A delivery address is required for courier and postal orders',
      path: ['addressLine'],
    }),
});

const shipOrderSchema = z
  .object({
    shippingMethod: z.enum(['MEETUP', 'COURIER', 'POSTAL']),
    trackingReference: z.string().trim().min(1).max(200).optional(),
  })
  .refine(data => data.shippingMethod === 'MEETUP' || !!data.trackingReference, {
    message: 'trackingReference is required for courier and postal shipping',
    path: ['trackingReference'],
  });

const payOrderSchema = z
  .object({
    method: z.enum(['ECOCASH', 'ONEMONEY', 'ZIMSWITCH', 'CASH_ON_DELIVERY']),
    email: z.email().optional(),
    phone: z.string().min(9).optional(),
  })
  .refine(data => data.method === 'CASH_ON_DELIVERY' || !!data.email, {
    message: 'email is required for online payment methods',
    path: ['email'],
  })
  .refine(data => !['ECOCASH', 'ONEMONEY'].includes(data.method) || !!data.phone, {
    message: 'phone is required for EcoCash and OneMoney payments',
    path: ['phone'],
  });

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const buyerId = req.userId!;
  const listing = await prisma.listing.findUnique({ where: { id: parsed.data.listingId } });

  if (!listing || listing.deletedAt) {
    next(new ApiError('NOT_FOUND', 'Listing not found', 404));
    return;
  }
  if (listing.status !== 'ACTIVE') {
    next(new ApiError('LISTING_UNAVAILABLE', 'This listing is no longer available', 409));
    return;
  }
  if (listing.sellerId === buyerId) {
    next(new ApiError('FORBIDDEN', 'You cannot buy your own listing', 403));
    return;
  }
  if (!listing.deliveryOptions.includes(parsed.data.deliveryOption)) {
    next(new ApiError('VALIDATION_ERROR', 'deliveryOption is not offered on this listing', 400));
    return;
  }

  const { delivery } = parsed.data;
  // Marketplace-local handover code (SCRUM-260): a 6-digit code the buyer shows
  // the seller at an in-person handover to release escrow without swapping phone
  // numbers. Stored per order; only ever disclosed back to the buyer.
  const collectionCode = String(randomInt(100000, 1000000));
  const order = await prisma.order.create({
    data: {
      listingId: listing.id,
      buyerId,
      priceAtPurchase: listing.price,
      deliveryOption: parsed.data.deliveryOption,
      deliveryMethod: delivery.method,
      deliveryRecipientName: delivery.recipientName,
      deliveryPhone: delivery.phone,
      deliveryAddressLine: delivery.addressLine ?? null,
      deliverySuburb: delivery.suburb ?? null,
      deliveryCity: delivery.city,
      collectionCode,
      status: 'PENDING',
    },
  });

  res.status(201).json({
    data: {
      id: order.id,
      listingId: order.listingId,
      priceAtPurchase: order.priceAtPurchase.toString(),
      deliveryOption: order.deliveryOption,
      status: order.status,
      // Echo the buyer's own details back (they just entered them), with the
      // Faira reference they can quote instead of sharing personal contact.
      delivery: deliveryViewFor({ ...order, listing: { sellerId: listing.sellerId } }, 'buyer'),
    },
  });
});

function orderListItem(order: {
  id: string;
  priceAtPurchase: { toString(): string };
  status: OrderStatus;
  createdAt: Date;
  listing: { id: string; title: string; imageUrls: string[] };
}) {
  return {
    id: order.id,
    priceAtPurchase: order.priceAtPurchase.toString(),
    status: order.status,
    displayStatus: displayStatus(order.status),
    createdAt: order.createdAt,
    listing: {
      id: order.listing.id,
      title: order.listing.title,
      imageUrl: order.listing.imageUrls[0] ?? null,
    },
  };
}

// Registered before /:orderId so "purchases"/"sales" aren't swallowed as
// an :orderId path param — Express matches routes in registration order,
// not by specificity.
router.get('/purchases', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const purchases = await prisma.order.findMany({
    where: { buyerId: req.userId! },
    orderBy: { createdAt: 'desc' },
    include: { listing: { select: { id: true, title: true, imageUrls: true } } },
  });

  res.status(200).json({ data: purchases.map(orderListItem) });
});

router.get('/sales', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const sales = await prisma.order.findMany({
    where: { listing: { sellerId: req.userId! } },
    orderBy: { createdAt: 'desc' },
    include: { listing: { select: { id: true, title: true, imageUrls: true } } },
  });

  res.status(200).json({ data: sales.map(orderListItem) });
});

const deliveryFeeQuerySchema = z.object({
  listingId: z.string().uuid(),
  deliveryOption: z.string().min(1),
});

// The buyer's own profile city (set at onboarding, SCRUM-27) stands in for
// a delivery destination — there's no separate "delivery address" concept
// in this app, and adding one wasn't part of what this ticket asked for.
router.get(
  '/delivery-fee',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const parsed = deliveryFeeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid query params', 400, z.flattenError(parsed.error)));
      return;
    }

    const [listing, buyer] = await Promise.all([
      prisma.listing.findUnique({ where: { id: parsed.data.listingId }, select: { weightTier: true } }),
      prisma.user.findUnique({ where: { id: req.userId! }, select: { city: true } }),
    ]);

    if (!listing) {
      next(new ApiError('NOT_FOUND', 'Listing not found', 404));
      return;
    }
    if (!buyer?.city) {
      next(new ApiError('VALIDATION_ERROR', 'Set your city in your profile to get a delivery quote', 400));
      return;
    }

    const fee = await calculateDeliveryFee(buyer.city, listing.weightTier, parsed.data.deliveryOption);
    res.status(200).json({ data: { fee } });
  },
);

router.get(
  '/:orderId',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ orderId: string }>, res: Response, next: NextFunction) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: {
        listing: { select: { id: true, title: true, imageUrls: true, sellerId: true } },
        escrowEntries: { select: { type: true, createdAt: true } },
        payments: { orderBy: { createdAt: 'desc' }, select: { method: true, confirmedAt: true } },
        disputes: { orderBy: { createdAt: 'desc' }, select: { createdAt: true, resolvedAt: true } },
      },
    });

    if (!order) {
      next(new ApiError('NOT_FOUND', 'Order not found', 404));
      return;
    }
    const role = orderViewerRole(order, req.userId!);
    if (!role) {
      next(new ApiError('FORBIDDEN', 'Not part of this order', 403));
      return;
    }

    res.status(200).json({
      data: {
        id: order.id,
        buyerId: order.buyerId,
        sellerId: order.listing.sellerId,
        viewerRole: role,
        priceAtPurchase: order.priceAtPurchase.toString(),
        deliveryOption: order.deliveryOption,
        // Gated per (viewer, status, method): the seller sees nothing before
        // payment, then only the fields the delivery method requires. Null when
        // nothing is disclosed. See services/orderView.
        delivery: deliveryViewFor(order, role),
        status: order.status,
        displayStatus: displayStatus(order.status),
        // Filled in once the seller ships (SCRUM-61) — null until then.
        shippingMethod: order.shippingMethod,
        trackingReference: order.trackingReference,
        shippedAt: order.shippedAt,
        paymentMethod: order.payments[0]?.method ?? null,
        // Mirrors the /mark-collected route's own eligibility check so the
        // seller's client can show that action without duplicating it
        // incorrectly. Cash-on-delivery orders stay PENDING (not PAID) the
        // whole time — payment and delivery are the same physical event —
        // so eligibility is "can this status reach COMPLETED", not "is PAID".
        canMarkCollected:
          order.listing.sellerId === req.userId &&
          order.payments[0]?.method === 'CASH_ON_DELIVERY' &&
          canTransition(order.status, 'COMPLETED'),
        // True once the seller's escrow HOLD for this order has been
        // released (SCRUM-55) — while PAID it's held, not yet payable.
        sellerPayoutEligible: order.escrowEntries.some(e => e.type === 'RELEASE'),
        timeline: buildOrderTimeline(order),
        listing: {
          id: order.listing.id,
          title: order.listing.title,
          imageUrl: order.listing.imageUrls[0] ?? null,
        },
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  },
);

router.post('/:orderId/pay', requireAuth, async (req: AuthenticatedRequest & Request<{ orderId: string }>, res: Response, next: NextFunction) => {
  const parsed = payOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    include: { listing: true },
  });

  if (!order) {
    next(new ApiError('NOT_FOUND', 'Order not found', 404));
    return;
  }
  if (order.buyerId !== req.userId) {
    next(new ApiError('FORBIDDEN', 'Not your order', 403));
    return;
  }
  if (order.status !== 'PENDING') {
    next(new ApiError('INVALID_STATE', 'Order is not awaiting payment', 409));
    return;
  }

  const { method, email, phone } = parsed.data;
  const amount = Number(order.priceAtPurchase);

  if (method === 'CASH_ON_DELIVERY') {
    const sellerProfile = await prisma.sellerProfile.findUnique({ where: { userId: order.listing.sellerId } });
    if (!sellerProfile?.codEnabled) {
      next(new ApiError('COD_NOT_AVAILABLE', 'Cash on delivery is not available for this seller', 400));
      return;
    }

    const payment = await prisma.payment.create({
      data: { orderId: order.id, method, amount: order.priceAtPurchase, status: 'PENDING' },
    });

    res.status(200).json({
      data: {
        paymentId: payment.id,
        redirectUrl: null,
        instructions: 'Pay in cash when your order is delivered.',
      },
    });
    return;
  }

  const payment = await prisma.payment.create({
    data: { orderId: order.id, method, amount: order.priceAtPurchase, status: 'PENDING' },
  });

  let result;
  try {
    result =
      method === 'ZIMSWITCH'
        ? await initiateWebPayment(payment.id, email!, amount, order.listing.title)
        : await initiateMobilePayment(
            payment.id,
            email!,
            amount,
            order.listing.title,
            phone!,
            method.toLowerCase() as MobileMoneyMethod,
          );
  } catch {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    next(new ApiError('PAYNOW_ERROR', 'Failed to initiate payment with Paynow', 502));
    return;
  }

  if (!result.success) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    next(new ApiError('PAYNOW_ERROR', String(result.error ?? 'Paynow rejected the payment request'), 502));
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { paynowPollUrl: String(result.pollUrl) },
  });

  res.status(200).json({
    data: {
      paymentId: payment.id,
      redirectUrl: result.hasRedirect ? String(result.redirectUrl) : null,
      instructions: result.instructions ? String(result.instructions) : null,
    },
  });
});

router.get(
  '/:orderId/payment-status',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ orderId: string }>, res: Response, next: NextFunction) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { listing: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!order) {
      next(new ApiError('NOT_FOUND', 'Order not found', 404));
      return;
    }
    if (order.buyerId !== req.userId && order.listing.sellerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not part of this order', 403));
      return;
    }

    const payment = order.payments[0];

    if (payment?.status === 'PENDING' && payment.paynowPollUrl) {
      const polled = await pollPaymentStatus(payment.paynowPollUrl);
      const status = String(polled.status).toLowerCase();

      if (isPaidStatus(status)) {
        await confirmOrderPayment(order.id, null);
      } else if (status === 'cancelled') {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      }
    }

    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    res.status(200).json({
      data: {
        orderStatus: fresh!.status,
        paymentStatus: fresh!.payments[0]?.status ?? null,
      },
    });
  },
);

// Optional for now — PAID orders can still skip straight to COMPLETED via
// confirm-delivery/auto-release without ever calling this (SCRUM-56's cash
// on delivery has its own separate path entirely, mark-collected). A
// seller who does ship gives the buyer a real method + tracking reference
// to see on the order detail screen; one who doesn't just leaves those
// fields null. Making this mandatory is a bigger behavior change to
// SCRUM-53/55/56's already-shipped flows than this ticket asked for.
router.post(
  '/:orderId/ship',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ orderId: string }>, res: Response, next: NextFunction) => {
    const parsed = shipOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { listing: true },
    });

    if (!order) {
      next(new ApiError('NOT_FOUND', 'Order not found', 404));
      return;
    }
    if (order.listing.sellerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not your listing', 403));
      return;
    }
    if (!canTransition(order.status, 'SHIPPED')) {
      next(new ApiError('INVALID_STATE', 'Order is not awaiting shipment', 409));
      return;
    }

    const { shippingMethod, trackingReference } = parsed.data;
    const resolvedTrackingReference = shippingMethod === 'MEETUP' ? null : (trackingReference ?? null);

    const { count } = await prisma.order.updateMany({
      where: { id: order.id, status: order.status },
      data: {
        status: 'SHIPPED',
        shippingMethod,
        trackingReference: resolvedTrackingReference,
        shippedAt: new Date(),
      },
    });
    if (count === 0) {
      next(new ApiError('INVALID_STATE', 'Order is not awaiting shipment', 409));
      return;
    }

    await notifyOrderStatusChange(order.id, 'SHIPPED');

    res.status(200).json({
      data: {
        id: order.id,
        status: 'SHIPPED',
        displayStatus: displayStatus('SHIPPED'),
        shippingMethod,
        trackingReference: resolvedTrackingReference,
      },
    });
  },
);

router.post(
  '/:orderId/confirm-delivery',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ orderId: string }>, res: Response, next: NextFunction) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });

    if (!order) {
      next(new ApiError('NOT_FOUND', 'Order not found', 404));
      return;
    }
    if (order.buyerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not your order', 403));
      return;
    }

    const { released } = await releaseEscrowFunds(order.id);
    if (!released) {
      next(new ApiError('INVALID_STATE', 'Order is not awaiting delivery confirmation', 409));
      return;
    }

    res.status(200).json({ data: { id: order.id, status: 'COMPLETED', displayStatus: displayStatus('COMPLETED') } });
  },
);

const confirmHandoverSchema = z.object({ code: z.string().trim().min(4).max(10) });
const MAX_HANDOVER_ATTEMPTS = 5;

// Collection-code handover (SCRUM-260): for an in-person MEET-UP, the seller
// enters the code the buyer shows them. On match it releases escrow through the
// same atomic path as every other release — so neither party has to exchange a
// phone number, and there's a real handover signal instead of only the timer.
router.post(
  '/:orderId/confirm-handover',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ orderId: string }>, res: Response, next: NextFunction) => {
    const parsed = confirmHandoverSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Enter the code the buyer is showing you', 400, z.flattenError(parsed.error)));
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { listing: { select: { sellerId: true } } },
    });

    if (!order) {
      next(new ApiError('NOT_FOUND', 'Order not found', 404));
      return;
    }
    if (order.listing.sellerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Only the seller confirms a handover', 403));
      return;
    }
    if (order.deliveryMethod !== 'MEETUP') {
      next(new ApiError('INVALID_STATE', 'Handover codes are only for in-person meet-ups', 409));
      return;
    }
    // Brute-force guard: the seller redeeming a 6-digit code gets a handful of
    // tries, then must fall back to the buyer confirming from their own side.
    if (order.collectionCodeAttempts >= MAX_HANDOVER_ATTEMPTS) {
      next(new ApiError('LOCKED', 'Too many incorrect codes — ask the buyer to confirm delivery from their end', 423));
      return;
    }
    if (!order.collectionCode || parsed.data.code !== order.collectionCode) {
      await prisma.order.update({ where: { id: order.id }, data: { collectionCodeAttempts: { increment: 1 } } });
      next(new ApiError('INVALID_CODE', "That code doesn't match. Check the code the buyer is showing you.", 400));
      return;
    }

    // Match → release through releaseEscrowFunds (guards PAID/SHIPPED atomically,
    // excludes a disputed order, and is idempotent under a race).
    const { released } = await releaseEscrowFunds(order.id);
    if (!released) {
      next(new ApiError('INVALID_STATE', 'This order is not awaiting handover', 409));
      return;
    }

    res.status(200).json({ data: { id: order.id, status: 'COMPLETED', displayStatus: displayStatus('COMPLETED') } });
  },
);

// Cash-on-delivery orders skip escrow entirely — payment and delivery are
// the same physical event, so there's nothing to poll/confirm/release. The
// seller marking it collected is the only signal the order happened at all.
router.post(
  '/:orderId/mark-collected',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ orderId: string }>, res: Response, next: NextFunction) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { listing: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!order) {
      next(new ApiError('NOT_FOUND', 'Order not found', 404));
      return;
    }
    if (order.listing.sellerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not your listing', 403));
      return;
    }

    const payment = order.payments[0];
    if (!payment || payment.method !== 'CASH_ON_DELIVERY') {
      next(new ApiError('INVALID_STATE', 'This order was not paid by cash on delivery', 409));
      return;
    }
    if (!canTransition(order.status, 'COMPLETED')) {
      next(new ApiError('INVALID_STATE', 'Order is not awaiting collection', 409));
      return;
    }

    const { count } = await prisma.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: 'COMPLETED' },
    });
    if (count === 0) {
      next(new ApiError('INVALID_STATE', 'Order is not awaiting collection', 409));
      return;
    }

    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
    await notifyOrderStatusChange(order.id, 'COMPLETED');

    res.status(200).json({ data: { id: order.id, status: 'COMPLETED', displayStatus: displayStatus('COMPLETED') } });
  },
);

router.post('/dispute-upload-signature', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({ data: signDisputeEvidenceUpload() });
});

router.post(
  '/:orderId/dispute',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ orderId: string }>, res: Response, next: NextFunction) => {
    const parsed = raiseDisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });

    if (!order) {
      next(new ApiError('NOT_FOUND', 'Order not found', 404));
      return;
    }
    if (order.buyerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not your order', 403));
      return;
    }
    // canTransition(..., 'DISPUTED') covers both eligibility (only while
    // funds are still sitting in escrow — PAID/SHIPPED/DELIVERED) and
    // "not already disputed" (DISPUTED has no transition into itself) in
    // one check, now that order.status is the source of truth for dispute
    // state (SCRUM-60) rather than a separate PaymentDispute lookup.
    if (!canTransition(order.status, 'DISPUTED')) {
      next(new ApiError('INVALID_STATE', 'This order is not eligible for a dispute', 409));
      return;
    }

    const { count } = await prisma.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: 'DISPUTED' },
    });
    if (count === 0) {
      next(new ApiError('INVALID_STATE', 'This order is not eligible for a dispute', 409));
      return;
    }

    const dispute = await prisma.paymentDispute.create({
      data: {
        orderId: order.id,
        raisedById: req.userId!,
        reason: parsed.data.reason,
        evidenceImageUrls: parsed.data.evidenceImageUrls,
      },
    });

    await notifyOrderStatusChange(order.id, 'DISPUTED');

    res.status(201).json({
      data: {
        id: dispute.id,
        orderId: dispute.orderId,
        status: dispute.status,
        reason: dispute.reason,
        evidenceImageUrls: dispute.evidenceImageUrls,
        createdAt: dispute.createdAt,
      },
    });
  },
);

router.post(
  '/:orderId/reviews',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ orderId: string }>, res: Response, next: NextFunction) => {
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { listing: { select: { sellerId: true } } },
    });

    if (!order) {
      next(new ApiError('NOT_FOUND', 'Order not found', 404));
      return;
    }

    const { sellerId } = order.listing;
    const isBuyer = order.buyerId === req.userId;
    const isSeller = sellerId === req.userId;
    if (!isBuyer && !isSeller) {
      next(new ApiError('FORBIDDEN', 'Not part of this order', 403));
      return;
    }
    if (order.status !== 'COMPLETED') {
      next(new ApiError('INVALID_STATE', 'This order cannot be reviewed yet', 409));
      return;
    }

    const revieweeId = isBuyer ? sellerId : order.buyerId;

    try {
      const review = await prisma.review.create({
        data: {
          orderId: order.id,
          reviewerId: req.userId!,
          revieweeId,
          rating: parsed.data.rating,
          comment: parsed.data.comment ?? null,
        },
      });

      res.status(201).json({
        data: {
          id: review.id,
          orderId: review.orderId,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        next(new ApiError('ALREADY_REVIEWED', 'You have already reviewed this order', 409));
        return;
      }
      throw err;
    }
  },
);

router.get(
  '/:orderId/reviews',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ orderId: string }>, res: Response, next: NextFunction) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: {
        listing: { select: { sellerId: true } },
        escrowEntries: { select: { type: true, createdAt: true } },
        reviews: { include: { flag: { select: { status: true } } } },
      },
    });

    if (!order) {
      next(new ApiError('NOT_FOUND', 'Order not found', 404));
      return;
    }
    if (order.buyerId !== req.userId && order.listing.sellerId !== req.userId) {
      next(new ApiError('FORBIDDEN', 'Not part of this order', 403));
      return;
    }

    const yourReview = order.reviews.find(r => r.reviewerId === req.userId!) ?? null;
    const counterpartReview = order.reviews.find(r => r.reviewerId !== req.userId!) ?? null;
    const completedAt = getOrderCompletedAt(order);
    const revealed = isRevealed(!!yourReview, completedAt);
    // A PENDING/REMOVED flag hides a review from everyone except its own
    // author (SCRUM-69) — the author still sees theirs, flagged or not.
    const counterpartHidden = counterpartReview?.flag && counterpartReview.flag.status !== 'DISMISSED';

    res.status(200).json({
      data: {
        canReview: order.status === 'COMPLETED' && !yourReview,
        revealed,
        yourReview: yourReview && {
          id: yourReview.id,
          rating: yourReview.rating,
          comment: yourReview.comment,
          createdAt: yourReview.createdAt,
          flagged: yourReview.flag?.status === 'PENDING',
        },
        counterpartReview:
          revealed && counterpartReview && !counterpartHidden
            ? {
                id: counterpartReview.id,
                rating: counterpartReview.rating,
                comment: counterpartReview.comment,
                createdAt: counterpartReview.createdAt,
              }
            : null,
      },
    });
  },
);

export default router;
