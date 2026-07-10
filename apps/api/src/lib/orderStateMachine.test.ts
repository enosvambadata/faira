import { describe, it, expect } from 'vitest';
import { canTransition, displayStatus } from './orderStateMachine';

describe('canTransition', () => {
  it('allows PENDING -> PAID and PENDING -> CANCELLED', () => {
    expect(canTransition('PENDING', 'PAID')).toBe(true);
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
  });

  it('allows PAID -> SHIPPED and PAID -> CANCELLED', () => {
    expect(canTransition('PAID', 'SHIPPED')).toBe(true);
    expect(canTransition('PAID', 'CANCELLED')).toBe(true);
  });

  it('allows SHIPPED -> DELIVERED only', () => {
    expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true);
    expect(canTransition('SHIPPED', 'PAID')).toBe(false);
  });

  it('rejects transitions out of terminal states', () => {
    expect(canTransition('DELIVERED', 'SHIPPED')).toBe(false);
    expect(canTransition('CANCELLED', 'PENDING')).toBe(false);
  });

  it('rejects skipping states', () => {
    expect(canTransition('PENDING', 'SHIPPED')).toBe(false);
    expect(canTransition('PENDING', 'DELIVERED')).toBe(false);
  });
});

describe('displayStatus', () => {
  it('maps PAID to the seller-facing "awaiting delivery" label', () => {
    expect(displayStatus('PAID')).toBe('Paid - Awaiting Delivery');
  });

  it('has a label for every order status', () => {
    const statuses = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
    for (const status of statuses) {
      expect(typeof displayStatus(status)).toBe('string');
      expect(displayStatus(status).length).toBeGreaterThan(0);
    }
  });
});
