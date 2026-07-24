import { ShipmentStatus } from '@prisma/client';

// Buyer-facing wording, deliberately separate from shipmentStateMachine's
// displayStatus() -- that one is written for hub-ops staff (e.g. "Awaiting
// Dispatch", "Assigned to Run") and would confuse a buyer with no context
// on the internal pipeline. Several internal statuses collapse to the same
// buyer-facing message since the distinction isn't meaningful to them.
const BUYER_STATUS: Record<ShipmentStatus, string> = {
  DRAFT: 'Being prepared by the seller',
  AWAITING_PAYMENT: 'Awaiting payment',
  AWAITING_DROPOFF: 'Waiting for the seller to drop off the parcel',
  DROPOFF_OVERDUE: 'Waiting for the seller to drop off the parcel',
  RECEIVED_AT_ORIGIN: 'Received at the origin hub',
  REJECTED_AT_ORIGIN: 'Drop-off was not accepted — please contact the seller',
  INSPECTED: 'Being prepared for transport',
  SEALED: 'Ready for transport',
  AWAITING_DISPATCH: 'Awaiting transport',
  ASSIGNED_TO_RUN: 'Awaiting transport',
  DISPATCHED: 'On its way',
  IN_TRANSIT: 'On its way',
  DELAYED: 'On its way (delayed)',
  RECEIVED_AT_DESTINATION: 'Arrived at the destination hub',
  READY_FOR_COLLECTION: 'Ready for collection',
  COLLECTION_OVERDUE: 'Ready for collection',
  COLLECTED: 'Collected',
  RETURN_REQUESTED: 'Being returned to the seller',
  RETURN_APPROVED: 'Being returned to the seller',
  RETURNING_TO_SELLER: 'Being returned to the seller',
  RETURNED_TO_SELLER: 'Returned to the seller',
  CANCELLED: 'Cancelled',
  LOST: 'We are investigating an issue with this parcel — please contact the seller',
  DAMAGED: 'We are investigating an issue with this parcel — please contact the seller',
  DISPUTED: 'Under review',
  CLOSED: 'Completed',
};

export function buyerDisplayStatus(status: ShipmentStatus): string {
  return BUYER_STATUS[status];
}
