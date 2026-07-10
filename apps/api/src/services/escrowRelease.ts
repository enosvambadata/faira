import { prisma } from '../prisma';
import { OrderStatus } from '@prisma/client';

// Exported so the checkout summary (SCRUM-59) can show buyers the same
// rate that's actually deducted from the seller's payout at release time,
// rather than a second hardcoded number that could drift out of sync.
export const COMMISSION_RATE = 0.05;

// Deliberately narrower than the state machine's generic PAID/SHIPPED ->
// DELIVERED *and* PENDING -> DELIVERED (the latter added for cash-on-
// delivery, SCRUM-56). Only PAID/SHIPPED orders ever had funds put into
// escrow — a PENDING order reaching DELIVERED went through mark-collected
// (COD) instead, which never created a HOLD entry and must never create a
// RELEASE/COMMISSION pair here.
const ESCROW_RELEASABLE_STATUSES: OrderStatus[] = ['PAID', 'SHIPPED'];

// Rounds to cents first so seller + commission always sum to exactly the
// original amount — computing both independently from percentages could
// drift by a cent either way. Exported so the dispute-resolution admin
// endpoint (SCRUM-57) can apply the same split to a partial-refund
// remainder rather than duplicating the rounding logic.
export function splitCommission(amount: number): { sellerAmount: number; commissionAmount: number } {
  const commissionAmount = Math.round(amount * COMMISSION_RATE * 100) / 100;
  return { sellerAmount: amount - commissionAmount, commissionAmount };
}

// Called from both the buyer's explicit delivery confirmation and the
// admin-triggered auto-release — either can win the race, so this uses the
// same atomic conditional-update pattern as confirmOrderPayment (guard on
// the exact current status) to guarantee at most one RELEASE/COMMISSION
// pair per order.
//
// An open dispute pauses release entirely (SCRUM-57) — since raising a
// dispute now transitions the order to DISPUTED (SCRUM-60), that's already
// excluded by ESCROW_RELEASABLE_STATUSES below, so no separate dispute
// lookup is needed here — order.status is the single source of truth.
export async function releaseEscrowFunds(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { listing: true },
  });
  if (!order) return { released: false, order: null };

  if (!ESCROW_RELEASABLE_STATUSES.includes(order.status)) {
    return { released: false, order };
  }

  const { count } = await prisma.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { status: 'COMPLETED' },
  });

  if (count === 0) {
    return { released: false, order };
  }

  const { sellerAmount, commissionAmount } = splitCommission(Number(order.priceAtPurchase));

  await prisma.$transaction([
    prisma.escrowLedgerEntry.create({
      data: {
        orderId: order.id,
        sellerId: order.listing.sellerId,
        type: 'RELEASE',
        amount: sellerAmount,
      },
    }),
    prisma.escrowLedgerEntry.create({
      data: {
        orderId: order.id,
        sellerId: order.listing.sellerId,
        type: 'COMMISSION',
        amount: commissionAmount,
      },
    }),
  ]);

  return { released: true, order: { ...order, status: 'COMPLETED' as const } };
}
