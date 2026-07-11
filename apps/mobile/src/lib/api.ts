import { getSession, saveSession, clearSession } from './session';
import { clearListingDraft } from './listingDraft';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  formData?: FormData;
  raw?: boolean;
}

// Supabase refresh tokens rotate (single-use) — if two requests 401 at the
// same time and both call refresh independently, the second one fails
// because the first already consumed the token. Sharing one in-flight
// promise across concurrent callers avoids that race.
let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const session = await getSession();
    if (!session) {
      throw new ApiError('UNAUTHENTICATED', 'No session to refresh', 401);
    }

    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      await clearSession();
      const err = json?.error ?? {};
      throw new ApiError(err.code ?? 'UNAUTHENTICATED', err.message ?? 'Session expired', res.status);
    }

    await saveSession(json.data);
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.auth) {
    const session = await getSession();
    if (session) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }
  }

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    // A 401 on an authenticated request almost always means the access
    // token expired (Supabase tokens are short-lived) rather than a real
    // auth failure — refresh once and retry transparently instead of
    // surfacing an "invalid token" error the app can silently recover
    // from. isRetry stops this from looping if the retry 401s again (that
    // means re-login is genuinely needed).
    if (res.status === 401 && options.auth && !isRetry) {
      try {
        await refreshAccessToken();
        return await request<T>(path, options, true);
      } catch {
        // Refresh itself failed — fall through and surface the original 401.
      }
    }

    const err = json?.error ?? {};
    throw new ApiError(err.code ?? 'UNKNOWN_ERROR', err.message ?? 'Something went wrong', res.status);
  }

  return (options.raw ? json : json.data) as T;
}

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface Profile {
  id: string;
  displayName: string | null;
  city: string | null;
  avatarUrl: string | null;
  pushNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
}

export const auth = {
  signup: (payload: { email?: string; phone?: string; password?: string }) =>
    request<AuthUser & { otpSent?: boolean }>('/api/v1/auth/signup', { method: 'POST', body: payload }),

  login: (payload: { email: string; password: string }) =>
    request<AuthSession>('/api/v1/auth/login', { method: 'POST', body: payload }),

  otpResend: (payload: { phone: string }) =>
    request<{ message: string }>('/api/v1/auth/otp/resend', { method: 'POST', body: payload }),

  async otpVerify(payload: { phone: string; token: string }) {
    const result = await request<AuthSession & { phoneConfirmed: boolean }>('/api/v1/auth/otp/verify', {
      method: 'POST',
      body: payload,
    });
    await saveSession(result);
    return result;
  },

  async loginAndSave(payload: { email: string; password: string }) {
    const result = await this.login(payload);
    await saveSession(result);
    return result;
  },

  async logout() {
    // Clears the session plus any account-specific local cache, so a
    // different user logging in on the same device doesn't inherit a
    // stray draft from the previous account.
    await Promise.all([clearSession(), clearListingDraft()]);
  },
};

export const profile = {
  get: () => request<Profile>('/api/v1/profile', { method: 'GET', auth: true }),

  update: (payload: { displayName?: string; city?: string }) =>
    request<Profile>('/api/v1/profile', { method: 'PATCH', body: payload, auth: true }),

  updateNotifications: (payload: { pushEnabled?: boolean; emailEnabled?: boolean }) =>
    request<Profile>('/api/v1/profile/notifications', { method: 'PATCH', body: payload, auth: true }),

  changePassword: (newPassword: string) =>
    request<{ message: string }>('/api/v1/profile/password', { method: 'PATCH', body: { newPassword }, auth: true }),

  async uploadAvatar(fileUri: string, fileName: string) {
    // Converting to a real Blob (rather than passing RN's {uri,type,name}
    // shape straight to FormData) works correctly on both native and web —
    // a plain object isn't a valid FormData part in a real browser. The
    // blob already carries the correct MIME type from the source URI.
    const blob = await fetch(fileUri).then(r => r.blob());
    const formData = new FormData();
    formData.append('avatar', blob, fileName || 'avatar.jpg');
    return request<Profile>('/api/v1/profile/avatar', { method: 'POST', formData, auth: true });
  },

  registerPushToken: (token: string) =>
    request<{ registered: boolean }>('/api/v1/profile/push-token', { method: 'POST', body: { token }, auth: true }),
};

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export const categories = {
  list: () => request<Category[]>('/api/v1/categories'),
};

export interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  transformation: string;
}

export type WeightTier = 'LIGHT' | 'MEDIUM' | 'HEAVY';

export interface Listing {
  id: string;
  title: string;
  description: string | null;
  price: string;
  condition: string;
  city: string;
  categoryId: string;
  imageUrls: string[];
  deliveryOptions: string[];
  weightTier: WeightTier;
  status: string;
  attributes: Record<string, string>;
  createdAt: string;
}

