import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

// Reuses the marketplace's AuditLog model (userId/action/details/createdAt)
// rather than a separate Fulfilment-specific table — the shape already
// fits, and audit records must not be duplicated across product lines.
// No update/delete route is ever exposed for AuditLog rows anywhere in
// this API; this function is append-only by construction.
export async function recordAuditLog(userId: string, action: string, details?: Prisma.InputJsonValue): Promise<void> {
  await prisma.auditLog.create({
    data: { userId, action, details: details ?? Prisma.JsonNull },
  });
}
