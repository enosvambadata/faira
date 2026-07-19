import { prisma } from '../prisma';

// Anti-leakage (SCRUM-257): messages keep an admin-only `bodyRaw` (the original,
// pre-redaction text) so disputes have the real conversation. That raw copy is
// PII we don't want to hold forever — once an order has closed and its dispute
// window is long past, we purge bodyRaw and keep only the redacted body + the
// containedContactInfo flag.

const DAY_MS = 24 * 60 * 60 * 1000;

// How long after an order closes we retain raw message text. The active dispute
// window is only ~5 days post-payment (see admin auto-release), so 30 days is a
// generous buffer for a late or reopened complaint.
export const RAW_MESSAGE_RETENTION_DAYS = 30;

// Terminal states with no dispute still pending. DISPUTED (open complaint) and
// every pre-close state are deliberately excluded so their raw text survives.
const CLOSED_ORDER_STATES = ['COMPLETED', 'CANCELLED', 'REFUNDED'] as const;

// A conversation is keyed to an order by (listingId, buyerId) — Conversation has
// a @@unique on exactly that pair — so a closed order maps to one conversation.
async function purgeableConversationIds(retentionDays: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
  const closedOrders = await prisma.order.findMany({
    where: { status: { in: [...CLOSED_ORDER_STATES] }, updatedAt: { lt: cutoff } },
    select: { listingId: true, buyerId: true },
  });
  if (closedOrders.length === 0) return [];

  const conversations = await prisma.conversation.findMany({
    where: { OR: closedOrders.map(o => ({ listingId: o.listingId, buyerId: o.buyerId })) },
    select: { id: true },
  });
  return conversations.map(c => c.id);
}

/** How many raw message bodies are currently eligible for purge (dry run). */
export async function countPurgeableRawMessages(retentionDays = RAW_MESSAGE_RETENTION_DAYS): Promise<number> {
  const ids = await purgeableConversationIds(retentionDays);
  if (ids.length === 0) return 0;
  return prisma.message.count({ where: { conversationId: { in: ids }, bodyRaw: { not: null } } });
}

/** Null out bodyRaw for messages of closed orders past the retention window. */
export async function purgeExpiredMessageRawBodies(retentionDays = RAW_MESSAGE_RETENTION_DAYS): Promise<number> {
  const ids = await purgeableConversationIds(retentionDays);
  if (ids.length === 0) return 0;
  const result = await prisma.message.updateMany({
    where: { conversationId: { in: ids }, bodyRaw: { not: null } },
    data: { bodyRaw: null },
  });
  return result.count;
}
