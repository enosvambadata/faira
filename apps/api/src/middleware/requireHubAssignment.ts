import { Response, NextFunction } from 'express';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { FulfilmentRequest } from './requireFulfilmentRole';

// Must run after requireFulfilmentRole(HUB_AGENT, HUB_SUPERVISOR, ...) —
// reads the roles it already resolved rather than re-querying the
// database. hubId is read from req.params[hubIdParam]; a Hub Agent
// assigned only to Bulawayo cannot action a Harare shipment/hub even
// though they hold the HUB_AGENT role generally.
export function requireHubAssignment(hubIdParam: string) {
  return async (req: FulfilmentRequest, _res: Response, next: NextFunction): Promise<void> => {
    const targetHubId = req.params[hubIdParam];
    const roles = req.fulfilmentRoles ?? [];

    const assigned = roles.some(r => r.hubId === targetHubId);
    if (!assigned) {
      await recordAuditLog(req.userId!, 'FULFILMENT_HUB_ASSIGNMENT_DENIED', {
        targetHubId,
        actualHubAssignments: roles.map(r => r.hubId),
      });
      next(new ApiError('FORBIDDEN', 'You are not assigned to this hub', 403));
      return;
    }

    next();
  };
}
