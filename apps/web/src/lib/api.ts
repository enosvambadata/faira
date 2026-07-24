import { request, requestRaw, ApiError, API_URL, createClient } from "@faira/ui";
import { buildMarketQuery, type MarketBrowseParams } from "./marketQuery";

// A few marketplace methods talk to Supabase directly (e.g. resumable/multipart
// storage uploads) rather than through request(), so keep a browser client here.
const supabase = createClient();

// The HTTP core (request/requestRaw/ApiError/auth) and the Supabase browser
// client now live in @faira/ui, shared across the Faira web apps. This file
// keeps the marketplace-specific types + API methods (some of which use
// ApiError/API_URL directly for multipart uploads), and re-exports the pieces
// that existing `@/lib/api` consumers still import from here.
export { ApiError };
export { auth } from "@faira/ui";

export interface MarketCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
}

export interface MarketVehicleMake {
  id: string;
  name: string;
}

export interface MarketVehicleModel {
  id: string;
  name: string;
}

export interface MarketListingSummary {
  id: string;
  title: string;
  price: string;
  condition: string;
  city: string;
  imageUrls: string[];
  createdAt: string;
  universalFit: boolean;
  seller: { name: string | null; rating: number | null; ratingCount: number; verified: boolean };
  // Present only when browsing with a garage vehicle (fitFor): does this part
  // fit it? Undefined means "no vehicle selected", so show no fit pill.
  fits?: boolean;
}

export interface MarketBrowseResult {
  data: MarketListingSummary[];
  hasMore: boolean;
  total: number;
}

export interface MarketListingSeller {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  city: string | null;
  isVerified: boolean;
}

export interface MarketListingDetail {
  id: string;
  title: string;
  description: string | null;
  price: string;
  condition: string;
  city: string;
  imageUrls: string[];
  deliveryOptions: string[];
  status: string;
  attributes: Record<string, string>;
  category: { id: string; name: string; slug: string } | null;
  seller: MarketListingSeller;
  createdAt: string;
}

export interface MarketUploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  transformation: string;
}

export interface MarketFitmentInput {
  modelId: string;
  yearFrom?: number;
  yearTo?: number;
  note?: string;
}

export interface MarketCreateListingPayload {
  title: string;
  description?: string;
  price: number;
  condition: string;
  city: string;
  categoryId: string;
  imageUrls: string[];
  deliveryOptions: string[];
  weightTier: string;
  universalFit?: boolean;
  fitments?: MarketFitmentInput[];
  legalSourcingDeclared: true;
}

// Uploads a listing photo straight to Cloudinary with the signed params from
// market.uploadSignature — bytes never pass through apps/api. The signature
// only covers folder+transformation, so the resize can't be bypassed.
// Returns the secure_url (this folder uses public delivery).
export async function uploadListingImage(sig: MarketUploadSignature, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);
  form.append("transformation", sig.transformation);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError("UPLOAD_FAILED", json?.error?.message ?? "Image upload failed", res.status);
  return json.secure_url as string;
}

export const market = {
  categories: (parentId?: string) =>
    request<MarketCategory[]>(`/api/v1/categories${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""}`),

  makes: () => request<MarketVehicleMake[]>("/api/v1/vehicles/makes"),

  models: (makeId: string) =>
    request<MarketVehicleModel[]>(`/api/v1/vehicles/makes/${encodeURIComponent(makeId)}/models`),

  browse: (params: MarketBrowseParams) =>
    requestRaw<MarketBrowseResult>(`/api/v1/listings${buildMarketQuery(params)}`),

  get: (id: string) => request<MarketListingDetail>(`/api/v1/listings/${encodeURIComponent(id)}`),

  filterOptions: () => request<{ cities: string[]; sizes: string[] }>("/api/v1/listings/filter-options"),

  uploadSignature: () => request<MarketUploadSignature>("/api/v1/listings/upload-signature", { method: "POST", auth: true }),

  create: (payload: MarketCreateListingPayload) =>
    request<{ id: string }>("/api/v1/listings", { method: "POST", body: payload, auth: true }),
};

// ---- Faira Market: garage (saved vehicles) + watchlist — all auth-gated ----

export interface MarketGarageVehicle {
  id: string;
  modelId: string;
  year: number | null;
  make: string;
  model: string;
}

export const marketGarage = {
  list: () => request<MarketGarageVehicle[]>("/api/v1/garage", { auth: true }),

  add: (modelId: string, year?: number) =>
    request<MarketGarageVehicle>("/api/v1/garage", { method: "POST", body: { modelId, year }, auth: true }),

  remove: (id: string) =>
    request<void>(`/api/v1/garage/${encodeURIComponent(id)}`, { method: "DELETE", auth: true }),
};

