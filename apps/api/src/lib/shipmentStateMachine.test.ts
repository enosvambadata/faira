import { describe, it, expect } from 'vitest';
import { ShipmentStatus } from '@prisma/client';
import { canTransition, displayStatus } from './shipmentStateMachine';

// Mirrors docs/fulfilment/03-shipment-state-machine.md's allowed-transition
// table exactly — kept as a literal, independent copy (not imported from
// the module under test) so this test actually catches a drift between
// the spec and the implementation.
const ALLOWED: Record<ShipmentStatus, ShipmentStatus[]> = {
  DRAFT: ['AWAITING_PAYMENT', 'AWAITING_DROPOFF', 'CANCELLED'],
  AWAITING_PAYMENT: ['AWAITING_DROPOFF', 'CANCELLED'],
  AWAITING_DROPOFF: ['RECEIVED_AT_ORIGIN', 'DROPOFF_OVERDUE', 'REJECTED_AT_ORIGIN', 'CANCELLED'],
  DROPOFF_OVERDUE: ['RECEIVED_AT_ORIGIN', 'REJECTED_AT_ORIGIN', 'CANCELLED'],
  RECEIVED_AT_ORIGIN: ['INSPECTED', 'REJECTED_AT_ORIGIN'],
  REJECTED_AT_ORIGIN: ['CLOSED'],
  INSPECTED: ['SEALED', 'DAMAGED'],
  SEALED: ['AWAITING_DISPATCH'],
  AWAITING_DISPATCH: ['ASSIGNED_TO_RUN'],
  ASSIGNED_TO_RUN: ['DISPATCHED', 'AWAITING_DISPATCH'],
  DISPATCHED: ['IN_TRANSIT'],
  IN_TRANSIT: ['RECEIVED_AT_DESTINATION', 'DELAYED', 'LOST', 'DAMAGED'],
  DELAYED: ['IN_TRANSIT', 'RECEIVED_AT_DESTINATION', 'LOST'],
  RECEIVED_AT_DESTINATION: ['READY_FOR_COLLECTION'],
  READY_FOR_COLLECTION: ['COLLECTED', 'COLLECTION_OVERDUE', 'DISPUTED'],
  COLLECTION_OVERDUE: ['COLLECTED', 'RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURN_APPROVED', 'CLOSED'],
  RETURN_APPROVED: ['RETURNING_TO_SELLER'],
  RETURNING_TO_SELLER: ['RETURNED_TO_SELLER', 'LOST'],
  RETURNED_TO_SELLER: ['CLOSED'],
  COLLECTED: ['CLOSED', 'DISPUTED'],
  DISPUTED: ['CLOSED', 'RETURN_REQUESTED'],
  CANCELLED: [],
  LOST: ['DISPUTED', 'CLOSED'],
  DAMAGED: ['DISPUTED', 'RETURN_REQUESTED', 'CLOSED'],
  CLOSED: [],
};

const ALL_STATUSES = Object.keys(ALLOWED) as ShipmentStatus[];

describe('canTransition', () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const expected = ALLOWED[from].includes(to);
      it(`${expected ? 'allows' : 'rejects'} ${from} -> ${to}`, () => {
        expect(canTransition(from, to)).toBe(expected);
      });
    }
  }
});

describe('displayStatus', () => {
  it('returns a human-readable label for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(displayStatus(status)).toEqual(expect.any(String));
      expect(displayStatus(status).length).toBeGreaterThan(0);
    }
  });
});
