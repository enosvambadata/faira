import { ShipmentStatus } from '@prisma/client';

// Single source of truth for shipment status transitions, per
// docs/fulfilment/03-shipment-state-machine.md (SCRUM-108). Mirrors
// orderStateMachine.ts's shape exactly: a canTransition(from, to) lookup
// plus a displayStatus map, enforced via atomic
// updateMany({ where: { id, status: currentStatus } }) writes at each
// call site (never trusted from a status column read-then-write alone).
const ALLOWED_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  DRAFT: ['AWAITING_PAYMENT', 'AWAITING_DROPOFF', 'CANCELLED'],
  AWAITING_PAYMENT: ['AWAITING_DROPOFF', 'CANCELLED'],
  AWAITING_DROPOFF: ['RECEIVED_AT_ORIGIN', 'DROPOFF_OVERDUE', 'CANCELLED'],
  DROPOFF_OVERDUE: ['RECEIVED_AT_ORIGIN', 'CANCELLED'],
  RECEIVED_AT_ORIGIN: ['INSPECTED', 'REJECTED_AT_ORIGIN'],
  // Terminal; seller re-creates a new shipment rather than reusing this one.
  REJECTED_AT_ORIGIN: ['CLOSED'],
  INSPECTED: ['SEALED', 'DAMAGED'],
  SEALED: ['AWAITING_DISPATCH'],
  AWAITING_DISPATCH: ['ASSIGNED_TO_RUN'],
  // A manifest can be pulled before the departure scan.
  ASSIGNED_TO_RUN: ['DISPATCHED', 'AWAITING_DISPATCH'],
  DISPATCHED: ['IN_TRANSIT'],
  IN_TRANSIT: ['RECEIVED_AT_DESTINATION', 'DELAYED', 'LOST', 'DAMAGED'],
  DELAYED: ['IN_TRANSIT', 'RECEIVED_AT_DESTINATION', 'LOST'],
  RECEIVED_AT_DESTINATION: ['READY_FOR_COLLECTION'],
  READY_FOR_COLLECTION: ['COLLECTED', 'COLLECTION_OVERDUE', 'DISPUTED'],
  COLLECTION_OVERDUE: ['COLLECTED', 'RETURN_REQUESTED'],
  // A rejected return request just closes.
  RETURN_REQUESTED: ['RETURN_APPROVED', 'CLOSED'],
  RETURN_APPROVED: ['RETURNING_TO_SELLER'],
  RETURNING_TO_SELLER: ['RETURNED_TO_SELLER', 'LOST'],
  RETURNED_TO_SELLER: ['CLOSED'],
  COLLECTED: ['CLOSED', 'DISPUTED'],
  // A dispute resolves into either a normal close or a return.
  DISPUTED: ['CLOSED', 'RETURN_REQUESTED'],
  CANCELLED: [],
  // Closed once the claim/refund resolves.
  LOST: ['DISPUTED', 'CLOSED'],
  DAMAGED: ['DISPUTED', 'RETURN_REQUESTED', 'CLOSED'],
  CLOSED: [],
};

export function canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

const DISPLAY_STATUS: Record<ShipmentStatus, string> = {
  DRAFT: 'Draft',
  AWAITING_PAYMENT: 'Awaiting Payment',
  AWAITING_DROPOFF: 'Awaiting Drop-off',
  DROPOFF_OVERDUE: 'Drop-off Overdue',
  RECEIVED_AT_ORIGIN: 'Received at Origin Hub',
  REJECTED_AT_ORIGIN: 'Rejected at Origin Hub',
  INSPECTED: 'Inspected',
  SEALED: 'Sealed',
  AWAITING_DISPATCH: 'Awaiting Dispatch',
  ASSIGNED_TO_RUN: 'Assigned to Run',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In Transit',
  DELAYED: 'Delayed',
  RECEIVED_AT_DESTINATION: 'Received at Destination Hub',
  READY_FOR_COLLECTION: 'Ready for Collection',
  COLLECTION_OVERDUE: 'Collection Overdue',
  COLLECTED: 'Collected',
  RETURN_REQUESTED: 'Return Requested',
  RETURN_APPROVED: 'Return Approved',
  RETURNING_TO_SELLER: 'Returning to Seller',
  RETURNED_TO_SELLER: 'Returned to Seller',
  CANCELLED: 'Cancelled',
  LOST: 'Lost',
  DAMAGED: 'Damaged',
  DISPUTED: 'Disputed',
  CLOSED: 'Closed',
};

export function displayStatus(status: ShipmentStatus): string {
  return DISPLAY_STATUS[status];
}
