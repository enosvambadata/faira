import { prisma } from '../prisma';
import { sendSms } from '../lib/sms';
import { generateShipmentTrackingToken } from '../lib/collectUkShipmentToken';
import { logger } from '../logger';

// Automated transit updates: the company posts a milestone once and every
// recipient on the shipment is texted their own tracking link. Best-effort
// throughout -- a send failure for one recipient never blocks the others,
// and the whole fan-out never fails the request that triggered it. Rides the
// same sendSms seam as booking notifications, so it starts delivering to +44
// numbers the moment a UK-capable provider is configured in lib/sms.ts.

function webAppUrl(): string {
  return process.env.WEB_APP_URL || 'http://localhost:3100';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function trackingUrl(recipientId: string): string {
  return `${webAppUrl()}/collect-uk/track-shipment/${generateShipmentTrackingToken(recipientId)}`;
}

interface MilestoneCopy {
  stage: string;
  location: string | null;
  note: string | null;
  pickupAddress: string | null;
  pickupFrom: Date | null;
  pickupTo: Date | null;
}

function buildMessage(companyName: string, reference: string, m: MilestoneCopy, recipientId: string): string {
  let body = `${companyName}: ${reference} -- ${m.stage}`;
  if (m.location) body += ` (${m.location})`;
  if (m.note) body += `. ${m.note}`;
  if (m.pickupAddress) {
    body += `. Ready for collection at ${m.pickupAddress}`;
    if (m.pickupFrom && m.pickupTo) body += ` between ${formatDate(m.pickupFrom)} and ${formatDate(m.pickupTo)}`;
    else if (m.pickupFrom) body += ` from ${formatDate(m.pickupFrom)}`;
  }
  body += `. Track: ${trackingUrl(recipientId)}`;
  return body;
}

// Returns the number of recipients dispatched to (used to stamp the
// milestone's notifiedCount). Never throws.
export async function notifyShipmentMilestone(shipmentId: string, milestoneId: string): Promise<number> {
  try {
    const shipment = await prisma.collectUkShipment.findUnique({
      where: { id: shipmentId },
      include: { company: true, recipients: true },
    });
    if (!shipment) return 0;

    const milestone = await prisma.collectUkShipmentMilestone.findUnique({ where: { id: milestoneId } });
    if (!milestone) return 0;

    let sent = 0;
    for (const r of shipment.recipients) {
      try {
        await sendSms(r.customerContact, buildMessage(shipment.company.name, shipment.reference, milestone, r.id));
        sent += 1;
      } catch (err) {
        logger.error({ err, recipientId: r.id }, 'shipment milestone SMS failed');
      }
    }
    return sent;
  } catch (err) {
    logger.error({ err, shipmentId, milestoneId }, 'shipment milestone notification failed');
    return 0;
  }
}
