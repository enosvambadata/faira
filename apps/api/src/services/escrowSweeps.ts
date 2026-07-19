import { prisma } from '../prisma';
import { releaseEscrowFunds } from './escrowRelease';
import { notifyOrderStatusChange } from './orderNotifications';
import { sendPushNotification } from '../lib/push';

// The two escrow timer sweeps (SCRUM-258). This is the only place in the system
// where a timer — not a human — decides which direction money moves, so both
// sweeps re-check state atomically at fire time and route through the existing
// escrow paths (no parallel money logic):
//
//   Sweep A (release): a SHIPPED courier/postal order the buyer never confirmed
//     → pay the seller. Measured from the seller-declared dispatch (shippedAt),
//     the strongest delivery signal available (there is no courier scan or
//     collection-code redemption in the marketplace flow). MEETUP is excluded —
//     it has no dispatch evidence at all, so it stays buyer-confirm-only.
//
//   Sweep B (refund): a PAID order the seller never shipped → cancel and refund
//     the buyer. The necessary mirror of releasing only SHIPPED orders: without
//     it, a seller who takes payment and never ships leaves funds stuck forever.
//
// Because the signal (shippedAt) is self-reported by the payee, the release
// window is deliberately generous and the buyer gets a loud grace reminder
// first — the window and reminder do the fraud-protection work.

const DAY_MS = 24 * 60 * 60 * 1000;

export const RELEASE_WINDOW_DAYS = 7; // Sweep A: days from shippedAt to auto-release
export const RELEASE_REMINDER_DAYS = 5; // buyer grace reminder, 2 days before release
export const REFUND_WINDOW_DAYS = 4; // Sweep B: days from payment to auto-cancel
export const REFUND_REMINDER_DAYS = 2; // seller "ship or lose it" reminder, 2 days before

// MEETUP is intentionally absent — no dispatch evidence, never auto-released.
const AUTO_RELEASE_METHODS = ['COURIER', 'POSTAL'] as const;

export interface SweepResult {
  remindersSent: number;
  actioned: number;
}

/**
 * Sweep A — auto-release SHIPPED courier/postal orders whose buyer never
 * confirmed, 7 days after dispatch. Sends a day-5 grace reminder first.
 */
export async function runAutoReleaseSweep(now: Date = new Date()): Promise<SweepResult> {
  const nowMs = now.getTime();
  const reminderCutoff = new Date(nowMs - RELEASE_REMINDER_DAYS * DAY_MS);
  const releaseCutoff = new Date(nowMs - RELEASE_WINDOW_DAYS * DAY_MS);
  let remindersSent = 0;
  let actioned = 0;

  // Day-5 grace reminder to the buyer (only those still inside the window and
  // not yet reminded), so a forgotten confirmation gets one loud nudge.
  const toRemind = await prisma.order.findMany({
    where: {
      status: 'SHIPPED',
      shippingMethod: { in: [...AUTO_RELEASE_METHODS] },
      shippedAt: { lte: reminderCutoff, gt: releaseCutoff },
      autoReleaseReminderAt: null,
    },
    include: {
      listing: { select: { title: true } },
      buyer: { select: { expoPushToken: true, pushNotificationsEnabled: true } },
    },
  });
  for (const order of toRemind) {
    if (order.buyer.pushNotificationsEnabled && order.buyer.expoPushToken) {
      await sendPushNotification({
        to: order.buyer.expoPushToken,
        title: 'Confirm your delivery',
        body: `Did "${order.listing.title}" arrive? Confirm delivery, or the seller is paid automatically in ${RELEASE_WINDOW_DAYS - RELEASE_REMINDER_DAYS} days.`,
        data: { orderId: order.id },
      });
    }
    await prisma.order.update({ where: { id: order.id }, data: { autoReleaseReminderAt: new Date() } });
    remindersSent++;
  }

  // Day-7 release. releaseEscrowFunds re-reads the order and guards on its exact
  // current status atomically, so a dispute (now DISPUTED) or an order already
  // released loses the race and is skipped — no separate dispute lookup needed.
  const toRelease = await prisma.order.findMany({
    where: {
      status: 'SHIPPED',
      shippingMethod: { in: [...AUTO_RELEASE_METHODS] },
      shippedAt: { lte: releaseCutoff },
    },
    select: { id: true },
  });
  for (const order of toRelease) {
    const { released } = await releaseEscrowFunds(order.id);
    if (released) actioned++;
  }

  return { remindersSent, actioned };
}

/**
 * Sweep B — auto-cancel + refund PAID orders the seller never shipped, 4 days
 * after payment. Sends a day-2 "ship or lose it" reminder to the seller first.
 */
export async function runAutoRefundSweep(now: Date = new Date()): Promise<SweepResult> {
  const nowMs = now.getTime();
  const reminderCutoff = new Date(nowMs - REFUND_REMINDER_DAYS * DAY_MS);
  const refundCutoff = new Date(nowMs - REFUND_WINDOW_DAYS * DAY_MS);
  let remindersSent = 0;
  let actioned = 0;

  // PAID + never shipped, with a confirmed payment (the clock starts at payment
  // confirmation). We re-derive the per-order age from the latest confirmation.
  const candidates = await prisma.order.findMany({
    where: { status: 'PAID', shippedAt: null, payments: { some: { status: 'CONFIRMED' } } },
    include: {
      listing: {
        select: {
          title: true,
          sellerId: true,
          seller: { select: { expoPushToken: true, pushNotificationsEnabled: true } },
        },
      },
      payments: { where: { status: 'CONFIRMED' }, orderBy: { confirmedAt: 'desc' }, take: 1 },
    },
  });

  for (const order of candidates) {
    const confirmedAt = order.payments[0]?.confirmedAt;
    if (!confirmedAt) continue;

    // Day-2 reminder to the seller (inside the window, not yet reminded).
    if (confirmedAt <= reminderCutoff && confirmedAt > refundCutoff && !order.autoRefundReminderAt) {
      const seller = order.listing.seller;
      if (seller.pushNotificationsEnabled && seller.expoPushToken) {
        await sendPushNotification({
          to: seller.expoPushToken,
          title: 'Ship your order',
          body: `Send "${order.listing.title}" within ${REFUND_WINDOW_DAYS - REFUND_REMINDER_DAYS} days, or the order is cancelled and the buyer refunded.`,
          data: { orderId: order.id },
        });
      }
      await prisma.order.update({ where: { id: order.id }, data: { autoRefundReminderAt: new Date() } });
      remindersSent++;
      continue;
    }

    // Day-4 refund. Atomic guard on status:'PAID' — if the seller marked SHIPPED
    // (now under Sweep A's jurisdiction) or a dispute fired (now DISPUTED) in the
    // gap between select and here, count===0 and we skip: one transition wins,
    // never double-handled. Reuses the existing escrow REFUND ledger path.
    if (confirmedAt <= refundCutoff) {
      const applied = await prisma.$transaction(async tx => {
        const { count } = await tx.order.updateMany({
          where: { id: order.id, status: 'PAID' },
          data: { status: 'REFUNDED' },
        });
        if (count === 0) return false;
        await tx.escrowLedgerEntry.create({
          data: { orderId: order.id, sellerId: order.listing.sellerId, type: 'REFUND', amount: Number(order.priceAtPurchase) },
        });
        return true;
      });
      if (applied) {
        actioned++;
        await notifyOrderStatusChange(order.id, 'REFUNDED');
      }
    }
  }

  return { remindersSent, actioned };
}
