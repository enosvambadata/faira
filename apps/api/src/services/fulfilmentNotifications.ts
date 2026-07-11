import { prisma } from '../prisma';
import { sendPushNotification } from '../lib/push';

// Push-only, same gap noted in orderNotifications.ts — no email/SMS
// provider integrated yet, so the seller's in-app push token is the only
// channel available. Best-effort: never throws, so a notification failure
// never fails the drop-off-rejection request that triggered it.
export async function notifyDropoffRejected(shipmentId: string, reason: string): Promise<void> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      reference: true,
      seller: { select: { expoPushToken: true, pushNotificationsEnabled: true } },
    },
  });
  if (!shipment || !shipment.seller.pushNotificationsEnabled || !shipment.seller.expoPushToken) return;

  const label = shipment.reference ?? 'your shipment';
  await sendPushNotification({
    to: shipment.seller.expoPushToken,
    title: 'Drop-off not accepted',
    body: `${label} wasn't accepted at the hub: ${reason}`,
    data: { shipmentId },
  });
}
