import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { ApiError } from '../errors/ApiError';

const listQuerySchema = z.object({
  parentId: z.string().uuid().optional(),
});

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = listQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid query params', 400, z.flattenError(parsed.error)));
    return;
  }

  // Defaults to top-level categories (no parentId given) — existing
  // pickers (Sell form, browse filters) render this as a flat chip list
  // and expect the original 8 top-level categories, not all 3 levels of
  // the SCRUM-37 taxonomy. Pass ?parentId=<id> to fetch a category's
  // direct children for future subcategory drill-down UI.
  const categories = await prisma.category.findMany({
    where: { parentId: parsed.data.parentId ?? null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, icon: true, parentId: true },
  });

  res.status(200).json({ data: categories });
});

export default router;
