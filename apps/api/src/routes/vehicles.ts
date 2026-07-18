import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { ApiError } from '../errors/ApiError';

const router = Router();

// Public reference data for the auto-parts fitment filter — the make -> model
// cascading dropdowns on both the Sell form and the "My Garage" buyer filter.
// No auth: a buyer browses (and picks their car) before signing in.

router.get('/makes', async (_req: Request, res: Response) => {
  const makes = await prisma.vehicleMake.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  res.status(200).json({ data: makes });
});

router.get('/makes/:makeId/models', async (req: Request<{ makeId: string }>, res: Response, next: NextFunction) => {
  const make = await prisma.vehicleMake.findUnique({ where: { id: req.params.makeId } });

  if (!make) {
    next(new ApiError('MAKE_NOT_FOUND', 'Vehicle make not found', 404));
    return;
  }

  const models = await prisma.vehicleModel.findMany({
    where: { makeId: req.params.makeId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  res.status(200).json({ data: models });
});

export default router;
