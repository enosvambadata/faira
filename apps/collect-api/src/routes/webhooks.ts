import { Router, Request, Response, NextFunction } from 'express';
import { ApiError } from '../errors/ApiError';
import { logger } from '../logger';
import type { RequestWithRawBody } from '../app';
import { constructWebhookEvent } from '../lib/collectUkStripe';
import { confirmCollectUkPayment } from '../services/collectUkPaymentConfirmation';
import type Stripe from 'stripe';

const router = Router();

// Vamba Collect card payments. The global express.json({ verify }) in app.ts
// captured the exact bytes on rawBody — which is what constructEvent must
// verify against (never the parsed req.body). Handles checkout.session.completed
// -> mark PAID, idempotently.
router.post('/stripe', async (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    next(new ApiError('CONFIG_ERROR', 'Stripe webhook secret is not configured', 500));
    return;
  }

  const rawBody = (req as RequestWithRawBody).rawBody;
  const signature = req.header('stripe-signature');
  if (!rawBody || !signature) {
    next(new ApiError('WEBHOOK_ERROR', 'Missing raw body or signature', 400));
    return;
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch {
    next(new ApiError('INVALID_SIGNATURE', 'Webhook signature verification failed', 401));
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
      await confirmCollectUkPayment(session.id, intentId);
    }
    res.status(200).send('OK');
  } catch (error) {
    logger.error({ err: error }, 'stripe webhook failed');
    next(new ApiError('WEBHOOK_ERROR', 'Failed to process Stripe webhook', 400));
  }
});

export default router;