export interface CreateListingPayload {
  title: string;
  description?: string;
  price: number;
  condition: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';
  city: string;
  categoryId: string;
  imageUrls: string[];
  deliveryOptions: string[];
  weightTier: WeightTier;
  attributes?: Record<string, string>;
  legalSourcingDeclared: true;
}

export interface ListingSummary {
  id: string;
  title: string;
  price: string;
  city: string;
  imageUrls: string[];
  createdAt: string;
}

export interface MyListing extends ListingSummary {
  status: string;
}

export interface UpdateListingPayload {
  price?: number;
  description?: string;
  imageUrls?: string[];
}

export interface ListingDetail {
  id: string;
  title: string;
  description: string | null;
  price: string;
  condition: string;
  city: string;
  imageUrls: string[];
  deliveryOptions: string[];
  weightTier: WeightTier;
  status: string;
  category: { id: string; name: string; slug: string };
  attributes: Record<string, string>;
  seller: { id: string; displayName: string | null; avatarUrl: string | null; city: string | null; isVerified: boolean };
  createdAt: string;
}

export type ListingSort = 'newest' | 'price_asc' | 'price_desc';

export interface ListingFilters {
  q?: string;
  sort: ListingSort;
  categoryIds: string[];
  conditions: string[];
  cities: string[];
  sizes: string[];
  minPrice?: number;
  maxPrice?: number;
}

export const EMPTY_LISTING_FILTERS: ListingFilters = {
  sort: 'newest',
  categoryIds: [],
  conditions: [],
  cities: [],
  sizes: [],
};

function filtersToQuery(filters?: ListingFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.sort !== 'newest') params.set('sort', filters.sort);
  if (filters.categoryIds.length) params.set('categoryIds', filters.categoryIds.join(','));
  if (filters.conditions.length) params.set('conditions', filters.conditions.join(','));
  if (filters.cities.length) params.set('cities', filters.cities.join(','));
  if (filters.sizes.length) params.set('sizes', filters.sizes.join(','));
  if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
  const qs = params.toString();
  return qs ? `&${qs}` : '';
}

export interface FilterOptions {
  cities: string[];
  sizes: string[];
}

// Uploads directly to Cloudinary using a short-lived signature from our API
// (see listings.getUploadSignature / conversations.getUploadSignature) — the
// image bytes never pass through our server. The signature is only valid
// for the exact params we signed (folder + transformation), so the resize
// can't be bypassed client-side. Shared by listing photos and chat images.
export async function uploadImageToCloudinary(fileUri: string, signature: UploadSignature): Promise<string> {
  const blob = await fetch(fileUri).then(r => r.blob());
  const formData = new FormData();
  formData.append('file', blob, 'photo.jpg');
  formData.append('api_key', signature.apiKey);
  formData.append('timestamp', String(signature.timestamp));
  formData.append('signature', signature.signature);
  formData.append('folder', signature.folder);
  formData.append('transformation', signature.transformation);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError('UPLOAD_FAILED', json?.error?.message ?? 'Image upload failed', res.status);
  }

  return json.secure_url as string;
}

export const listings = {
  browse: (page: number, filters?: ListingFilters) =>
    request<{ data: ListingSummary[]; hasMore: boolean; total: number }>(
      `/api/v1/listings?page=${page}${filtersToQuery(filters)}`,
      { raw: true },
    ),

  filterOptions: () => request<FilterOptions>('/api/v1/listings/filter-options'),

  get: (id: string) => request<ListingDetail>(`/api/v1/listings/${id}`),

  mine: () => request<MyListing[]>('/api/v1/listings/mine', { auth: true }),

  getUploadSignature: () =>
    request<UploadSignature>('/api/v1/listings/upload-signature', { method: 'POST', auth: true }),

  create: (payload: CreateListingPayload) =>
    request<Listing>('/api/v1/listings', { method: 'POST', body: payload, auth: true }),

  update: (id: string, payload: UpdateListingPayload) =>
    request<Listing>(`/api/v1/listings/${id}`, { method: 'PATCH', body: payload, auth: true }),

  markSold: (id: string) =>
    request<{ id: string; status: string }>(`/api/v1/listings/${id}/sold`, { method: 'PATCH', auth: true }),

  remove: (id: string) =>
    request<void>(`/api/v1/listings/${id}`, { method: 'DELETE', auth: true }),

  uploadImage: uploadImageToCloudinary,
};

export interface OrderSummary {
  id: string;
  listingId: string;
  priceAtPurchase: string;
  deliveryOption: string;
  status: string;
}

