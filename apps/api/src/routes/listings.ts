import { Router, Response, NextFunction } from 'express';
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

const router = Router();

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

export default router;
