import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { signListingUpload } from '../lib/cloudinary';
import { ApiError } from '../errors/ApiError';

const createListingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  price: z.number().positive(),
  condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']),
  city: z.string().min(1),
  categoryId: z.string().uuid(),
  imageUrls: z.array(z.string().url()).min(1).max(6),
  deliveryOptions: z.array(z.string().min(1)).min(1),
  attributes: z.record(z.string(), z.string()).optional(),
});

const updateListingSchema = z.object({
  price: z.number().positive().optional(),
  description: z.string().max(2000).optional(),
  imageUrls: z.array(z.string().url()).min(1).max(6).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

const PAGE_SIZE = 20;

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = listQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid query params', 400, z.flattenError(parsed.error)));
    return;
  }

  const { page } = parsed.data;

  const listings = await prisma.listing.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });

  const hasMore = listings.length > PAGE_SIZE;
  const pageItems = listings.slice(0, PAGE_SIZE);

  res.status(200).json({
    data: pageItems.map(listing => ({
      id: listing.id,
      title: listing.title,
      price: listing.price.toString(),
      city: listing.city,
      imageUrls: listing.imageUrls,
      createdAt: listing.createdAt,
    })),
    hasMore,
  });
});

router.get('/mine', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const listings = await prisma.listing.findMany({
    where: { sellerId: req.userId!, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({
    data: listings.map(listing => ({
      id: listing.id,
      title: listing.title,
      price: listing.price.toString(),
      city: listing.city,
      imageUrls: listing.imageUrls,
      status: listing.status,
      createdAt: listing.createdAt,
    })),
  });
});

router.get('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: {
      attributes: true,
      category: { select: { id: true, name: true, slug: true } },
      seller: { select: { id: true, displayName: true, avatarUrl: true, city: true } },
    },
  });

  if (!listing || listing.deletedAt) {
    next(new ApiError('LISTING_NOT_FOUND', 'Listing not found', 404));
    return;
  }

  res.status(200).json({
    data: {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      price: listing.price.toString(),
      condition: listing.condition,
      city: listing.city,
      imageUrls: listing.imageUrls,
      deliveryOptions: listing.deliveryOptions,
      status: listing.status,
      category: listing.category,
      attributes: Object.fromEntries(listing.attributes.map(a => [a.key, a.value])),
      seller: listing.seller,
      createdAt: listing.createdAt,
    },
  });
});

router.post('/upload-signature', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({ data: signListingUpload() });
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createListingSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid listing payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const { attributes, ...listingData } = parsed.data;

  const category = await prisma.category.findUnique({ where: { id: listingData.categoryId } });
  if (!category) {
    next(new ApiError('VALIDATION_ERROR', 'Unknown categoryId', 400));
    return;
  }

  const attributeEntries = Object.entries(attributes ?? {}).filter(([, value]) => value.trim().length > 0);

  const listing = await prisma.listing.create({
    data: {
      ...listingData,
      sellerId: req.userId!,
      attributes: {
        create: attributeEntries.map(([key, value]) => ({ key, value })),
      },
    },
    include: { attributes: true },
  });

  res.status(201).json({
    data: {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      price: listing.price.toString(),
      condition: listing.condition,
      city: listing.city,
      categoryId: listing.categoryId,
      imageUrls: listing.imageUrls,
      deliveryOptions: listing.deliveryOptions,
      status: listing.status,
      attributes: Object.fromEntries(listing.attributes.map(a => [a.key, a.value])),
      createdAt: listing.createdAt,
    },
  });
});

router.patch('/:id', requireAuth, async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
  const parsed = updateListingSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid update payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });

  if (!listing || listing.deletedAt) {
    next(new ApiError('LISTING_NOT_FOUND', 'Listing not found', 404));
    return;
  }

  if (listing.sellerId !== req.userId) {
    next(new ApiError('FORBIDDEN', 'You do not own this listing', 403));
    return;
  }

  const updated = await prisma.listing.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { attributes: true },
  });

  res.status(200).json({
    data: {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      price: updated.price.toString(),
      condition: updated.condition,
      city: updated.city,
      imageUrls: updated.imageUrls,
      deliveryOptions: updated.deliveryOptions,
      status: updated.status,
      attributes: Object.fromEntries(updated.attributes.map(a => [a.key, a.value])),
      createdAt: updated.createdAt,
    },
  });
});

router.patch('/:id/sold', requireAuth, async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });

  if (!listing || listing.deletedAt) {
    next(new ApiError('LISTING_NOT_FOUND', 'Listing not found', 404));
    return;
  }

  if (listing.sellerId !== req.userId) {
    next(new ApiError('FORBIDDEN', 'You do not own this listing', 403));
    return;
  }

  const updated = await prisma.listing.update({
    where: { id: req.params.id },
    data: { status: 'SOLD' },
  });

  res.status(200).json({ data: { id: updated.id, status: updated.status } });
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });

  if (!listing || listing.deletedAt) {
    next(new ApiError('LISTING_NOT_FOUND', 'Listing not found', 404));
    return;
  }

  if (listing.sellerId !== req.userId) {
    next(new ApiError('FORBIDDEN', 'You do not own this listing', 403));
    return;
  }

  await prisma.listing.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });

  res.status(204).send();
});

export default router;
