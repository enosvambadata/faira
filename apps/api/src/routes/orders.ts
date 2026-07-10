import { Router, Request, Response, NextFunction } from 'express';
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
import { canTransition, displayStatus } from '../lib/orderStateMachine';

const router = Router();

const createOrderSchema = z.object({
  listingId: z.string().uuid(),
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

  const order = await prisma.order.create({
    data: { listingId: listing.id, buyerId, priceAtPurchase: listing.price, status: 'PENDING' },
  });

  res.status(201).json({
    data: {
      id: order.id,
      listingId: order.listingId,
      priceAtPurchase: order.priceAtPurchase.toString(),
      status: order.status,
    },
  });
});

router.get(
  '/:orderId',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ orderId: string }>, res: Response, next: NextFunction) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: {
        listing: { select: { id: true, title: true, imageUrls: true, sellerId: true } },
        escrowEntries: { select: { type: true } },
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

    res.status(200).json({
      data: {
        id: order.id,
        buyerId: order.buyerId,
        sellerId: order.listing.sellerId,
        priceAtPurchase: order.priceAtPurchase.toString(),
        status: order.status,
        displayStatus: displayStatus(order.status),
        // True once the seller's escrow HOLD for this order has been
        // released (SCRUM-55) — while PAID it's held, not yet payable.
        sellerPayoutEligible: order.escrowEntries.some(e => e.type === 'RELEASE'),
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

    res.status(200).json({ data: { id: order.id, status: 'DELIVERED', displayStatus: displayStatus('DELIVERED') } });
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
    if (!canTransition(order.status, 'DELIVERED')) {
      next(new ApiError('INVALID_STATE', 'Order is not awaiting collection', 409));
      return;
    }

    const { count } = await prisma.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: 'DELIVERED' },
    });
    if (count === 0) {
      next(new ApiError('INVALID_STATE', 'Order is not awaiting collection', 409));
      return;
    }

    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });

    res.status(200).json({ data: { id: order.id, status: 'DELIVERED', displayStatus: displayStatus('DELIVERED') } });
  },
);

export default router;
