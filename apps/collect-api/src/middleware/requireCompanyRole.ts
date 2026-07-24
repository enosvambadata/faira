import { Response, NextFunction } from 'express';
import { CollectUkCompanyRoleType } from '@prisma/client';
import { prisma } from '../prisma';
import { ApiError } from '../errors/ApiError';
import { AuthenticatedRequest } from './requireAuth';
import { recordAuditLog } from '../services/fulfilmentAuditLog';

export interface CompanyRequest extends AuthenticatedRequest {
  companyRoles?: { role: CollectUkCompanyRoleType; companyId: string }[];
}

// Mirrors requireFulfilmentRole -- runs after requireAuth, fails closed (no
// matching CollectUkCompanyRole row means no access). Deliberately a
// separate table/middleware from Fulfilment's hub-scoped role system, not
// a shared one -- see docs/collect-uk/01-architecture-decision-record.md.
export function requireCompanyRole(...allowedRoles: CollectUkCompanyRoleType[]) {
  return async (req: CompanyRequest, _res: Response, next: NextFunction): Promise<void> => {
    const roles = await prisma.collectUkCompanyRole.findMany({ where: { userId: req.userId! } });

    const matching = roles.filter(r => allowedRoles.includes(r.role));
    if (matching.length === 0) {
      await recordAuditLog(req.userId!, 'COLLECT_UK_PERMISSION_DENIED', {
        requiredRoles: allowedRoles,
        actualRoles: roles.map(r => r.role),
      });
      next(new ApiError('FORBIDDEN', 'You do not have permission to perform this action', 403));
      return;
    }

    req.companyRoles = matching.map(r => ({ role: r.role, companyId: r.companyId }));
    next();
  };
}
