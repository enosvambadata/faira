import Stripe from 'stripe';

// Stripe is env-gated (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET): the whole
// payments feature merges safely and only goes live once the keys are set --
// same philosophy as the SMS/email transports. This is Vamba's own single
// Stripe account (Vamba Shipping is a Vamba product), not per-company Connect.
let cached: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  if (!cached) cached = new Stripe(key);
  return cached;
}

export async function createCheckoutSession(params: {
  amountPence: number;
  currency: string;
  description: string;
  customerName: string;
  brandName: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string | null }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: params.currency,
          product_data: {
            name: `${params.brandName} — ${params.customerName}`.slice(0, 250),
            description: params.description.slice(0, 500),
          },
          unit_amount: params.amountPence,
        },
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
  return { id: session.id, url: session.url };
}

export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
