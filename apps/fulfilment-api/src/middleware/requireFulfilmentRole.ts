import { Response, NextFunction } from 'express';
import { FulfilmentRole } from '@prisma/client';
import { prisma } from '../prisma';
import { ApiError } from '../errors/ApiError';
import { AuthenticatedRequest } from './requireAuth';
import { recordAuditLog } from '../services/fulfilmentAuditLog';

export interface FulfilmentRequest extends AuthenticatedRequest {
  fulfilmentRoles?: { role: FulfilmentRole; hubId: string | null }[];
}

// Runs after requireAuth (uses req.userId it already set) — never
// re-verifies the Supabase token itself. Fails closed: no matching
// UserRole row means no access, same fail-closed convention as the
// existing requireAdmin middleware.
export function requireFulfilmentRole(...allowedRoles: FulfilmentRole[]) {
  return async (req: FulfilmentRequest, _res: Response, next: NextFunction): Promise<void> => {
    const roles = await prisma.userRole.findMany({ where: { userId: req.userId! } });

    const matching = roles.filter(r => allowedRoles.includes(r.role));
    if (matching.length === 0) {
      await recordAuditLog(req.userId!, 'FULFILMENT_PERMISSION_DENIED', {
        requiredRoles: allowedRoles,
        actualRoles: roles.map(r => r.role),
      });
      next(new ApiError('FORBIDDEN', 'You do not have permission to perform this action', 403));
      return;
    }

    req.fulfilmentRoles = matching.map(r => ({ role: r.role, hubId: r.hubId }));
    next();
  };
}
