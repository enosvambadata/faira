import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// Any authenticated user can list active hubs — needed by the seller
// registration wizard's "preferred hub" step, and by anything else that
// needs to show hub names (no sensitive data on this model).
router.get('/', requireAuth, async (_req, res: Response) => {
  const hubs = await prisma.hub.findMany({
    where: { isActive: true },
    orderBy: { city: 'asc' },
  });

  res.status(200).json({
    data: hubs.map(h => ({ id: h.id, name: h.name, city: h.city, address: h.address, openingHours: h.openingHours })),
  });
});

export default router;
