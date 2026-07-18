import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { ApiError } from '../errors/ApiError';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const items = await prisma.wishlistItem.findMany({
    where: { userId: req.userId!, listing: { deletedAt: null } },
    orderBy: { createdAt: 'desc' },
    include: {
      listing: {
        // Same seller card data as the browse endpoint so watchlist cards
        // render identically (condition badge, rating/verified) instead of
        // falling back to neutral placeholders.
        include: {
          seller: { select: { displayName: true, sellerProfile: { select: { ratingAvg: true, ratingCount: true, isVerified: true } } } },
        },
      },
    },
  });

  res.status(200).json({
    data: items.map(item => ({
      id: item.listing.id,
      title: item.listing.title,
      price: item.listing.price.toString(),
      condition: item.listing.condition,
      city: item.listing.city,
      imageUrls: item.listing.imageUrls,
      status: item.listing.status,
      universalFit: item.listing.universalFit,
      seller: {
        name: item.listing.seller?.displayName ?? null,
        rating: item.listing.seller?.sellerProfile?.ratingAvg != null ? Number(item.listing.seller.sellerProfile.ratingAvg) : null,
        ratingCount: item.listing.seller?.sellerProfile?.ratingCount ?? 0,
        verified: item.listing.seller?.sellerProfile?.isVerified ?? false,
      },
      savedAt: item.createdAt,
    })),
  });
});

router.get('/ids', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const items = await prisma.wishlistItem.findMany({
    where: { userId: req.userId! },
    select: { listingId: true },
  });

  res.status(200).json({ data: items.map(item => item.listingId) });
});

router.post('/:listingId', requireAuth, async (req: AuthenticatedRequest & Request<{ listingId: string }>, res: Response, next: NextFunction) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.listingId } });

  if (!listing || listing.deletedAt) {
    next(new ApiError('LISTING_NOT_FOUND', 'Listing not found', 404));
    return;
  }

  await prisma.wishlistItem.upsert({
    where: { userId_listingId: { userId: req.userId!, listingId: req.params.listingId } },
    update: {},
    create: { userId: req.userId!, listingId: req.params.listingId },
  });

  res.status(200).json({ data: { listingId: req.params.listingId, saved: true } });
});

router.delete('/:listingId', requireAuth, async (req: AuthenticatedRequest & Request<{ listingId: string }>, res: Response) => {
  await prisma.wishlistItem.deleteMany({
    where: { userId: req.userId!, listingId: req.params.listingId },
  });

  res.status(204).send();
});

export default router;
