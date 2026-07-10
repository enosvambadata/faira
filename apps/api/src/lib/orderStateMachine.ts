import { OrderStatus } from '@prisma/client';

// Single source of truth for what transitions an order can make. Only
// PENDING -> PAID is wired up to an actual transition today (payment
// confirmation); SHIPPED/DELIVERED/CANCELLED are declared here too so
// SCRUM-60/61/62 (state machine definition, shipping, delivery
// confirmation) extend one table instead of re-deriving the rules.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // PAID -> DELIVERED (skipping SHIPPED) is allowed for now because there's
  // no "seller marks shipped" step yet (SCRUM-61) — buyer delivery
  // confirmation (SCRUM-55) has to be able to release escrow on a PAID
  // order today. Tighten this to require SHIPPED first once SCRUM-61 lands.
  //
  // PENDING -> DELIVERED (skipping PAID/SHIPPED entirely) covers cash on
  // delivery (SCRUM-56): payment and delivery are the same physical event,
  // so there's no separate "paid" moment to pass through, and no escrow
  // involved to release.
  PENDING: ['PAID', 'DELIVERED', 'CANCELLED'],
  PAID: ['SHIPPED', 'DELIVERED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

const DISPLAY_STATUS: Record<OrderStatus, string> = {
  PENDING: 'Awaiting Payment',
  PAID: 'Paid - Awaiting Delivery',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export function displayStatus(status: OrderStatus): string {
  return DISPLAY_STATUS[status];
}
