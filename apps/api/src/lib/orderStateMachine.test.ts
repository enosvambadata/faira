import { describe, it, expect } from 'vitest';
import { canTransition, displayStatus } from './orderStateMachine';

describe('canTransition', () => {
  it('allows PENDING -> PAID and PENDING -> CANCELLED', () => {
    expect(canTransition('PENDING', 'PAID')).toBe(true);
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
  });

  it('allows PENDING -> COMPLETED directly (cash on delivery)', () => {
    expect(canTransition('PENDING', 'COMPLETED')).toBe(true);
  });

  it('rejects PENDING -> DELIVERED (only COD-collected goes straight to COMPLETED)', () => {
    expect(canTransition('PENDING', 'DELIVERED')).toBe(false);
  });

  it('allows PAID -> SHIPPED, PAID -> COMPLETED, PAID -> DISPUTED, and PAID -> CANCELLED', () => {
    expect(canTransition('PAID', 'SHIPPED')).toBe(true);
    expect(canTransition('PAID', 'COMPLETED')).toBe(true);
    expect(canTransition('PAID', 'DISPUTED')).toBe(true);
    expect(canTransition('PAID', 'CANCELLED')).toBe(true);
  });

  it('allows SHIPPED -> DELIVERED, SHIPPED -> COMPLETED, and SHIPPED -> DISPUTED', () => {
    expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true);
    expect(canTransition('SHIPPED', 'COMPLETED')).toBe(true);
    expect(canTransition('SHIPPED', 'DISPUTED')).toBe(true);
    expect(canTransition('SHIPPED', 'PAID')).toBe(false);
  });

  it('allows DISPUTED -> COMPLETED (rejected) and DISPUTED -> REFUNDED (any refund)', () => {
    expect(canTransition('DISPUTED', 'COMPLETED')).toBe(true);
    expect(canTransition('DISPUTED', 'REFUNDED')).toBe(true);
  });

  it('rejects transitions out of terminal states', () => {
    expect(canTransition('COMPLETED', 'DISPUTED')).toBe(false);
    expect(canTransition('CANCELLED', 'PENDING')).toBe(false);
    expect(canTransition('REFUNDED', 'COMPLETED')).toBe(false);
  });

  it('rejects PENDING -> SHIPPED', () => {
    expect(canTransition('PENDING', 'SHIPPED')).toBe(false);
  });
});

describe('displayStatus', () => {
  it('maps every state to the label named in the ticket', () => {
    expect(displayStatus('PENDING')).toBe('Pending Payment');
    expect(displayStatus('PAID')).toBe('Paid');
    expect(displayStatus('SHIPPED')).toBe('Shipped');
    expect(displayStatus('DELIVERED')).toBe('Delivered');
    expect(displayStatus('COMPLETED')).toBe('Completed');
    expect(displayStatus('DISPUTED')).toBe('Disputed');
    expect(displayStatus('CANCELLED')).toBe('Cancelled');
    expect(displayStatus('REFUNDED')).toBe('Refunded');
  });

  it('has a non-empty label for every order status', () => {
    const statuses = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'CANCELLED', 'REFUNDED'] as const;
    for (const status of statuses) {
      expect(typeof displayStatus(status)).toBe('string');
      expect(displayStatus(status).length).toBeGreaterThan(0);
    }
  });
});
