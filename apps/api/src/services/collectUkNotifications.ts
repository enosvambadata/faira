import { prisma } from '../prisma';
import { sendSms } from '../lib/sms';
import { generateBookingTrackingToken } from '../lib/collectUkBookingToken';
import { logger } from '../logger';

// Collect UK customers are guests with no account (per the ADR's guest
// booking decision) -- SMS to customerContact is the only channel that
// reaches them, exactly like Fulfilment's buyers. Best-effort throughout:
// every exported function swallows its own errors, so a notification
// failure can never fail the booking/collection/handover request that
// triggered it.
//
// Transport note: sendSms rides the existing Africa's Talking integration.
// Delivery to +44 numbers is unverified (AT's coverage is African telcos);
// when a UK-capable provider is chosen the swap happens inside lib/sms.ts
// alone -- nothing here changes.

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function trackingUrl(bookingId: string): string {
  const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3100';
  return `${webAppUrl}/collect-uk/track/${generateBookingTrackingToken(bookingId)}`;
}

async function loadBooking(bookingId: string) {
  return prisma.collectUkCollectionBooking.findUnique({
    where: { id: bookingId },
    include: { company: true },
  });
}

async function notify(bookingId: string, buildMessage: (b: NonNullable<Awaited<ReturnType<typeof loadBooking>>>) => string): Promise<void> {
  try {
    const booking = await loadBooking(bookingId);
    if (!booking) return;
    await sendSms(booking.customerContact, buildMessage(booking));
  } catch (err) {
    logger.error({ err, bookingId }, 'Collect UK notification failed');
  }
}

export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  await notify(
    bookingId,
    b =>
      `${b.company.name}: collection ${b.reference} booked for ${formatDate(b.preferredDate)}. Track your parcel: ${trackingUrl(b.id)}`,
  );
}

export async function notifyCollectionScheduled(bookingId: string, routeDate: Date): Promise<void> {
  await notify(
    bookingId,
    b => `${b.company.name}: your parcel ${b.reference} is scheduled for collection on ${formatDate(routeDate)}.`,
  );
}

export async function notifyParcelCollected(bookingId: string): Promise<void> {
  await notify(
    bookingId,
    b => `${b.company.name}: we've collected your parcel ${b.reference}. It's on its way to our warehouse.`,
  );
}

export async function notifyUnableToCollect(bookingId: string, reason: string): Promise<void> {
  await notify(
    bookingId,
    b => `${b.company.name}: we couldn't collect your parcel ${b.reference} (${reason}). Please contact us to rearrange.`,
  );
}

export async function notifyArrivedAtWarehouse(bookingId: string): Promise<void> {
  await notify(bookingId, b => `${b.company.name}: your parcel ${b.reference} has arrived at our warehouse.`);
}

export async function notifyHandedOver(bookingId: string): Promise<void> {
  await notify(
    bookingId,
    b =>
      `${b.company.name}: your parcel ${b.reference} has been received and will be shipped to ${b.destinationCountry}.`,
  );
}
