import { CollectUkBookingStatus } from '@prisma/client';

// Customer-facing wording -- separate from any future internal/dispatcher
// status display, same reasoning as Fulfilment's buyerTrackingStatus.ts
// being kept apart from displayStatus(). Several internal statuses
// collapse to the same customer-facing message since the distinction
// isn't meaningful to them yet (no Driver Mobile/Route epics exist to
// make "EN_ROUTE" concretely different from "DRIVER_ASSIGNED" today).
const BOOKING_STATUS_LABEL: Record<CollectUkBookingStatus, string> = {
  REQUESTED: 'Booking received -- awaiting scheduling',
  SCHEDULED: 'Collection scheduled',
  DRIVER_ASSIGNED: 'A driver has been assigned',
  EN_ROUTE: 'Driver is on the way',
  COLLECTED: 'Collected',
  UNABLE_TO_COLLECT: 'We were unable to collect -- please contact your shipping company',
  AT_WAREHOUSE: 'Arrived at the warehouse',
  HANDED_OVER: 'Handed over to your shipping company',
  CANCELLED: 'Cancelled',
  CLOSED: 'Completed',
};

export function collectUkBuyerStatus(status: CollectUkBookingStatus): string {
  return BOOKING_STATUS_LABEL[status];
}
