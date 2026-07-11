import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { requireFulfilmentRole } from '../middleware/requireFulfilmentRole';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';

const router = Router();

// Writes (create/edit providers, routes, runs) are Ops-Admin-only per the
// ticket. Reads are also open to Transport Operators -- they legitimately
// need to see routes/runs (including driver/vehicle info) to do their job,
// unlike sellers/buyers who never reach this router at all.
const ADMIN_ROLES = ['OPERATIONS_ADMIN', 'SUPER_ADMIN'] as const;
const READ_ROLES = ['OPERATIONS_ADMIN', 'SUPER_ADMIN', 'TRANSPORT_OPERATOR'] as const;

function providerResponse(provider: { id: string; name: string; contactPhone: string | null; isActive: boolean; createdAt: Date }) {
  return {
    id: provider.id,
    name: provider.name,
    contactPhone: provider.contactPhone,
    isActive: provider.isActive,
    createdAt: provider.createdAt,
  };
}

const createProviderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactPhone: z.string().trim().min(1).max(30).optional(),
});

router.post('/providers', requireAuth, requireFulfilmentRole(...ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const provider = await prisma.transportProvider.create({
    data: { name: parsed.data.name, contactPhone: parsed.data.contactPhone ?? null },
  });
  await recordAuditLog(req.userId!, 'FULFILMENT_TRANSPORT_PROVIDER_CREATED', { providerId: provider.id });

  res.status(201).json({ data: providerResponse(provider) });
});

router.get('/providers', requireAuth, requireFulfilmentRole(...READ_ROLES), async (_req, res: Response) => {
  const providers = await prisma.transportProvider.findMany({ orderBy: { name: 'asc' } });
  res.status(200).json({ data: providers.map(providerResponse) });
});

router.get(
  '/providers/:id',
  requireAuth,
  requireFulfilmentRole(...READ_ROLES),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const provider = await prisma.transportProvider.findUnique({ where: { id: req.params.id } });
    if (!provider) {
      next(new ApiError('NOT_FOUND', 'Transport provider not found', 404));
      return;
    }
    res.status(200).json({ data: providerResponse(provider) });
  },
);

const updateProviderSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  contactPhone: z.string().trim().min(1).max(30).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  '/providers/:id',
  requireAuth,
  requireFulfilmentRole(...ADMIN_ROLES),
  async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = updateProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const existing = await prisma.transportProvider.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      next(new ApiError('NOT_FOUND', 'Transport provider not found', 404));
      return;
    }

    const provider = await prisma.transportProvider.update({ where: { id: req.params.id }, data: parsed.data });
    await recordAuditLog(req.userId!, 'FULFILMENT_TRANSPORT_PROVIDER_UPDATED', { providerId: provider.id });

    res.status(200).json({ data: providerResponse(provider) });
  },
);

function routeResponse(route: {
  id: string;
  originHubId: string;
  destinationHubId: string;
  providerId: string | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: route.id,
    originHubId: route.originHubId,
    destinationHubId: route.destinationHubId,
    providerId: route.providerId,
    isActive: route.isActive,
    createdAt: route.createdAt,
  };
}

const createRouteSchema = z
  .object({
    originHubId: z.string().uuid(),
    destinationHubId: z.string().uuid(),
    providerId: z.string().uuid().optional(),
  })
  .refine(data => data.originHubId !== data.destinationHubId, {
    message: 'Origin and destination hub must be different',
    path: ['destinationHubId'],
  });

// Deliberately hub-agnostic -- no city names or hub ids are hardcoded
// anywhere in this handler, per the pivot brief's explicit anti-pattern
// list. Any two active hubs can be routed, not just the pilot pair.
router.post('/routes', requireAuth, requireFulfilmentRole(...ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createRouteSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const { originHubId, destinationHubId, providerId } = parsed.data;

  const [originHub, destinationHub, provider] = await Promise.all([
    prisma.hub.findUnique({ where: { id: originHubId } }),
    prisma.hub.findUnique({ where: { id: destinationHubId } }),
    providerId ? prisma.transportProvider.findUnique({ where: { id: providerId } }) : Promise.resolve(null),
  ]);
  if (!originHub) {
    next(new ApiError('NOT_FOUND', 'Origin hub not found', 404));
    return;
  }
  if (!destinationHub) {
    next(new ApiError('NOT_FOUND', 'Destination hub not found', 404));
    return;
  }
  if (providerId && !provider) {
    next(new ApiError('NOT_FOUND', 'Transport provider not found', 404));
    return;
  }

  try {
    const route = await prisma.transportRoute.create({
      data: { originHubId, destinationHubId, providerId: providerId ?? null },
    });
    await recordAuditLog(req.userId!, 'FULFILMENT_TRANSPORT_ROUTE_CREATED', { routeId: route.id, originHubId, destinationHubId });
    res.status(201).json({ data: routeResponse(route) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      next(new ApiError('ALREADY_EXISTS', 'A route between these hubs already exists', 409));
      return;
    }
    throw err;
  }
});

router.get('/routes', requireAuth, requireFulfilmentRole(...READ_ROLES), async (_req, res: Response) => {
  const routes = await prisma.transportRoute.findMany({ orderBy: { createdAt: 'desc' } });
  res.status(200).json({ data: routes.map(routeResponse) });
});

router.get(
  '/routes/:id',
  requireAuth,
  requireFulfilmentRole(...READ_ROLES),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const route = await prisma.transportRoute.findUnique({ where: { id: req.params.id } });
    if (!route) {
      next(new ApiError('NOT_FOUND', 'Route not found', 404));
      return;
    }
    res.status(200).json({ data: routeResponse(route) });
  },
);

