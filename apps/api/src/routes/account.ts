import { Router, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { ApiError } from '../errors/ApiError';

const router = Router();

const DELETION_GRACE_PERIOD_DAYS = 30;

router.get('/deletion-request', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const latest = await prisma.accountDeletionRequest.findFirst({
    where: { userId: req.userId! },
    orderBy: { requestedAt: 'desc' },
  });

  res.status(200).json({
    data: latest
      ? {
          id: latest.id,
          status: latest.status,
          requestedAt: latest.requestedAt,
          scheduledFor: latest.scheduledFor,
          processedAt: latest.processedAt,
        }
      : null,
  });
});

router.post('/deletion-request', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const existingPending = await prisma.accountDeletionRequest.findFirst({
    where: { userId: req.userId!, status: 'PENDING' },
  });

  if (existingPending) {
    next(new ApiError('DELETION_ALREADY_PENDING', 'You already have a pending deletion request', 400));
    return;
  }

  const scheduledFor = new Date(Date.now() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const [request] = await prisma.$transaction([
    prisma.accountDeletionRequest.create({
      data: { userId: req.userId!, scheduledFor },
    }),
    prisma.auditLog.create({
      data: { userId: req.userId!, action: 'ACCOUNT_DELETION_REQUESTED', details: { scheduledFor } },
    }),
  ]);

  res.status(201).json({
    data: {
      id: request.id,
      status: request.status,
      requestedAt: request.requestedAt,
      scheduledFor: request.scheduledFor,
      processedAt: request.processedAt,
    },
  });
});

router.delete('/deletion-request', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const pending = await prisma.accountDeletionRequest.findFirst({
    where: { userId: req.userId!, status: 'PENDING' },
  });

  if (!pending) {
    next(new ApiError('DELETION_REQUEST_NOT_FOUND', 'You have no pending deletion request', 404));
    return;
  }

  await prisma.$transaction([
    prisma.accountDeletionRequest.update({ where: { id: pending.id }, data: { status: 'CANCELLED' } }),
    prisma.auditLog.create({ data: { userId: req.userId!, action: 'ACCOUNT_DELETION_CANCELLED' } }),
  ]);

  res.status(204).send();
});

router.get('/export', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;

  const [listings, orders, messages] = await Promise.all([
    prisma.listing.findMany({ where: { sellerId: userId } }),
    prisma.order.findMany({ where: { buyerId: userId } }),
    // "Their messages" is scoped to what they authored (senderId) — the
    // unambiguous, clearly-theirs slice of conversation data, rather than
    // every message in every conversation they're a participant of.
    prisma.message.findMany({ where: { senderId: userId } }),
  ]);

  await prisma.auditLog.create({ data: { userId, action: 'DATA_EXPORT_REQUESTED' } });

  res.status(200).json({
    data: {
      exportedAt: new Date(),
      listings: listings.map(listing => ({
        id: listing.id,
        title: listing.title,
        description: listing.description,
        price: listing.price.toString(),
        condition: listing.condition,
        city: listing.city,
        imageUrls: listing.imageUrls,
        status: listing.status,
        createdAt: listing.createdAt,
      })),
      orders: orders.map(order => ({
        id: order.id,
        listingId: order.listingId,
        priceAtPurchase: order.priceAtPurchase.toString(),
        status: order.status,
        createdAt: order.createdAt,
      })),
      messages: messages.map(message => ({
        id: message.id,
        conversationId: message.conversationId,
        body: message.body,
        imageUrl: message.imageUrl,
        createdAt: message.createdAt,
      })),
    },
  });
});

export default router;
