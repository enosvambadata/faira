import { Response, NextFunction } from 'express';
import { CollectUkDriver } from '@prisma/client';
import { prisma } from '../prisma';
import { ApiError } from '../errors/ApiError';
import { AuthenticatedRequest } from './requireAuth';

export interface DriverRequest extends AuthenticatedRequest {
  driver?: CollectUkDriver;
}

// A driver's identity is just "does a CollectUkDriver row exist for this
// user", not a role/permission table like CompanyRole or UserRole --
// drivers aren't tenant-scoped or hub-scoped, they're a single flat set of
// Faira employees. Fails closed: no driver row means no access.
export async function requireCollectUkDriver(req: DriverRequest, _res: Response, next: NextFunction): Promise<void> {
  const driver = await prisma.collectUkDriver.findUnique({ where: { userId: req.userId! } });
  if (!driver || driver.status !== 'ACTIVE') {
    // APPLIED/REJECTED applicants and deactivated drivers are all locked
    // out of operational routes -- only a Faira-approved driver may see or
    // resolve stops. The portal's /me endpoint (requireAuth only) is how
    // an applicant checks their application status.
    next(new ApiError('FORBIDDEN', 'You are not an approved driver', 403));
    return;
  }

  req.driver = driver;
  next();
}
