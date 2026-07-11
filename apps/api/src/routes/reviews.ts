import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { ApiError } from '../errors/ApiError';

const router = Router();

const flagReviewSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

router.post(
  '/:reviewId/flag',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ reviewId: string }>, res: Response, next: NextFunction) => {
    const parsed = flagReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const review = await prisma.review.findUnique({
      where: { id: req.params.reviewId },
      include: { order: { select: { buyerId: true, listing: { select: { sellerId: true } } } } },
    });

    if (!review) {
      next(new ApiError('NOT_FOUND', 'Review not found', 404));
      return;
    }

    const isBuyer = review.order.buyerId === req.userId;
    const isSeller = review.order.listing.sellerId === req.userId;
    if (!isBuyer && !isSeller) {
      next(new ApiError('FORBIDDEN', 'Not part of the order this review belongs to', 403));
      return;
    }

    try {
      const flag = await prisma.reviewFlag.create({
        data: { reviewId: review.id, flaggedById: req.userId!, reason: parsed.data.reason },
      });

      res.status(201).json({ data: { id: flag.id, reviewId: flag.reviewId, status: flag.status, createdAt: flag.createdAt } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        next(new ApiError('ALREADY_FLAGGED', 'This review has already been flagged', 409));
        return;
      }
      throw err;
    }
  },
);

export default router;
