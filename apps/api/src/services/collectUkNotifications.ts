import { prisma } from '../prisma';
import { sendSms } from '../lib/sms';
import { sendEmail } from '../lib/email';
import { DeliveryResult } from '../lib/deliveryResult';
import { supabaseAdmin } from '../supabase';
import { generateBookingTrackingToken } from '../lib/collectUkBookingToken';
import { escapeHtml } from '../lib/escapeHtml';
import { logger } from '../logger';

function webAppUrl(): string {
  return process.env.WEB_APP_URL || 'http://localhost:3100';
}

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
    include: { company: true, collectionWindow: true },
  });
}

// Records every send attempt so best-effort delivery is no longer invisible
// (SCRUM-261). Never throws — a log-write failure must not fail the request.
async function recordNotification(entry: {
  bookingId?: string;
  shipmentId?: string;
  event: string;
  channel: 'SMS' | 'EMAIL';
  recipient: string;
  result: DeliveryResult;
}): Promise<void> {
  try {
    await prisma.collectUkNotificationLog.create({
      data: {
        bookingId: entry.bookingId ?? null,
        shipmentId: entry.shipmentId ?? null,
        event: entry.event,
        channel: entry.channel,
        recipient: entry.recipient,
        status: entry.result.status,
        provider: entry.result.provider ?? null,
        detail: entry.result.detail ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, event: entry.event }, 'failed to write Collect UK notification log');
  }
}

function defaultEmail(company: string, reference: string | null, message: string, bookingId: string): { subject: string; html: string } {
  const ref = reference ?? 'your collection';
  return {
    subject: `${company}: update on ${ref}`,
    html:
      `<p>${escapeHtml(message)}</p>` +
      `<p><a href="${trackingUrl(bookingId)}">Track your parcel</a></p>` +
      `<p>— ${escapeHtml(company)} via Vamba Collect</p>`,
  };
}

// Sends a customer notification over BOTH channels available for a guest:
// SMS to their phone, and email when they gave one at booking. Email is the
// reliable channel for UK numbers (SMS to +44 needs Twilio). Each attempt is
// logged; the whole thing is best-effort and never throws.
async function notify(
  bookingId: string,
  event: string,
  buildMessage: (b: NonNullable<Awaited<ReturnType<typeof loadBooking>>>) => string,
): Promise<void> {
  let booking: Awaited<ReturnType<typeof loadBooking>> = null;
  try {
    booking = await loadBooking(bookingId);
  } catch (err) {
    logger.error({ err, bookingId, event }, 'Collect UK notification: booking load failed');
    return;
  }
  if (!booking) return;

  const message = buildMessage(booking);

  const smsResult = await sendSms(booking.customerContact, message);
  await recordNotification({ bookingId, event, channel: 'SMS', recipient: booking.customerContact, result: smsResult });

  if (booking.customerEmail) {
    const { subject, html } = defaultEmail(booking.company.name, booking.reference, message, booking.id);
    const emailResult = await sendEmail(booking.customerEmail, subject, html);
    await recordNotification({ bookingId, event, channel: 'EMAIL', recipient: booking.customerEmail, result: emailResult });
  }
}

export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  await notify(bookingId, 'booking_confirmed', b => {
    // Customers don't pick dates -- they're told the company's collection
    // window (or that their week will be confirmed) and learn the exact
    // day later from the "collection scheduled" message.
    const when = b.collectionWindow
      ? `collection week ${formatDate(b.collectionWindow.startDate)} - ${formatDate(b.collectionWindow.endDate)}`
      : "we'll text you when your collection week is set";
    return `${b.company.name}: booking ${b.reference} received -- ${when}. Track your parcel: ${trackingUrl(b.id)}`;
  });
}

export async function notifyCollectionScheduled(bookingId: string, routeDate: Date): Promise<void> {
  await notify(
    bookingId,
    'collection_scheduled',
    b => `${b.company.name}: your parcel ${b.reference} is scheduled for collection on ${formatDate(routeDate)}.`,
  );
}

export async function notifyParcelCollected(bookingId: string): Promise<void> {
  await notify(
    bookingId,
    'parcel_collected',
    b => `${b.company.name}: we've collected your parcel ${b.reference}. It's on its way to our warehouse.`,
  );
}

export async function notifyUnableToCollect(bookingId: string, reason: string): Promise<void> {
  await notify(
    bookingId,
    'unable_to_collect',
    b => `${b.company.name}: we couldn't collect your parcel ${b.reference} (${reason}). Please contact us to rearrange.`,
  );
}

