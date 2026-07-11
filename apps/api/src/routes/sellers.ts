import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { ApiError } from '../errors/ApiError';
import { getSellerAvailableBalance } from '../services/sellerBalance';

const router = Router();

const MINIMUM_PAYOUT_AMOUNT = 5;
const REVIEWS_PAGE_SIZE = 10;

const reviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

const sellerSettingsSchema = z.object({
  codEnabled: z.boolean(),
});

const requestPayoutSchema = z.object({
  amount: z.number().positive(),
  payoutMethodDetails: z.string().trim().min(1).max(200),
});

// /me/settings, not /:id/settings — this only ever operates on the caller's
// own profile, so there's no seller-id param or ownership check needed.
router.patch('/me/settings', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = sellerSettingsSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid seller settings payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const profile = await prisma.sellerProfile.upsert({
    where: { userId: req.userId! },
    update: { codEnabled: parsed.data.codEnabled },
    create: { userId: req.userId!, codEnabled: parsed.data.codEnabled },
  });

  res.status(200).json({ data: { codEnabled: profile.codEnabled } });
});

router.get('/me/balance', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const availableBalance = await getSellerAvailableBalance(req.userId!);
  res.status(200).json({ data: { availableBalance, minimumPayoutAmount: MINIMUM_PAYOUT_AMOUNT } });
});

router.post('/me/payout-requests', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = requestPayoutSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid payout request payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const { amount, payoutMethodDetails } = parsed.data;

  if (amount < MINIMUM_PAYOUT_AMOUNT) {
    next(new ApiError('BELOW_MINIMUM_PAYOUT', `Minimum payout amount is $${MINIMUM_PAYOUT_AMOUNT}`, 400));
    return;
  }

  const availableBalance = await getSellerAvailableBalance(req.userId!);
  if (amount > availableBalance) {
    next(new ApiError('INSUFFICIENT_BALANCE', 'Requested amount exceeds available balance', 400));
    return;
  }

  // An interactive transaction (not the array form used elsewhere in this
  // codebase) is needed here specifically because the ledger entry has to
  // reference the payout request's own id — there's no way to know that id
  // before the request row is created.
  const payoutRequest = await prisma.$transaction(async tx => {
    const request = await tx.payoutRequest.create({
      data: { sellerId: req.userId!, amount, payoutMethodDetails, status: 'PENDING' },
    });
    // Reserving the amount immediately (rather than at processing time)
    // prevents a seller from requesting the same balance twice before the
    // first request is processed.
    await tx.escrowLedgerEntry.create({
      data: { sellerId: req.userId!, type: 'PAYOUT', amount, payoutRequestId: request.id },
    });
    return request;
  });

  res.status(201).json({
    data: {
      id: payoutRequest.id,
      amount: payoutRequest.amount.toString(),
      status: payoutRequest.status,
      requestedAt: payoutRequest.requestedAt,
    },
  });
});

router.get('/:id', requireAuth, async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
  const sellerId = req.params.id;

  const user = await prisma.user.findUnique({
    where: { id: sellerId },
    include: { sellerProfile: true },
  });

  if (!user) {
    next(new ApiError('SELLER_NOT_FOUND', 'Seller not found', 404));
    return;
  }

  // reviews-as-seller only: a review counts toward this rating when the
  // reviewee was the seller of that specific order (not every review this
  // user has ever received — they could also be rated as a buyer). A
  // PENDING/REMOVED-flagged review (SCRUM-69) is excluded until an admin
  // dismisses the flag.
  const reviewsAsSellerFilter = {
    revieweeId: sellerId,
    order: { listing: { sellerId } },
    OR: [{ flag: null }, { flag: { status: 'DISMISSED' as const } }],
  };

  const [activeListings, salesCount, followerCount, isFollowing, conversationsAsSeller, conversationsWithReply, ratingAgg] =
    await Promise.all([
      prisma.listing.findMany({
        where: { sellerId, status: 'ACTIVE', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where: { status: 'DELIVERED', listing: { sellerId } } }),
      prisma.follow.count({ where: { sellerId } }),
      prisma.follow.findUnique({ where: { followerId_sellerId: { followerId: req.userId!, sellerId } } }),
      prisma.conversation.count({ where: { sellerId } }),
      prisma.conversation.count({ where: { sellerId, messages: { some: { senderId: sellerId } } } }),
      prisma.review.aggregate({ where: reviewsAsSellerFilter, _avg: { rating: true }, _count: true }),
    ]);

  // Null (not 0%) when the seller has no conversations yet — "0% response
  // rate" would misleadingly read as unresponsive rather than "no data".
  const responseRate = conversationsAsSeller > 0 ? Math.round((conversationsWithReply / conversationsAsSeller) * 100) : null;

  res.status(200).json({
    data: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      city: user.city,
      joinedAt: user.createdAt,
      ratingAvg: (ratingAgg._avg.rating ?? 0).toFixed(2),
      ratingCount: ratingAgg._count,
      isVerified: user.sellerProfile?.isVerified ?? false,
      salesCount,
      responseRate,
      followerCount,
      isFollowing: !!isFollowing,
      activeListings: activeListings.map(listing => ({
        id: listing.id,
        title: listing.title,
        price: listing.price.toString(),
        city: listing.city,
        imageUrls: listing.imageUrls,
        createdAt: listing.createdAt,
      })),
    },
  });
});

router.get(
  '/:id/reviews',
  requireAuth,
  async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const sellerId = req.params.id;
    const parsed = reviewsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid query params', 400, z.flattenError(parsed.error)));
      return;
    }

    const where = {
      revieweeId: sellerId,
      order: { listing: { sellerId } },
      OR: [{ flag: null }, { flag: { status: 'DISMISSED' as const } }],
    };
    const { page } = parsed.data;

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * REVIEWS_PAGE_SIZE,
        take: REVIEWS_PAGE_SIZE + 1,
        include: { reviewer: { select: { displayName: true, avatarUrl: true } } },
      }),
      prisma.review.count({ where }),
    ]);

    const hasMore = reviews.length > REVIEWS_PAGE_SIZE;
    const pageItems = reviews.slice(0, REVIEWS_PAGE_SIZE);

    res.status(200).json({
      data: pageItems.map(review => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        reviewer: { displayName: review.reviewer.displayName, avatarUrl: review.reviewer.avatarUrl },
      })),
      hasMore,
      total,
    });
  },
);

router.post('/:id/follow', requireAuth, async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
  const sellerId = req.params.id;

  if (sellerId === req.userId!) {
    next(new ApiError('VALIDATION_ERROR', 'You cannot follow yourself', 400));
    return;
  }

  const seller = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!seller) {
    next(new ApiError('SELLER_NOT_FOUND', 'Seller not found', 404));
    return;
  }

  await prisma.follow.upsert({
    where: { followerId_sellerId: { followerId: req.userId!, sellerId } },
    update: {},
    create: { followerId: req.userId!, sellerId },
  });

  res.status(200).json({ data: { sellerId, following: true } });
});

router.delete('/:id/follow', requireAuth, async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response) => {
  await prisma.follow.deleteMany({
    where: { followerId: req.userId!, sellerId: req.params.id },
  });

  res.status(204).send();
});

export default router;