export interface MarketWatchlistItem {
  id: string;
  title: string;
  price: string;
  condition: string;
  city: string;
  imageUrls: string[];
  status: string;
  universalFit: boolean;
  seller: { name: string | null; rating: number | null; ratingCount: number; verified: boolean };
  savedAt: string;
}

export const marketWatchlist = {
  ids: () => request<string[]>("/api/v1/wishlist/ids", { auth: true }),

  list: () => request<MarketWatchlistItem[]>("/api/v1/wishlist", { auth: true }),

  add: (listingId: string) =>
    request<{ listingId: string; saved: boolean }>(`/api/v1/wishlist/${encodeURIComponent(listingId)}`, {
      method: "POST",
      auth: true,
    }),

  remove: (listingId: string) =>
    request<void>(`/api/v1/wishlist/${encodeURIComponent(listingId)}`, { method: "DELETE", auth: true }),
};

// ---- Faira Market: buyer <-> seller messaging (auth-gated) ----

interface MarketConversationBase {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  createdAt: string;
  updatedAt: string;
  listing: { id: string; title: string; price: string; imageUrl: string | null };
  otherParticipant: { id: string; displayName: string | null; avatarUrl: string | null };
  isMuted: boolean;
}

export type MarketConversation = MarketConversationBase;

export interface MarketConversationListItem extends MarketConversationBase {
  lastMessage: { body: string | null; imageUrl: string | null; senderId: string; createdAt: string } | null;
  unreadCount: number;
}