export async function notifyArrivedAtWarehouse(bookingId: string): Promise<void> {
  await notify(bookingId, 'arrived_at_warehouse', b => `${b.company.name}: your parcel ${b.reference} has arrived at our warehouse.`);
}

// Sent when a company declares a collection week and a previously
// windowless booking is swept into it -- the customer's "interest" turns
// into a real upcoming collection.
export async function notifyCollectionWeekSet(bookingId: string): Promise<void> {
  await notify(bookingId, 'collection_week_set', b => {
    if (!b.collectionWindow) return `${b.company.name}: your collection week for ${b.reference} will be confirmed soon.`;
    return `${b.company.name}: your collection week for ${b.reference} is set -- ${formatDate(b.collectionWindow.startDate)} to ${formatDate(b.collectionWindow.endDate)}. We'll text you your exact day.`;
  });
}

export async function notifyBookingCancelled(bookingId: string): Promise<void> {
  await notify(bookingId, 'booking_cancelled', b => `${b.company.name}: your collection ${b.reference} has been cancelled.`);
}

export async function notifyCollectionWillBeRescheduled(bookingId: string): Promise<void> {
  await notify(
    bookingId,
    'collection_rescheduling',
    b => `${b.company.name}: we're rescheduling the collection of your parcel ${b.reference} -- we'll text you the new date.`,
  );
}

export async function notifyHandedOver(bookingId: string): Promise<void> {
  await notify(
    bookingId,
    'handed_over',
    b =>
      `${b.company.name}: your parcel ${b.reference} has been received and will be shipped to ${b.destinationCountry}.`,
  );
}

// Driver applicants have a Vamba Collect account (email) AND gave a phone on the
// application, so both channels are used for the approve/reject decision:
// SMS reaches them today (lib/sms), email activates once a provider is
// configured (lib/email no-ops until then). Best-effort like everything
// else here.
async function driverContact(driverId: string): Promise<{ phone: string | null; fullName: string | null; email: string | null } | null> {
  const driver = await prisma.collectUkDriver.findUnique({
    where: { id: driverId },
    select: { userId: true, phone: true, fullName: true },
  });
  if (!driver) return null;
  let email: string | null = null;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(driver.userId);
    email = data.user?.email ?? null;
  } catch (err) {
    logger.error({ err, driverId }, 'could not look up driver email');
  }
  return { phone: driver.phone, fullName: driver.fullName, email };
}

export async function notifyDriverApproved(driverId: string): Promise<void> {
  try {
    const c = await driverContact(driverId);
    if (!c) return;
    const name = c.fullName ?? 'there';
    const portal = `${webAppUrl()}/collect-uk/driver`;
    if (c.email) {
      await sendEmail(
        c.email,
        "You're approved to drive for Vamba Collect",
        `<p>Hi ${escapeHtml(name)},</p><p>Good news — your application to drive for Vamba Collect has been approved. ` +
          `You can now sign in and see your collection routes.</p>` +
          `<p><a href="${portal}">Open your driver portal</a></p><p>— Vamba Collect</p>`,
      );
    }
    if (c.phone) {
      await sendSms(c.phone, `Vamba Collect: you're approved to drive! Sign in to see your routes: ${portal}`);
    }
  } catch (err) {
    logger.error({ err, driverId }, 'driver-approved notification failed');
  }
}

export async function notifyDriverRejected(driverId: string, reason: string | null): Promise<void> {
  try {
    const c = await driverContact(driverId);
    if (!c) return;
    const name = c.fullName ?? 'there';
    const reasonText = reason ? ` Reason: ${reason}.` : '';
    // Escaped copy for the HTML email; reasonText stays raw for the plaintext SMS.
    const emailReasonText = reason ? ` Reason: ${escapeHtml(reason)}.` : '';
    const apply = `${webAppUrl()}/collect-uk/drive`;
    if (c.email) {
      await sendEmail(
        c.email,
        'Your Vamba Collect driver application',
        `<p>Hi ${escapeHtml(name)},</p><p>Thanks for applying to drive for Vamba Collect. We weren't able to approve your ` +
          `application this time.${emailReasonText}</p><p>You can fix the issue and ` +
          `<a href="${apply}">apply again</a>.</p><p>— Vamba Collect</p>`,
      );
    }
    if (c.phone) {
      await sendSms(c.phone, `Vamba Collect: your driver application wasn't approved.${reasonText} Fix it and reapply: ${apply}`);
    }
  } catch (err) {
    logger.error({ err, driverId }, 'driver-rejected notification failed');
  }
}
