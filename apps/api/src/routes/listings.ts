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

const CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] as const;

const csv = () =>
  z
    .string()
    .optional()
    .transform(value => (value ? value.split(',').map(v => v.trim()).filter(Boolean) : []));

const SORTS = ['newest', 'price_asc', 'price_desc'] as const;

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(SORTS).default('newest'),
  categoryIds: csv(),
  conditions: csv().pipe(z.array(z.enum(CONDITIONS))),
  cities: csv(),
  sizes: csv(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
});

const PAGE_SIZE = 20;

// Search results are capped at this many DB matches before in-app relevance
// sorting — bounds cost since there's no full-text-search index yet. Fine at
// this app's scale; would need a real ranking query (e.g. pg_trgm / tsvector)
// if the catalog grows past a few thousand active listings.
const SEARCH_MATCH_CAP = 500;

function brandOf(listing: { attributes: { key: string; value: string }[] }): string | undefined {
  return listing.attributes.find(a => a.key === 'brand')?.value;
}

// "Relevance then recency": a title match ranks above a brand match, which
// ranks above a description-only match; ties break by newest first.
function relevanceScore(listing: { title: string; description: string | null; attributes: { key: string; value: string }[] }, q: string): number {
  const needle = q.toLowerCase();
  if (listing.title.toLowerCase().includes(needle)) return 3;
  if (brandOf(listing)?.toLowerCase().includes(needle)) return 2;
  if (listing.description?.toLowerCase().includes(needle)) return 1;
  return 0;
}

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = listQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid query params', 400, z.flattenError(parsed.error)));
    return;
  }

  const { page, q, sort, categoryIds, conditions, cities, sizes, minPrice, maxPrice } = parsed.data;

  const price: { gte?: number; lte?: number } = {};
  if (minPrice !== undefined) price.gte = minPrice;
  if (maxPrice !== undefined) price.lte = maxPrice;

  const where = {
    status: 'ACTIVE' as const,
    deletedAt: null,
    ...(categoryIds.length && { categoryId: { in: categoryIds } }),
    ...(conditions.length && { condition: { in: conditions } }),
    ...(cities.length && { city: { in: cities } }),
    ...(Object.keys(price).length && { price }),
    ...(sizes.length && { attributes: { some: { key: 'size', value: { in: sizes } } } }),
    ...(q && {
      OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
        { attributes: { some: { key: 'brand', value: { contains: q, mode: 'insensitive' as const } } } },
      ],
    }),
  };

  let pageItems;
  let hasMore;
  let total;

  // An explicit sort choice (price low-high / high-low) overrides relevance
  // ranking even while searching — picking a sort is a deliberate request to
  // reorder, which should win over the implicit relevance order. "Newest" is
  // both the default sort and search's own tiebreaker, so it keeps the
  // existing relevance-then-recency behavior from SCRUM-38 when searching.
  if (q && sort === 'newest') {
    const [matches, matchTotal] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: { attributes: true },
        orderBy: { createdAt: 'desc' },
        take: SEARCH_MATCH_CAP,
      }),
      prisma.listing.count({ where }),
    ]);

    const ranked = matches
      .map(listing => ({ listing, score: relevanceScore(listing, q) }))
      .sort((a, b) => b.score - a.score || b.listing.createdAt.getTime() - a.listing.createdAt.getTime())
      .map(({ listing }) => listing);

    const start = (page - 1) * PAGE_SIZE;
    pageItems = ranked.slice(start, start + PAGE_SIZE);
    hasMore = start + PAGE_SIZE < ranked.length;
    total = matchTotal;
  } else {
    const orderBy =
      sort === 'price_asc' ? { price: 'asc' as const } : sort === 'price_desc' ? { price: 'desc' as const } : { createdAt: 'desc' as const };

    const [listings, browseTotal] = await Promise.all([
      prisma.listing.findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE + 1,
      }),
      prisma.listing.count({ where }),
    ]);

    hasMore = listings.length > PAGE_SIZE;
    pageItems = listings.slice(0, PAGE_SIZE);
    total = browseTotal;
  }

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
    total,
  });
});

router.get('/filter-options', async (_req: Request, res: Response) => {
  const [cityRows, sizeRows] = await Promise.all([
    prisma.listing.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { city: true },
      distinct: ['city'],
    }),
    prisma.listingAttribute.findMany({
      where: { key: 'size', listing: { status: 'ACTIVE', deletedAt: null } },
      select: { value: true },
      distinct: ['value'],
    }),
  ]);

  res.status(200).json({
    data: {
      cities: cityRows.map(row => row.city).sort(),
      sizes: sizeRows.map(row => row.value).sort(),
    },
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
      seller: {
        select: { id: true, displayName: true, avatarUrl: true, city: true, sellerProfile: { select: { isVerified: true } } },
      },
    },
  });

  if (!listing || listing.deletedAt) {
    next(new ApiError('LISTING_NOT_FOUND', 'Listing not found', 404));
    return;
  }

  const { sellerProfile, ...sellerFields } = listing.seller;

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
      seller: { ...sellerFields, isVerified: sellerProfile?.isVerified ?? false },
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
