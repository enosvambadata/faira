import { prisma } from '../prisma';
import { canTransition } from '../lib/orderStateMachine';

// Called from both the buyer-facing poll route and the Paynow result
// webhook — either can win the race to confirm a payment, so this uses an
// atomic conditional update (status: PENDING guard) rather than a plain
// read-then-write, to guarantee at most one escrow HOLD entry per order
// even if both fire near-simultaneously.
export async function confirmOrderPayment(orderId: string, paynowReference: string | null) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      listing: true,
      payments: { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!order) return null;

  const pendingPayment = order.payments[0];
  // canTransition guards against confirming a payment that arrives for an
  // order that's no longer PENDING (e.g. already cancelled) — leave both
  // the order and the stray payment untouched rather than silently
  // marking it CONFIRMED with no matching escrow entry.
  if (!pendingPayment || !canTransition(order.status, 'PAID')) return order;

  const { count } = await prisma.order.updateMany({
    where: { id: order.id, status: 'PENDING' },
    data: { status: 'PAID' },
  });

  if (count === 0) {
    await prisma.payment.update({
      where: { id: pendingPayment.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        paynowReference: paynowReference ?? pendingPayment.paynowReference,
      },
    });
    return order;
  }

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: pendingPayment.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        paynowReference: paynowReference ?? pendingPayment.paynowReference,
      },
    }),
    prisma.escrowLedgerEntry.create({
      data: {
        orderId: order.id,
        sellerId: order.listing.sellerId,
        type: 'HOLD',
        amount: order.priceAtPurchase,
      },
    }),
  ]);

  return order;
}
