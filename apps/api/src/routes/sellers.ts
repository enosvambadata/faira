import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { ApiError } from '../errors/ApiError';

const router = Router();

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

  const [activeListings, salesCount, followerCount, isFollowing, conversationsAsSeller, conversationsWithReply] = await Promise.all([
    prisma.listing.findMany({
      where: { sellerId, status: 'ACTIVE', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.count({ where: { status: 'DELIVERED', listing: { sellerId } } }),
    prisma.follow.count({ where: { sellerId } }),
    prisma.follow.findUnique({ where: { followerId_sellerId: { followerId: req.userId!, sellerId } } }),
    prisma.conversation.count({ where: { sellerId } }),
    prisma.conversation.count({ where: { sellerId, messages: { some: { senderId: sellerId } } } }),
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
      ratingAvg: user.sellerProfile?.ratingAvg.toString() ?? '0',
      ratingCount: user.sellerProfile?.ratingCount ?? 0,
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
