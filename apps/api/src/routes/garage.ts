import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { ApiError } from '../errors/ApiError';

const router = Router();

// A buyer's saved vehicles ("My Garage") — entered once, then reused to power
// the "fits my car" filter on browse. See docs/marketplace/00-vehicle-fitment-spec.md.

// Bounds keep obviously-wrong years out; ex-Japan imports rarely predate 1980
// and we allow one model-year ahead of now.
const addSchema = z.object({
  modelId: z.string().uuid(),
  year: z.number().int().min(1980).max(2027).optional(),
});

function shape(vehicle: {
  id: string;
  year: number | null;
  model: { id: string; name: string; make: { name: string } };
}) {
  return {
    id: vehicle.id,
    modelId: vehicle.model.id,
    year: vehicle.year,
    make: vehicle.model.make.name,
    model: vehicle.model.name,
  };
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const vehicles = await prisma.garageVehicle.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    include: { model: { include: { make: true } } },
  });

  res.status(200).json({ data: vehicles.map(shape) });
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = addSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid vehicle', 400, z.flattenError(parsed.error)));
    return;
  }

  const model = await prisma.vehicleModel.findUnique({ where: { id: parsed.data.modelId } });

  if (!model) {
    next(new ApiError('MODEL_NOT_FOUND', 'Vehicle model not found', 404));
    return;
  }

  const created = await prisma.garageVehicle.create({
    data: { userId: req.userId!, modelId: parsed.data.modelId, year: parsed.data.year ?? null },
    include: { model: { include: { make: true } } },
  });

  res.status(201).json({ data: shape(created) });
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response) => {
  // Scope the delete to the caller so one user can't remove another's vehicle.
  await prisma.garageVehicle.deleteMany({ where: { id: req.params.id, userId: req.userId! } });

  res.status(204).send();
});

export default router;
