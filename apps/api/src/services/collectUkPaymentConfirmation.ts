import { prisma } from '../prisma';
import { logger } from '../logger';

// Confirm a Collect UK / Vamba Shipping payment from a Stripe
// checkout.session.completed webhook. Idempotent + race-safe: the
// status: PENDING conditional update is the idempotency key, so a webhook
// that fires more than once (Stripe retries) only takes effect once. Mirrors
// the Paynow confirmOrderPayment guard.
export async function confirmCollectUkPayment(sessionId: string, paymentIntentId: string | null): Promise<void> {
  const payment = await prisma.collectUkPayment.findUnique({ where: { stripeSessionId: sessionId } });
  if (!payment) return;

  const updated = await prisma.collectUkPayment.updateMany({
    where: { id: payment.id, status: 'PENDING' },
    data: { status: 'PAID', paidAt: new Date(), stripePaymentIntentId: paymentIntentId },
  });
  if (updated.count === 0) return; // already handled, or no longer pending

  logger.info({ paymentId: payment.id, sessionId }, 'Collect UK payment confirmed via Stripe');
}
