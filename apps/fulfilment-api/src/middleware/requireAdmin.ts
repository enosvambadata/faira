import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../errors/ApiError';

// A shared-secret header rather than a real admin role/session system —
// there's no admin dashboard yet (SCRUM-48 deliberately scoped that out),
// so this exists only to let the founder call the admin endpoints directly.
// Fails closed (rejects everyone) if ADMIN_TOKEN isn't configured, rather
// than accepting any request when the env var is merely unset.
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const configuredToken = process.env.ADMIN_TOKEN;

  if (!configuredToken) {
    next(new ApiError('ADMIN_NOT_CONFIGURED', 'Admin access is not configured', 500));
    return;
  }

  const providedToken = req.header('x-admin-token');

  if (providedToken !== configuredToken) {
    next(new ApiError('UNAUTHENTICATED', 'Invalid or missing admin token', 401));
    return;
  }

  next();
}