export interface OrderTimelineEntry {
  status: string;
  label: string;
  at: string;
}

export interface OrderDetail {
  id: string;
  buyerId: string;
  sellerId: string;
  priceAtPurchase: string;
  deliveryOption: string;
  status: string;
  displayStatus: string;
  shippingMethod: string | null;
  trackingReference: string | null;
  shippedAt: string | null;
  paymentMethod: string | null;
  canMarkCollected: boolean;
  sellerPayoutEligible: boolean;
  timeline: OrderTimelineEntry[];
  listing: { id: string; title: string; imageUrl: string | null };
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'ECOCASH' | 'ONEMONEY' | 'ZIMSWITCH' | 'CASH_ON_DELIVERY';

export interface PayOrderResult {
  paymentId: string;
  redirectUrl: string | null;
  instructions: string | null;
}

export interface PaymentStatusResult {
  orderStatus: string;
  paymentStatus: string | null;
}

export interface OrderListItem {
  id: string;
  priceAtPurchase: string;
  status: string;
  displayStatus: string;
  createdAt: string;
  listing: { id: string; title: string; imageUrl: string | null };
}

export const orders = {
  create: (payload: { listingId: string; deliveryOption: string }) =>
    request<OrderSummary>('/api/v1/orders', { method: 'POST', body: payload, auth: true }),

  get: (id: string) => request<OrderDetail>(`/api/v1/orders/${id}`, { auth: true }),

  purchases: () => request<OrderListItem[]>('/api/v1/orders/purchases', { auth: true }),

  sales: () => request<OrderListItem[]>('/api/v1/orders/sales', { auth: true }),

  deliveryFeeQuote: (listingId: string, deliveryOption: string) =>
    request<{ fee: number }>(
      `/api/v1/orders/delivery-fee?listingId=${encodeURIComponent(listingId)}&deliveryOption=${encodeURIComponent(deliveryOption)}`,
      { auth: true },
    ),

  pay: (id: string, payload: { method: PaymentMethod; email?: string; phone?: string }) =>
    request<PayOrderResult>(`/api/v1/orders/${id}/pay`, { method: 'POST', body: payload, auth: true }),

  paymentStatus: (id: string) =>
    request<PaymentStatusResult>(`/api/v1/orders/${id}/payment-status`, { auth: true }),

  confirmDelivery: (id: string) =>
    request<{ id: string; status: string; displayStatus: string }>(`/api/v1/orders/${id}/confirm-delivery`, {
      method: 'POST',
      auth: true,
    }),

  markCollected: (id: string) =>
    request<{ id: string; status: string; displayStatus: string }>(`/api/v1/orders/${id}/mark-collected`, {
      method: 'POST',
      auth: true,
    }),

  submitReview: (id: string, payload: { rating: number; comment?: string }) =>
    request<{ id: string; orderId: string; rating: number; comment: string | null; createdAt: string }>(
      `/api/v1/orders/${id}/reviews`,
      { method: 'POST', body: payload, auth: true },
    ),

  getReviews: (id: string) => request<OrderReviewsResult>(`/api/v1/orders/${id}/reviews`, { auth: true }),
};

export interface OrderReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface OrderReviewsResult {
  canReview: boolean;
  revealed: boolean;
  yourReview: (OrderReview & { flagged: boolean }) | null;
  counterpartReview: OrderReview | null;
}

export interface WishlistListing {
  id: string;
  title: string;
  price: string;
  city: string;
  imageUrls: string[];
  status: string;
  savedAt: string;
}

export const wishlist = {
  list: () => request<WishlistListing[]>('/api/v1/wishlist', { auth: true }),

  ids: () => request<string[]>('/api/v1/wishlist/ids', { auth: true }),

  save: (listingId: string) =>
    request<{ listingId: string; saved: boolean }>(`/api/v1/wishlist/${listingId}`, { method: 'POST', auth: true }),

  remove: (listingId: string) => request<void>(`/api/v1/wishlist/${listingId}`, { method: 'DELETE', auth: true }),

  // Mirrors the old local toggle's return-new-state contract so screens
  // that already track a listing's saved state locally don't need to
  // change their call sites beyond passing that known state in.
  async toggle(listingId: string, currentlySaved: boolean): Promise<boolean> {
    if (currentlySaved) {
      await this.remove(listingId);
      return false;
    }
    await this.save(listingId);
    return true;
  },
};

export interface ConversationParticipant {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface Conversation {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  createdAt: string;
  updatedAt: string;
  listing: { id: string; title: string; price: string; imageUrl: string | null };
  otherParticipant: ConversationParticipant;
  isMuted: boolean;
}

export interface ConversationListItem extends Conversation {
  lastMessage: { body: string | null; imageUrl: string | null; senderId: string; createdAt: string } | null;
  unreadCount: number;
}

export interface Message {
  id: string;
  senderId: string;
  body: string | null;
  imageUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export const conversations = {
  list: () => request<ConversationListItem[]>('/api/v1/conversations', { auth: true }),

  unreadCount: () => request<{ count: number }>('/api/v1/conversations/unread-count', { auth: true }),

  start: (listingId: string) => request<Conversation>('/api/v1/conversations', { method: 'POST', body: { listingId }, auth: true }),

  get: (id: string) => request<Conversation>(`/api/v1/conversations/${id}`, { auth: true }),

  messages: (id: string) => request<Message[]>(`/api/v1/conversations/${id}/messages`, { auth: true }),

  sendMessage: (id: string, payload: { body?: string; imageUrl?: string }) =>
    request<Message>(`/api/v1/conversations/${id}/messages`, { method: 'POST', body: payload, auth: true }),

  getUploadSignature: () =>
    request<UploadSignature>('/api/v1/conversations/upload-signature', { method: 'POST', auth: true }),

  archive: (id: string) =>
    request<{ id: string; archived: boolean }>(`/api/v1/conversations/${id}/archive`, { method: 'PATCH', auth: true }),

  mute: (id: string, muted: boolean) =>
    request<{ id: string; muted: boolean }>(`/api/v1/conversations/${id}/mute`, { method: 'PATCH', body: { muted }, auth: true }),
};

export interface SellerProfileData {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  city: string | null;
  joinedAt: string;
  ratingAvg: string;
  ratingCount: number;
  isVerified: boolean;
  salesCount: number;
  responseRate: number | null;
  followerCount: number;
  isFollowing: boolean;
  activeListings: ListingSummary[];
}

export const sellers = {
  get: (id: string) => request<SellerProfileData>(`/api/v1/sellers/${id}`, { auth: true }),

  follow: (id: string) =>
    request<{ sellerId: string; following: boolean }>(`/api/v1/sellers/${id}/follow`, { method: 'POST', auth: true }),

  unfollow: (id: string) => request<void>(`/api/v1/sellers/${id}/follow`, { method: 'DELETE', auth: true }),

  reviews: (id: string, page = 1) =>
    request<{ data: SellerReview[]; hasMore: boolean; total: number }>(
      `/api/v1/sellers/${id}/reviews?page=${page}`,
      { auth: true, raw: true },
    ),
};

export interface SellerReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer: { displayName: string | null; avatarUrl: string | null };
}

export const reviews = {
  flag: (reviewId: string, reason: string) =>
    request<{ id: string; reviewId: string; status: string; createdAt: string }>(
      `/api/v1/reviews/${reviewId}/flag`,
      { method: 'POST', body: { reason }, auth: true },
    ),
};

export type ReportReason = 'FAKE_ITEM' | 'SCAM' | 'INAPPROPRIATE' | 'OTHER';

export const reports = {
  getUploadSignature: () =>
    request<UploadSignature>('/api/v1/reports/upload-signature', { method: 'POST', auth: true }),

  create: (payload: { targetType: 'LISTING' | 'USER'; targetId: string; reason: ReportReason; note?: string; evidenceImageUrls?: string[] }) =>
    request<{ id: string; targetType: string; targetId: string; status: string; createdAt: string }>(
      '/api/v1/reports',
      { method: 'POST', body: payload, auth: true },
    ),
};

export interface VerificationRequestData {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export const verification = {
  mine: () => request<VerificationRequestData | null>('/api/v1/verification/mine', { auth: true }),

  getUploadSignature: () =>
    request<UploadSignature>('/api/v1/verification/upload-signature', { method: 'POST', auth: true }),

  submit: (payload: { idDocumentUrl: string; selfieUrl: string }) =>
    request<VerificationRequestData>('/api/v1/verification', { method: 'POST', body: payload, auth: true }),
};

export interface DeletionRequestData {
  id: string;
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
  requestedAt: string;
  scheduledFor: string;
  processedAt: string | null;
}

export interface AccountExportData {
  exportedAt: string;
  listings: unknown[];
  orders: unknown[];
  messages: unknown[];
}

export const account = {
  getDeletionRequest: () => request<DeletionRequestData | null>('/api/v1/account/deletion-request', { auth: true }),

  requestDeletion: () =>
    request<DeletionRequestData>('/api/v1/account/deletion-request', { method: 'POST', auth: true }),

  cancelDeletion: () => request<void>('/api/v1/account/deletion-request', { method: 'DELETE', auth: true }),

  exportData: () => request<AccountExportData>('/api/v1/account/export', { auth: true }),
};
