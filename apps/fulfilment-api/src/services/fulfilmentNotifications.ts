import { prisma } from '../prisma';
import { sendPushNotification } from '../lib/push';
import { sendSms } from '../lib/sms';

// Push-only -- sellers have an app account, so push is the natural channel
// (no email provider is integrated yet, per orderNotifications.ts's gap;
// SMS exists via Africa's Talking, see lib/sms.ts, but is reserved for
// buyers who have no account at all). Best-effort: never throws, so a
// notification failure never fails the drop-off-rejection request that
// triggered it.
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

// Buyers have no account (per the pivot brief) -- SMS to buyerContact is
// the only channel that reaches them. The plaintext code is passed in
// rather than re-read from the DB, since only its hash is ever stored
// (CollectionCode.codeHash) -- this is the one moment the plaintext exists
// in memory at all.
export async function notifyBuyerReadyForCollection(shipmentId: string, plaintextCode: string): Promise<void> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { reference: true, buyerContact: true, destinationHub: { select: { name: true, address: true } } },
  });
  if (!shipment) return;

  const label = shipment.reference ?? 'Your parcel';
  await sendSms(
    shipment.buyerContact,
    `${label} has arrived at ${shipment.destinationHub.name} (${shipment.destinationHub.address}) and is ready for collection. Your collection code is ${plaintextCode}. Please bring ID.`,
  );
}
