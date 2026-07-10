import { prisma } from '../prisma';
import { OrderStatus } from '@prisma/client';

const COMMISSION_RATE = 0.05;

// Deliberately narrower than the state machine's generic PAID/SHIPPED ->
// DELIVERED *and* PENDING -> DELIVERED (the latter added for cash-on-
// delivery, SCRUM-56). Only PAID/SHIPPED orders ever had funds put into
// escrow — a PENDING order reaching DELIVERED went through mark-collected
// (COD) instead, which never created a HOLD entry and must never create a
// RELEASE/COMMISSION pair here.
const ESCROW_RELEASABLE_STATUSES: OrderStatus[] = ['PAID', 'SHIPPED'];

// Rounds to cents first so seller + commission always sum to exactly the
// original amount — computing both independently from percentages could
// drift by a cent either way.
function splitCommission(amount: number): { sellerAmount: number; commissionAmount: number } {
  const commissionAmount = Math.round(amount * COMMISSION_RATE * 100) / 100;
  return { sellerAmount: amount - commissionAmount, commissionAmount };
}

// Called from both the buyer's explicit delivery confirmation and the
// admin-triggered auto-release — either can win the race, so this uses the
// same atomic conditional-update pattern as confirmOrderPayment (guard on
// the exact current status) to guarantee at most one RELEASE/COMMISSION
// pair per order.
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
    data: { status: 'DELIVERED' },
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

  return { released: true, order: { ...order, status: 'DELIVERED' as const } };
}
