import { OrderStatus, ShippingMethod } from '@prisma/client';

// Anti-leakage Layer 2 (SCRUM-259): a single, tested place decides which order
// delivery fields each viewer may see — never the frontend. Fields a viewer may
// not see are omitted from the payload server-side, not hidden on the client.
//
// Guiding principle: the seller gets the minimum to hand the parcel to the
// transport leg, not enough to contact the buyer directly. The one case that
// genuinely needs the raw phone (COURIER — the seller books the courier) is the
// single, explicit, auditable place it's revealed.

export type ViewerRole = 'buyer' | 'seller' | 'admin';

// Decision table: for each delivery method, which of the buyer's details the
// SELLER may see once the order is paid. Data, not scattered ifs — so the reveal
// policy is auditable in one place.
const SELLER_DELIVERY_VISIBILITY: Record<ShippingMethod, { addressLine: boolean; phone: boolean }> = {
  // In-person handover: coordinate via in-app chat + the Faira reference; the
  // seller never needs the raw number or a street address.
  MEETUP: { addressLine: false, phone: false },
  // Seller books a courier, so must pass the buyer's address + phone to it —
  // the one auditable place a raw number is disclosed.
  COURIER: { addressLine: true, phone: true },
  // Seller posts to the address; a phone isn't needed to drop a parcel.
  POSTAL: { addressLine: true, phone: false },
};

// recipientName + suburb + city are the "destination" — always shown once any
// delivery block is disclosed (the seller needs to know where it's going).

export interface OrderForView {
  id: string;
  buyerId: string;
  status: OrderStatus;
  deliveryMethod: ShippingMethod | null;
  deliveryRecipientName: string | null;
  deliveryPhone: string | null;
  deliveryAddressLine: string | null;
  deliverySuburb: string | null;
  deliveryCity: string | null;
  collectionCode: string | null;
  listing: { sellerId: string };
}

export interface DeliveryView {
  method: ShippingMethod | null;
  recipientName: string | null;
  suburb: string | null;
  city: string | null;
  addressLine: string | null;
  phone: string | null;
  reference: string;
  // The buyer's handover code — revealed ONLY to the buyer (never the seller,
  // who redeems it by entering what the buyer shows them in person).
  collectionCode: string | null;
}

// A short, human-friendly reference both parties can quote without exchanging
// personal details. Derived from the opaque order id — no new column needed.
export function fairaReference(orderId: string): string {
  return `FA-${orderId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function orderViewerRole(order: OrderForView, viewerId: string): ViewerRole | null {
  if (order.buyerId === viewerId) return 'buyer';
  if (order.listing.sellerId === viewerId) return 'seller';
  return null;
}

// Seller sees nothing about the buyer before escrow is funded.
const PRE_PAYMENT_STATUSES: OrderStatus[] = ['PENDING'];

/**
 * The delivery block a given viewer is allowed to see, or null when nothing is
 * disclosed (seller pre-payment). Buyer/admin see everything the buyer entered;
 * the seller sees the destination once paid, plus address/phone only where the
 * delivery method requires it.
 */
export function deliveryViewFor(order: OrderForView, role: ViewerRole): DeliveryView | null {
  const reference = fairaReference(order.id);

  if (role === 'buyer' || role === 'admin') {
    return {
      method: order.deliveryMethod,
      recipientName: order.deliveryRecipientName,
      suburb: order.deliverySuburb,
      city: order.deliveryCity,
      addressLine: order.deliveryAddressLine,
      phone: order.deliveryPhone,
      reference,
      collectionCode: order.collectionCode,
    };
  }

  // Seller.
  if (PRE_PAYMENT_STATUSES.includes(order.status)) return null;

  const visibility = order.deliveryMethod
    ? SELLER_DELIVERY_VISIBILITY[order.deliveryMethod]
    : { addressLine: false, phone: false };

  return {
    method: order.deliveryMethod,
    recipientName: order.deliveryRecipientName,
    suburb: order.deliverySuburb,
    city: order.deliveryCity,
    addressLine: visibility.addressLine ? order.deliveryAddressLine : null,
    phone: visibility.phone ? order.deliveryPhone : null,
    reference,
    // Never disclosed to the seller — they redeem it, they don't hold it.
    collectionCode: null,
  };
}
