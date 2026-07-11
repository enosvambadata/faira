import { OrderStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { sendPushNotification } from '../lib/push';

// Email is not sent yet — there's no email-sending provider integrated
// anywhere in this app (Supabase's free tier can't send custom
// transactional emails; see the note in routes/auth.ts). Push-only until
// that gap is resolved, tracked the same way as the Paynow credentials
// blocker elsewhere in this project.
type CopyBuilder = (listingTitle: string) => { buyer: string; seller: string };

// Plain, non-technical language per SCRUM-65's second acceptance
// criterion — no "PAID"/"DISPUTED" jargon, no internal status names.
const STATUS_COPY: Partial<Record<OrderStatus, CopyBuilder>> = {
  PAID: title => ({
    buyer: `Your payment for "${title}" was received. The seller will get it ready soon.`,
    seller: `You've been paid for "${title}"! Time to get it ready to send.`,
  }),
  SHIPPED: title => ({
    buyer: `Good news — "${title}" is on its way to you!`,
    seller: `You marked "${title}" as shipped.`,
  }),
  COMPLETED: title => ({
    buyer: `Your order for "${title}" is complete. Thanks for shopping with Faira!`,
    seller: `Funds for "${title}" have been released to your balance.`,
  }),
  DISPUTED: title => ({
    buyer: `We've received your dispute for "${title}" and are looking into it.`,
    seller: `A dispute was raised for "${title}". We're reviewing it and will be in touch.`,
  }),
  REFUNDED: title => ({
    buyer: `Your order for "${title}" has been refunded.`,
    seller: `The dispute for "${title}" was resolved with a refund to the buyer.`,
  }),
};

// Called after every order status transition (payment confirmation,
// shipping, escrow release, disputes) — fetches its own copy of the order
// so call sites don't need to pass buyer/seller push details around.
// Best-effort: a notification failure never fails the transition that
// triggered it, same philosophy as sendPushNotification itself.
export async function notifyOrderStatusChange(orderId: string, status: OrderStatus): Promise<void> {
  const copyBuilder = STATUS_COPY[status];
  if (!copyBuilder) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      listing: {
        select: {
          title: true,
          seller: { select: { expoPushToken: true, pushNotificationsEnabled: true } },
        },
      },
      buyer: { select: { expoPushToken: true, pushNotificationsEnabled: true } },
    },
  });
  if (!order) return;

  const copy = copyBuilder(order.listing.title);

  const sends: Promise<void>[] = [];
  if (order.buyer.pushNotificationsEnabled && order.buyer.expoPushToken) {
    sends.push(
      sendPushNotification({
        to: order.buyer.expoPushToken,
        title: 'Order update',
        body: copy.buyer,
        data: { orderId: order.id },
      }),
    );
  }
  if (order.listing.seller.pushNotificationsEnabled && order.listing.seller.expoPushToken) {
    sends.push(
      sendPushNotification({
        to: order.listing.seller.expoPushToken,
        title: 'Order update',
        body: copy.seller,
        data: { orderId: order.id },
      }),
    );
  }

  await Promise.all(sends);
}