const updateRouteSchema = z.object({
  providerId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  '/routes/:id',
  requireAuth,
  requireFulfilmentRole(...ADMIN_ROLES),
  async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = updateRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const existing = await prisma.transportRoute.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      next(new ApiError('NOT_FOUND', 'Route not found', 404));
      return;
    }
    if (parsed.data.providerId) {
      const provider = await prisma.transportProvider.findUnique({ where: { id: parsed.data.providerId } });
      if (!provider) {
        next(new ApiError('NOT_FOUND', 'Transport provider not found', 404));
        return;
      }
    }

    const route = await prisma.transportRoute.update({ where: { id: req.params.id }, data: parsed.data });
    await recordAuditLog(req.userId!, 'FULFILMENT_TRANSPORT_ROUTE_UPDATED', { routeId: route.id });

    res.status(200).json({ data: routeResponse(route) });
  },
);

function runResponse(run: {
  id: string;
  routeId: string;
  providerId: string | null;
  operatorUserId: string | null;
  vehicleReference: string | null;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  actualDeparture: Date | null;
  actualArrival: Date | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: run.id,
    routeId: run.routeId,
    providerId: run.providerId,
    operatorUserId: run.operatorUserId,
    vehicleReference: run.vehicleReference,
    scheduledDeparture: run.scheduledDeparture,
    scheduledArrival: run.scheduledArrival,
    actualDeparture: run.actualDeparture,
    actualArrival: run.actualArrival,
    status: run.status,
    createdAt: run.createdAt,
  };
}

const createRunSchema = z
  .object({
    routeId: z.string().uuid(),
    providerId: z.string().uuid().optional(),
    operatorUserId: z.string().uuid().optional(),
    vehicleReference: z.string().trim().min(1).max(100).optional(),
    scheduledDeparture: z.coerce.date(),
    scheduledArrival: z.coerce.date(),
  })
  .refine(data => data.scheduledArrival > data.scheduledDeparture, {
    message: 'Scheduled arrival must be after scheduled departure',
    path: ['scheduledArrival'],
  });

router.post('/runs', requireAuth, requireFulfilmentRole(...ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createRunSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const { routeId, providerId, operatorUserId } = parsed.data;

  const [route, provider, operator] = await Promise.all([
    prisma.transportRoute.findUnique({ where: { id: routeId } }),
    providerId ? prisma.transportProvider.findUnique({ where: { id: providerId } }) : Promise.resolve(null),
    operatorUserId ? prisma.user.findUnique({ where: { id: operatorUserId } }) : Promise.resolve(null),
  ]);
  if (!route) {
    next(new ApiError('NOT_FOUND', 'Route not found', 404));
    return;
  }
  if (providerId && !provider) {
    next(new ApiError('NOT_FOUND', 'Transport provider not found', 404));
    return;
  }
  if (operatorUserId && !operator) {
    next(new ApiError('NOT_FOUND', 'Operator user not found', 404));
    return;
  }

  const run = await prisma.transportRun.create({
    data: {
      routeId,
      providerId: providerId ?? null,
      operatorUserId: operatorUserId ?? null,
      vehicleReference: parsed.data.vehicleReference ?? null,
      scheduledDeparture: parsed.data.scheduledDeparture,
      scheduledArrival: parsed.data.scheduledArrival,
    },
  });
  await recordAuditLog(req.userId!, 'FULFILMENT_TRANSPORT_RUN_CREATED', { runId: run.id, routeId });

  res.status(201).json({ data: runResponse(run) });
});

router.get('/runs', requireAuth, requireFulfilmentRole(...READ_ROLES), async (req: Request, res: Response) => {
  const routeId = typeof req.query.routeId === 'string' ? req.query.routeId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  const runs = await prisma.transportRun.findMany({
    where: {
      ...(routeId ? { routeId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { scheduledDeparture: 'asc' },
  });
  res.status(200).json({ data: runs.map(runResponse) });
});

router.get(
  '/runs/:id',
  requireAuth,
  requireFulfilmentRole(...READ_ROLES),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const run = await prisma.transportRun.findUnique({ where: { id: req.params.id } });
    if (!run) {
      next(new ApiError('NOT_FOUND', 'Transport run not found', 404));
      return;
    }
    res.status(200).json({ data: runResponse(run) });
  },
);

const updateRunSchema = z.object({
  providerId: z.string().uuid().nullable().optional(),
  operatorUserId: z.string().uuid().nullable().optional(),
  vehicleReference: z.string().trim().min(1).max(100).nullable().optional(),
  scheduledDeparture: z.coerce.date().optional(),
  scheduledArrival: z.coerce.date().optional(),
  status: z.enum(['SCHEDULED', 'DEPARTED', 'ARRIVED', 'DELAYED', 'CANCELLED']).optional(),
});

router.patch(
  '/runs/:id',
  requireAuth,
  requireFulfilmentRole(...ADMIN_ROLES),
  async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = updateRunSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const existing = await prisma.transportRun.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      next(new ApiError('NOT_FOUND', 'Transport run not found', 404));
      return;
    }

    const nextDeparture = parsed.data.scheduledDeparture ?? existing.scheduledDeparture;
    const nextArrival = parsed.data.scheduledArrival ?? existing.scheduledArrival;
    if (nextArrival <= nextDeparture) {
      next(new ApiError('VALIDATION_ERROR', 'Scheduled arrival must be after scheduled departure', 400));
      return;
    }

    const run = await prisma.transportRun.update({ where: { id: req.params.id }, data: parsed.data });
    await recordAuditLog(req.userId!, 'FULFILMENT_TRANSPORT_RUN_UPDATED', { runId: run.id });

    res.status(200).json({ data: runResponse(run) });
  },
);

export default router;
