import { prisma } from '../prisma';
import { canTransition } from '../lib/orderStateMachine';
import { notifyOrderStatusChange } from './orderNotifications';

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

  // The PENDING->PAID flip, the payment confirmation, and the escrow HOLD must
  // commit together: a crash between a standalone status update and a separate
  // ledger write would leave a PAID order with no HOLD (money never recorded as
  // held, so a later release pays out unheld funds). Do all three in one
  // interactive transaction; count===0 means we lost the confirm race.
  const confirmed = await prisma.$transaction(async tx => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'PAID' },
    });
    if (count === 0) return false;

    await tx.payment.update({
      where: { id: pendingPayment.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        paynowReference: paynowReference ?? pendingPayment.paynowReference,
      },
    });
    await tx.escrowLedgerEntry.create({
      data: {
        orderId: order.id,
        sellerId: order.listing.sellerId,
        type: 'HOLD',
        amount: order.priceAtPurchase,
      },
    });
    return true;
  });

  if (!confirmed) {
    // Lost the race: another confirm (webhook vs poll) already flipped the
    // order to PAID and wrote the HOLD. Just mark this stray pending payment
    // CONFIRMED -- no ledger effect, so it stays outside the transaction.
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

  await notifyOrderStatusChange(order.id, 'PAID');

  return order;
}
