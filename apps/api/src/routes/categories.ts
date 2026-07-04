import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  });

  res.status(200).json({ data: categories });
});

export default router;
