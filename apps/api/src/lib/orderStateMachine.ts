import { OrderStatus } from '@prisma/client';

// Single source of truth for what transitions an order can make (SCRUM-60).
//
// COMPLETED vs DELIVERED: this app currently treats "buyer confirms
// delivery" and "escrow releases" as the same moment (confirmOrderPayment,
// releaseEscrowFunds, mark-collected, and admin auto-release all jump
// straight to COMPLETED) — DELIVERED is defined here for when SCRUM-61/62
// (seller ships, buyer tracks) introduce a real gap between "physically
// delivered" and "funds released," but nothing sets it today.
//
// PAID -> DELIVERED/COMPLETED (skipping SHIPPED) is allowed because
// there's no "seller marks shipped" step yet (SCRUM-61). Tighten to
// require SHIPPED first once that lands.
//
// PENDING -> COMPLETED (skipping PAID/SHIPPED/DELIVERED entirely) covers
// cash on delivery (SCRUM-56): payment and delivery are the same physical
// event, so there's no escrow to release and no intermediate state to
// pass through.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'COMPLETED', 'CANCELLED'],
  PAID: ['SHIPPED', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'COMPLETED', 'DISPUTED'],
  DELIVERED: ['COMPLETED', 'DISPUTED'],
  // A dispute is raised while funds are still held (PAID/SHIPPED) and
  // resolved into exactly one of these two terminal-ish outcomes —
  // rejected (no refund) completes the sale normally, any refund amount
  // (full or partial) refunds it. See admin.ts's resolve-dispute handler.
  DISPUTED: ['COMPLETED', 'REFUNDED'],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

const DISPLAY_STATUS: Record<OrderStatus, string> = {
  PENDING: 'Pending Payment',
  PAID: 'Paid',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  DISPUTED: 'Disputed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export function displayStatus(status: OrderStatus): string {
  return DISPLAY_STATUS[status];
}
