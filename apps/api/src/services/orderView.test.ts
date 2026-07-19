import { describe, it, expect } from 'vitest';
import { deliveryViewFor, orderViewerRole, fairaReference, OrderForView } from './orderView';

const BUYER = 'buyer-1';
const SELLER = 'seller-1';

function order(overrides: Partial<OrderForView> = {}): OrderForView {
  return {
    id: '11112222-3333-4444-5555-666677778888',
    buyerId: BUYER,
    status: 'PAID',
    deliveryMethod: 'COURIER',
    deliveryRecipientName: 'Tariro M.',
    deliveryPhone: '0771234567',
    deliveryAddressLine: '12 Samora Machel Ave',
    deliverySuburb: 'Avondale',
    deliveryCity: 'Harare',
    collectionCode: '482913',
    listing: { sellerId: SELLER },
    ...overrides,
  };
}

describe('orderViewerRole', () => {
  it('identifies buyer, seller, and outsiders', () => {
    expect(orderViewerRole(order(), BUYER)).toBe('buyer');
    expect(orderViewerRole(order(), SELLER)).toBe('seller');
    expect(orderViewerRole(order(), 'someone-else')).toBeNull();
  });
});

describe('fairaReference', () => {
  it('is a short, stable, quotable code with no personal data', () => {
    expect(fairaReference('11112222-3333-4444-5555-666677778888')).toBe('FA-11112222');
  });
});

describe('deliveryViewFor — buyer & admin', () => {
  it('shows the buyer everything they entered', () => {
    const view = deliveryViewFor(order(), 'buyer');
    expect(view).toMatchObject({
      recipientName: 'Tariro M.',
      phone: '0771234567',
      addressLine: '12 Samora Machel Ave',
      suburb: 'Avondale',
      city: 'Harare',
      reference: 'FA-11112222',
    });
  });

  it('shows admins everything (dispute review)', () => {
    expect(deliveryViewFor(order({ deliveryMethod: 'MEETUP' }), 'admin')?.phone).toBe('0771234567');
  });

  it('reveals the collection code to the buyer', () => {
    expect(deliveryViewFor(order(), 'buyer')?.collectionCode).toBe('482913');
  });
});

describe('deliveryViewFor — seller gating by status', () => {
  it('discloses NOTHING to the seller before payment', () => {
    expect(deliveryViewFor(order({ status: 'PENDING' }), 'seller')).toBeNull();
  });

  it('discloses the destination once paid', () => {
    const view = deliveryViewFor(order({ status: 'PAID' }), 'seller');
    expect(view).not.toBeNull();
    expect(view?.recipientName).toBe('Tariro M.');
    expect(view?.city).toBe('Harare');
  });

  it('never reveals the collection code to the seller (they redeem it)', () => {
    expect(deliveryViewFor(order({ status: 'PAID' }), 'seller')?.collectionCode).toBeNull();
  });
});

describe('deliveryViewFor — seller gating by method (decision table)', () => {
  it('MEETUP: destination only — no address, no phone', () => {
    const view = deliveryViewFor(order({ deliveryMethod: 'MEETUP' }), 'seller');
    expect(view).toMatchObject({ suburb: 'Avondale', city: 'Harare', addressLine: null, phone: null });
  });

  it('COURIER: address + phone (the one auditable raw-phone reveal)', () => {
    const view = deliveryViewFor(order({ deliveryMethod: 'COURIER' }), 'seller');
    expect(view).toMatchObject({ addressLine: '12 Samora Machel Ave', phone: '0771234567' });
  });

  it('POSTAL: address but NOT phone', () => {
    const view = deliveryViewFor(order({ deliveryMethod: 'POSTAL' }), 'seller');
    expect(view).toMatchObject({ addressLine: '12 Samora Machel Ave', phone: null });
  });

  it('never leaks the buyer phone to the seller for MEETUP even post-delivery', () => {
    for (const status of ['SHIPPED', 'DELIVERED', 'COMPLETED'] as const) {
      expect(deliveryViewFor(order({ deliveryMethod: 'MEETUP', status }), 'seller')?.phone).toBeNull();
    }
  });
});
