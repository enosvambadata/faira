import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireCompanyRole, CompanyRequest } from '../middleware/requireCompanyRole';
import { isAssignedToCompany } from '../lib/companyAssignment';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { hasLiveDriverRecord, DRIVER_BLOCKS_COMPANY } from '../lib/collectUkRoleExclusion';
import { findAuthUserIdByEmail, getUserEmail } from '../lib/collectUkAuthLookup';

// Self-serve team management: a COMPANY_ADMIN manages who can access their
// company (Admin or Dispatcher). Distinct from collectUkCompanyRoles.ts, which
// is the platform-admin (ADMIN_TOKEN) bootstrap. Only admins may manage a team.
const router = Router();

async function denyIfNotAssigned(req: CompanyRequest, companyId: string, next: NextFunction): Promise<boolean> {
  if (isAssignedToCompany(req, companyId)) return false;
  await recordAuditLog(req.userId!, 'COLLECT_UK_COMPANY_ASSIGNMENT_DENIED', {
    targetCompanyId: companyId,
    actualCompanyAssignments: (req.companyRoles ?? []).map(r => r.companyId),
  });
  next(new ApiError('FORBIDDEN', 'You are not assigned to this company', 403));
  return true;
}

const addSchema = z.object({
  email: z.email(),
  role: z.enum(['COMPANY_ADMIN', 'DISPATCHER']),
});

const changeSchema = z.object({ role: z.enum(['COMPANY_ADMIN', 'DISPATCHER']) });

router.get(
  '/:id/team',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN'),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const roles = await prisma.collectUkCompanyRole.findMany({
      where: { companyId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    const members = await Promise.all(
      roles.map(async r => ({
        roleId: r.id,
        userId: r.userId,
        role: r.role,
        email: await getUserEmail(r.userId),
        isYou: r.userId === req.userId,
        createdAt: r.createdAt,
      })),
    );
    res.status(200).json({ data: members });
  },
);

router.post(
  '/:id/team',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN'),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const userId = await findAuthUserIdByEmail(parsed.data.email);
    if (!userId) {
      next(
        new ApiError(
          'NO_ACCOUNT',
          'No Vamba account with that email. Ask them to sign up first, then add them.',
          404,
        ),
      );
      return;
    }
    if (await hasLiveDriverRecord(userId)) {
      next(new ApiError('ROLE_CONFLICT', DRIVER_BLOCKS_COMPANY, 409));
      return;
    }

    // The invitee may have signed up but never made an authed request, so the
    // app `users` row (the role FK target) might not exist yet.
    await prisma.user.upsert({ where: { id: userId }, update: {}, create: { id: userId } });

    try {
      const role = await prisma.collectUkCompanyRole.create({
        data: { userId, companyId: req.params.id, role: parsed.data.role },
      });
      await recordAuditLog(req.userId!, 'COLLECT_UK_TEAM_MEMBER_ADDED', {
        companyId: req.params.id,
        memberUserId: userId,
        role: parsed.data.role,
      });
      res.status(201).json({
        data: { roleId: role.id, userId, email: parsed.data.email, role: role.role, isYou: userId === req.userId, createdAt: role.createdAt },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        next(new ApiError('ALREADY_MEMBER', "They're already on your team.", 409));
        return;
      }
      throw err;
    }
  },
);

router.patch(
  '/:id/team/:roleId',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN'),
  async (req: CompanyRequest & { params: { id: string; roleId: string } }, res: Response, next: NextFunction) => {
    const parsed = changeSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const role = await prisma.collectUkCompanyRole.findUnique({ where: { id: req.params.roleId } });
    if (!role || role.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No such team member', 404));
      return;
    }

    // Never leave a company with no admin.
    if (role.role === 'COMPANY_ADMIN' && parsed.data.role !== 'COMPANY_ADMIN') {
      const admins = await prisma.collectUkCompanyRole.count({ where: { companyId: req.params.id, role: 'COMPANY_ADMIN' } });
      if (admins <= 1) {
        next(new ApiError('LAST_ADMIN', "Make someone else an admin before changing the last admin's role.", 409));
        return;
      }
    }

    const updated = await prisma.collectUkCompanyRole.update({ where: { id: role.id }, data: { role: parsed.data.role } });
    await recordAuditLog(req.userId!, 'COLLECT_UK_TEAM_ROLE_CHANGED', {
      companyId: req.params.id,
      memberUserId: role.userId,
      role: parsed.data.role,
    });
    res.status(200).json({
      data: { roleId: updated.id, userId: updated.userId, email: await getUserEmail(updated.userId), role: updated.role, isYou: updated.userId === req.userId, createdAt: updated.createdAt },
    });
  },
);

router.delete(
  '/:id/team/:roleId',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN'),
  async (req: CompanyRequest & { params: { id: string; roleId: string } }, res: Response, next: NextFunction) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const role = await prisma.collectUkCompanyRole.findUnique({ where: { id: req.params.roleId } });
    if (!role || role.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No such team member', 404));
      return;
    }

    if (role.role === 'COMPANY_ADMIN') {
      const admins = await prisma.collectUkCompanyRole.count({ where: { companyId: req.params.id, role: 'COMPANY_ADMIN' } });
      if (admins <= 1) {
        next(new ApiError('LAST_ADMIN', "You can't remove the last admin. Make someone else an admin first.", 409));
        return;
      }
    }

    await prisma.collectUkCompanyRole.delete({ where: { id: role.id } });
    await recordAuditLog(req.userId!, 'COLLECT_UK_TEAM_MEMBER_REMOVED', {
      companyId: req.params.id,
      memberUserId: role.userId,
      role: role.role,
    });
    res.status(200).json({ data: { roleId: role.id, deleted: true } });
  },
);

export default router;
