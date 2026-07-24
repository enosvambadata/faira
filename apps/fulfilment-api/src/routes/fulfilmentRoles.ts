import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma, FulfilmentRole } from '@prisma/client';
import { prisma } from '../prisma';
import { requireAdmin } from '../middleware/requireAdmin';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';

const router = Router();

const HUB_SCOPED_ROLES: FulfilmentRole[] = ['HUB_AGENT', 'HUB_SUPERVISOR'];

const assignRoleSchema = z
  .object({
    userId: z.string().uuid(),
    role: z.enum(['SELLER', 'HUB_AGENT', 'HUB_SUPERVISOR', 'TRANSPORT_OPERATOR', 'CUSTOMER_SUPPORT', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'SUPER_ADMIN']),
    hubId: z.string().uuid().optional(),
  })
  .refine(data => !HUB_SCOPED_ROLES.includes(data.role) || !!data.hubId, {
    message: 'hubId is required for HUB_AGENT and HUB_SUPERVISOR roles',
    path: ['hubId'],
  })
  .refine(data => HUB_SCOPED_ROLES.includes(data.role) || !data.hubId, {
    message: 'hubId is only valid for HUB_AGENT and HUB_SUPERVISOR roles',
    path: ['hubId'],
  });

// Admin-gated bootstrap for role assignment (same requireAdmin shared-secret
// pattern as the rest of admin.ts) until the full admin dashboard
// (SCRUM-152) exists with a proper staff-management UI.
router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const { userId, role, hubId } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    next(new ApiError('NOT_FOUND', 'User not found', 404));
    return;
  }
  if (hubId) {
    const hub = await prisma.hub.findUnique({ where: { id: hubId } });
    if (!hub) {
      next(new ApiError('NOT_FOUND', 'Hub not found', 404));
      return;
    }
  }

  try {
    const userRole = await prisma.userRole.create({
      data: { userId, role, hubId: hubId ?? null },
    });
    await recordAuditLog(userId, 'FULFILMENT_ROLE_ASSIGNED', { role, hubId: hubId ?? null });
    res.status(201).json({ data: { id: userRole.id, userId: userRole.userId, role: userRole.role, hubId: userRole.hubId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      next(new ApiError('ALREADY_ASSIGNED', 'This user already has this role assignment', 409));
      return;
    }
    throw err;
  }
});

router.get('/:userId', requireAdmin, async (req: Request<{ userId: string }>, res: Response) => {
  const roles = await prisma.userRole.findMany({ where: { userId: req.params.userId } });
  res.status(200).json({ data: roles.map(r => ({ id: r.id, role: r.role, hubId: r.hubId, createdAt: r.createdAt })) });
});

router.delete('/:id', requireAdmin, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  const role = await prisma.userRole.findUnique({ where: { id: req.params.id } });
  if (!role) {
    next(new ApiError('NOT_FOUND', 'Role assignment not found', 404));
    return;
  }

  await prisma.userRole.delete({ where: { id: req.params.id } });
  await recordAuditLog(role.userId, 'FULFILMENT_ROLE_REVOKED', { role: role.role, hubId: role.hubId });
  res.status(204).send();
});

export default router;
