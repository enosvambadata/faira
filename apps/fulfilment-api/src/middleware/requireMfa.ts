import { Response, NextFunction } from 'express';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { FulfilmentRequest } from './requireFulfilmentRole';

// Supabase embeds the authenticator assurance level ("aal1" = password
// only, "aal2" = MFA-verified) as a claim in the access token JWT. Must
// run after requireAuth, which already verified the token's signature
// and expiry via Supabase's API — this only needs to read the claim
// locally, not re-verify the token.
//
// Enforcement here assumes a factor has already been enrolled for the
// account (enrollment UI is a separate, apps/web-dependent ticket — see
// docs/fulfilment/ADR and SCRUM-152's admin dashboard). Until enrollment
// UI exists, an admin-tier account with no enrolled factor can never
// reach aal2 and will be correctly blocked here rather than silently
// let through.
function decodeAal(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as { aal?: string };
    return payload.aal ?? null;
  } catch {
    return null;
  }
}

export function requireMfa() {
  return async (req: FulfilmentRequest, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const aal = token ? decodeAal(token) : null;

    if (aal !== 'aal2') {
      await recordAuditLog(req.userId!, 'FULFILMENT_MFA_REQUIRED_DENIED', { aal });
      next(new ApiError('MFA_REQUIRED', 'Multi-factor authentication is required for this action', 401));
      return;
    }

    next();
  };
}