export interface MarketMessage {
  id: string;
  senderId: string;
  body: string | null;
  imageUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export const marketMessages = {
  list: () => request<MarketConversationListItem[]>("/api/v1/conversations", { auth: true }),

  start: (listingId: string) =>
    request<MarketConversation>("/api/v1/conversations", { method: "POST", body: { listingId }, auth: true }),

  get: (id: string) => request<MarketConversation>(`/api/v1/conversations/${encodeURIComponent(id)}`, { auth: true }),

  messages: (id: string) =>
    request<MarketMessage[]>(`/api/v1/conversations/${encodeURIComponent(id)}/messages`, { auth: true }),

  send: (id: string, body: string) =>
    request<MarketMessage>(`/api/v1/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", body: { body }, auth: true }),

  unreadCount: () => request<{ count: number }>("/api/v1/conversations/unread-count", { auth: true }),
};

// ---- Faira Market: checkout / orders (auth-gated) ----

export type MarketPaymentMethod = "ECOCASH" | "ONEMONEY" | "ZIMSWITCH" | "CASH_ON_DELIVERY";

export interface MarketOrder {
  id: string;
  listingId: string;
  priceAtPurchase: string;
  deliveryOption: string;
  status: string;
}

export interface MarketPayResult {
  paymentId: string;
  redirectUrl: string | null;
  instructions: string | null;
}

export interface MarketPaymentStatus {
  orderStatus: string;
  paymentStatus: string | null;
}

export type MarketDeliveryMethod = "MEETUP" | "COURIER" | "POSTAL";

// Delivery details captured at checkout (SCRUM-259). The buyer provides contact
// here — an access-controlled field the API gates per viewer/status/method — so
// it never has to be shared through the (redacted) chat.
export interface MarketDeliveryDetails {
  method: MarketDeliveryMethod;
  recipientName: string;
  phone: string;
  addressLine?: string;
  suburb?: string;
  city: string;
}

export const marketOrders = {
  create: (listingId: string, deliveryOption: string, delivery: MarketDeliveryDetails) =>
    request<MarketOrder>("/api/v1/orders", { method: "POST", body: { listingId, deliveryOption, delivery }, auth: true }),

  deliveryFee: (listingId: string, deliveryOption: string) =>
    request<{ fee: number }>(
      `/api/v1/orders/delivery-fee?listingId=${encodeURIComponent(listingId)}&deliveryOption=${encodeURIComponent(deliveryOption)}`,
      { auth: true },
    ),

  pay: (orderId: string, payload: { method: MarketPaymentMethod; email?: string; phone?: string }) =>
    request<MarketPayResult>(`/api/v1/orders/${encodeURIComponent(orderId)}/pay`, { method: "POST", body: payload, auth: true }),

  paymentStatus: (orderId: string) =>
    request<MarketPaymentStatus>(`/api/v1/orders/${encodeURIComponent(orderId)}/payment-status`, { auth: true }),
};

// ---- Faira Market: seller account (auth-gated) ----

export interface MarketProfile {
  id: string;
  displayName: string | null;
  city: string | null;
  avatarUrl: string | null;
  pushNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
}

export interface MarketMyListing {
  id: string;
  title: string;
  price: string;
  city: string;
  imageUrls: string[];
  status: string;
}

export interface MarketSale {
  id: string;
  priceAtPurchase: string;
  status: string;
  displayStatus: string;
  createdAt: string;
  listing: { id: string; title: string; imageUrl: string | null };
}

export interface MarketSellerBalance {
  availableBalance: number;
  minimumPayoutAmount: number;
}

export interface MarketVerification {
  id: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export const marketAccount = {
  profile: () => request<MarketProfile>("/api/v1/profile", { auth: true }),

  updateProfile: (payload: { displayName?: string; city?: string }) =>
    request<MarketProfile>("/api/v1/profile", { method: "PATCH", body: payload, auth: true }),

  myListings: () => request<MarketMyListing[]>("/api/v1/listings/mine", { auth: true }),

  editListing: (id: string, payload: { price?: number; description?: string }) =>
    request<{ id: string }>(`/api/v1/listings/${encodeURIComponent(id)}`, { method: "PATCH", body: payload, auth: true }),

  markSold: (id: string) =>
    request<{ id: string; status: string }>(`/api/v1/listings/${encodeURIComponent(id)}/sold`, { method: "PATCH", auth: true }),

  sales: () => request<MarketSale[]>("/api/v1/orders/sales", { auth: true }),

  balance: () => request<MarketSellerBalance>("/api/v1/sellers/me/balance", { auth: true }),

  requestPayout: (amount: number, payoutMethodDetails: string) =>
    request<{ id: string; amount: string; status: string }>("/api/v1/sellers/me/payout-requests", {
      method: "POST",
      body: { amount, payoutMethodDetails },
      auth: true,
    }),

  verification: () => request<MarketVerification | null>("/api/v1/verification/mine", { auth: true }),

  verificationUploadSignature: () =>
    request<MarketUploadSignature>("/api/v1/verification/upload-signature", { method: "POST", auth: true }),

  submitVerification: (idDocumentUrl: string, selfieUrl: string) =>
    request<MarketVerification>("/api/v1/verification", { method: "POST", body: { idDocumentUrl, selfieUrl }, auth: true }),
};

// ---- Faira Market: buyer orders / tracking (auth-gated) ----

export interface MarketOrderListItem {
  id: string;
  priceAtPurchase: string;
  status: string;
  displayStatus: string;
  createdAt: string;
  listing: { id: string; title: string; imageUrl: string | null };
}

// The delivery block the API discloses to this viewer (SCRUM-259). Gated
// server-side: null for a seller pre-payment; address/phone omitted unless the
// method requires them. `reference` is the shared Faira code for coordination.
export interface MarketOrderDelivery {
  method: MarketDeliveryMethod | null;
  recipientName: string | null;
  suburb: string | null;
  city: string | null;
  addressLine: string | null;
  phone: string | null;
  reference: string;
  // The buyer's handover code — present only in the buyer's own view.
  collectionCode: string | null;
}

export interface MarketOrderDetail {
  id: string;
  buyerId: string;
  sellerId: string;
  viewerRole: "buyer" | "seller" | "admin";
  priceAtPurchase: string;
  deliveryOption: string;
  delivery: MarketOrderDelivery | null;
  status: string;
  displayStatus: string;
  shippingMethod: string | null;
  trackingReference: string | null;
  shippedAt: string | null;
  paymentMethod: string | null;
  canMarkCollected: boolean;
  listing: { id: string; title: string; imageUrl: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface MarketOrderReview {
  rating: number;
  comment: string | null;
}

export const marketBuyerOrders = {
  purchases: () => request<MarketOrderListItem[]>("/api/v1/orders/purchases", { auth: true }),

  get: (id: string) => request<MarketOrderDetail>(`/api/v1/orders/${encodeURIComponent(id)}`, { auth: true }),

  confirmDelivery: (id: string) =>
    request<{ id: string; status: string; displayStatus: string }>(`/api/v1/orders/${encodeURIComponent(id)}/confirm-delivery`, {
      method: "POST",
      auth: true,
    }),

  markCollected: (id: string) =>
    request<{ id: string; status: string; displayStatus: string }>(`/api/v1/orders/${encodeURIComponent(id)}/mark-collected`, {
      method: "POST",
      auth: true,
    }),

  // Seller redeems the buyer's handover code (MEETUP) to release escrow.
  confirmHandover: (id: string, code: string) =>
    request<{ id: string; status: string; displayStatus: string }>(`/api/v1/orders/${encodeURIComponent(id)}/confirm-handover`, {
      method: "POST",
      body: { code },
      auth: true,
    }),

  review: (id: string) => request<MarketOrderReview | null>(`/api/v1/orders/${encodeURIComponent(id)}/reviews`, { auth: true }),

  submitReview: (id: string, rating: number, comment?: string) =>
    request<MarketOrderReview>(`/api/v1/orders/${encodeURIComponent(id)}/reviews`, {
      method: "POST",
      body: { rating, comment },
      auth: true,
    }),
};

export { ApiError as FulfilmentApiError };
