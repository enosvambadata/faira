import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requireAdmin } from '../middleware/requireAdmin';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';

const router = Router();

const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  companyId: z.string().uuid(),
  role: z.enum(['COMPANY_ADMIN', 'DISPATCHER']),
});

// Admin-gated bootstrap for adding a second team member to an existing
// company (the first COMPANY_ADMIN is assigned automatically at company
// creation, POST /collect-uk/companies) -- same requireAdmin shared-secret
// pattern as /fulfilment/user-roles, until a proper in-app "invite a
// teammate" flow exists.
router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const { userId, companyId, role } = parsed.data;

  const [user, company] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.collectUkCompany.findUnique({ where: { id: companyId } }),
  ]);
  if (!user) {
    next(new ApiError('NOT_FOUND', 'User not found', 404));
    return;
  }
  if (!company) {
    next(new ApiError('NOT_FOUND', 'Company not found', 404));
    return;
  }

  try {
    const companyRole = await prisma.collectUkCompanyRole.create({
      data: { userId, companyId, role },
    });
    await recordAuditLog(userId, 'COLLECT_UK_ROLE_ASSIGNED', { role, companyId });
    res.status(201).json({ data: { id: companyRole.id, userId: companyRole.userId, companyId: companyRole.companyId, role: companyRole.role } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      next(new ApiError('ALREADY_ASSIGNED', 'This user already has this role at this company', 409));
      return;
    }
    throw err;
  }
});

router.get('/:userId', requireAdmin, async (req: Request<{ userId: string }>, res: Response) => {
  const roles = await prisma.collectUkCompanyRole.findMany({ where: { userId: req.params.userId } });
  res.status(200).json({ data: roles.map(r => ({ id: r.id, role: r.role, companyId: r.companyId, createdAt: r.createdAt })) });
});

router.delete('/:id', requireAdmin, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  const role = await prisma.collectUkCompanyRole.findUnique({ where: { id: req.params.id } });
  if (!role) {
    next(new ApiError('NOT_FOUND', 'Role assignment not found', 404));
    return;
  }

  await prisma.collectUkCompanyRole.delete({ where: { id: req.params.id } });
  await recordAuditLog(role.userId, 'COLLECT_UK_ROLE_REVOKED', { role: role.role, companyId: role.companyId });
  res.status(204).send();
});

export default router;
