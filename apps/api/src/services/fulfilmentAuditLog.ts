import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { logger } from '../logger';

// Reuses the marketplace's AuditLog model (userId/action/details/createdAt)
// rather than a separate Fulfilment-specific table — the shape already
// fits, and audit records must not be duplicated across product lines.
// No update/delete route is ever exposed for AuditLog rows anywhere in
// this API; this function is append-only by construction.
//
// Best-effort: callers invoke this AFTER the state-changing transaction has
// committed, so a failed audit write must never surface as a request error
// for an operation that already succeeded (which would return a misleading
// 500 and push the client into a retry that hits the state guard). Same
// swallow-and-log philosophy as the SMS/email/push helpers.
export async function recordAuditLog(userId: string, action: string, details?: Prisma.InputJsonValue): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { userId, action, details: details ?? Prisma.JsonNull },
    });
  } catch (err) {
    logger.error({ err, userId, action }, 'audit log write failed');
  }
}
