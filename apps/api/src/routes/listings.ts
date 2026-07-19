import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { signListingUpload } from '../lib/cloudinary';
import { findContactInfoField, CONTACT_INFO_REJECTION } from '../lib/contactRedaction';
import { ApiError } from '../errors/ApiError';

// Stored verbatim against every listing at creation time (see
// legalSourcingDeclarationText on the Listing model) so the audit trail
// reflects exactly what the seller agreed to, even if this text changes later.
export const LEGAL_SOURCING_DECLARATION_TEXT =
  'I confirm that this item was lawfully acquired and that I have the legal right to sell it.';

// Auto-parts fitment: one part fits many vehicles, each over an optionally
// open-ended year range. See docs/marketplace/00-vehicle-fitment-spec.md.
const fitmentInputSchema = z
  .object({
    modelId: z.string().uuid(),
    yearFrom: z.number().int().min(1980).max(2027).optional(),
    yearTo: z.number().int().min(1980).max(2027).optional(),
    note: z.string().max(120).optional(),
  })
  .refine(f => f.yearFrom === undefined || f.yearTo === undefined || f.yearFrom <= f.yearTo, {
    message: 'yearFrom must be <= yearTo',
  });

const createListingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  price: z.number().positive(),
  condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']),
  city: z.string().min(1),
  categoryId: z.string().uuid(),
  imageUrls: z.array(z.string().url()).min(1).max(6),
  deliveryOptions: z.array(z.string().min(1)).min(1),
  // Drives delivery fee calculation (SCRUM-64).
  weightTier: z.enum(['LIGHT', 'MEDIUM', 'HEAVY']),
  attributes: z.record(z.string(), z.string()).optional(),
  // A fit-anything part (tools, generic oil) skips per-vehicle fitment.
  universalFit: z.boolean().optional().default(false),
  fitments: z.array(fitmentInputSchema).max(50).optional(),
  legalSourcingDeclared: z.literal(true),
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
  // Fitment filter ("fits my car"): a model, optionally narrowed to a year.
  modelId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(1980).max(2027).optional(),
  // Fitment *annotation* (garage vehicle): does NOT filter — each returned
  // listing gets a `fits` flag relative to this model/year, so the storefront
  // can show "Fits your Vitz" vs "Check fit" pills without hiding anything.
  fitFor: z.string().uuid().optional(),
  fitYear: z.coerce.number().int().min(1980).max(2027).optional(),
  // Only listings from verified sellers.
  verifiedOnly: z.string().optional().transform(v => v === 'true'),
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

  const { page, q, sort, categoryIds, conditions, cities, sizes, minPrice, maxPrice, modelId, year, fitFor, fitYear, verifiedOnly } =
    parsed.data;

  // Card display data: seller name + rating/verified badge, and (when a garage
  // vehicle is supplied via fitFor) fitments to compute the per-card fits flag.
  const cardInclude = {
    seller: { select: { displayName: true, sellerProfile: { select: { ratingAvg: true, ratingCount: true, isVerified: true } } } },
    ...(fitFor ? { fitments: true } : {}),
  };

  type CardListing = {
    id: string;
    title: string;
    price: { toString(): string };
    condition: string;
    city: string;
    imageUrls: string[];
    createdAt: Date;
    universalFit: boolean;
    seller?: { displayName: string | null; sellerProfile: { ratingAvg: unknown; ratingCount: number; isVerified: boolean } | null } | null;
    fitments?: { modelId: string; yearFrom: number | null; yearTo: number | null }[];
  };

  const toCard = (l: CardListing) => {
    const fits = fitFor
      ? l.universalFit ||
        (l.fitments ?? []).some(
          f =>
            f.modelId === fitFor &&
            (f.yearFrom == null || fitYear == null || f.yearFrom <= fitYear) &&
            (f.yearTo == null || fitYear == null || f.yearTo >= fitYear),
        )
      : undefined;
    return {
      id: l.id,
      title: l.title,
      price: l.price.toString(),
      condition: l.condition,
      city: l.city,
      imageUrls: l.imageUrls,
      createdAt: l.createdAt,
      universalFit: l.universalFit,
      seller: {
        name: l.seller?.displayName ?? null,
        rating: l.seller?.sellerProfile?.ratingAvg != null ? Number(l.seller.sellerProfile.ratingAvg) : null,
        ratingCount: l.seller?.sellerProfile?.ratingCount ?? 0,
        verified: l.seller?.sellerProfile?.isVerified ?? false,
      },
      fits,
    };
  };

  const price: { gte?: number; lte?: number } = {};
  if (minPrice !== undefined) price.gte = minPrice;
  if (maxPrice !== undefined) price.lte = maxPrice;

  // Fitment match: a listing fits the chosen vehicle if it's universal, or has
  // a fitment row for that model whose (open-ended) year range contains the
  // target year. Held under a top-level AND so it composes with the search OR
  // below rather than clobbering it. year is ignored without a modelId.
  const fitmentFilter = modelId
    ? {
        AND: [
          {
            OR: [
              { universalFit: true },
              {
                fitments: {
                  some: {
                    modelId,
                    ...(year !== undefined && {
                      AND: [
                        { OR: [{ yearFrom: null }, { yearFrom: { lte: year } }] },
                        { OR: [{ yearTo: null }, { yearTo: { gte: year } }] },
                      ],
                    }),
                  },
                },
              },
            ],
          },
        ],
      }
    : {};

  const where = {
    status: 'ACTIVE' as const,
    deletedAt: null,
    ...(categoryIds.length && { categoryId: { in: categoryIds } }),
    ...(conditions.length && { condition: { in: conditions } }),
    ...(cities.length && { city: { in: cities } }),
    ...(Object.keys(price).length && { price }),
    ...(sizes.length && { attributes: { some: { key: 'size', value: { in: sizes } } } }),
    ...(verifiedOnly && { seller: { sellerProfile: { isVerified: true } } }),
    ...fitmentFilter,
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
        include: { attributes: true, ...cardInclude },
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
        include: cardInclude,
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
    data: (pageItems as CardListing[]).map(toCard),
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
      weightTier: listing.weightTier,
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

  // Anti-leakage (SCRUM-257): a listing is public copy, so contact info here is
  // reject-and-warn (not silent redact) — the seller fixes their own text.
  const contactField = findContactInfoField({ title: parsed.data.title, description: parsed.data.description });
  if (contactField) {
    next(new ApiError('CONTACT_INFO_NOT_ALLOWED', CONTACT_INFO_REJECTION, 400, { field: contactField }));
    return;
  }

  const { attributes, fitments, legalSourcingDeclared: _legalSourcingDeclared, ...listingData } = parsed.data;

  const category = await prisma.category.findUnique({ where: { id: listingData.categoryId } });
  if (!category) {
    next(new ApiError('VALIDATION_ERROR', 'Unknown categoryId', 400));
    return;
  }

  // Reject fitment against vehicle models that don't exist, so bad IDs surface
  // as a 400 rather than a foreign-key crash mid-create.
  if (fitments?.length) {
    const modelIds = [...new Set(fitments.map(f => f.modelId))];
    const known = await prisma.vehicleModel.findMany({ where: { id: { in: modelIds } }, select: { id: true } });
    if (known.length !== modelIds.length) {
      next(new ApiError('VALIDATION_ERROR', 'Unknown vehicle modelId in fitments', 400));
      return;
    }
  }

  const attributeEntries = Object.entries(attributes ?? {}).filter(([, value]) => value.trim().length > 0);

  const listing = await prisma.listing.create({
    data: {
      ...listingData,
      sellerId: req.userId!,
      legalSourcingDeclarationText: LEGAL_SOURCING_DECLARATION_TEXT,
      legalSourcingDeclaredAt: new Date(),
      attributes: {
        create: attributeEntries.map(([key, value]) => ({ key, value })),
      },
      fitments: {
        create: (fitments ?? []).map(f => ({
          modelId: f.modelId,
          yearFrom: f.yearFrom ?? null,
          yearTo: f.yearTo ?? null,
          note: f.note ?? null,
        })),
      },
    },
    include: { attributes: true, fitments: true },
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
      weightTier: listing.weightTier,
      status: listing.status,
      attributes: Object.fromEntries(listing.attributes.map(a => [a.key, a.value])),
      universalFit: listing.universalFit,
      fitments: listing.fitments.map(f => ({ modelId: f.modelId, yearFrom: f.yearFrom, yearTo: f.yearTo, note: f.note })),
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

  // Anti-leakage (SCRUM-257): reject-and-warn on edited description too.
  const contactField = findContactInfoField({ description: parsed.data.description });
  if (contactField) {
    next(new ApiError('CONTACT_INFO_NOT_ALLOWED', CONTACT_INFO_REJECTION, 400, { field: contactField }));
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
