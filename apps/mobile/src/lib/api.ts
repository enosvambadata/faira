import { getSession, saveSession, clearSession } from './session';

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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
    await clearSession();
  },
};

export const profile = {
  get: () => request<Profile>('/api/v1/profile', { method: 'GET', auth: true }),

  update: (payload: { displayName?: string; city?: string }) =>
    request<Profile>('/api/v1/profile', { method: 'PATCH', body: payload, auth: true }),

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
  attributes?: Record<string, string>;
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
  status: string;
  category: { id: string; name: string; slug: string };
  attributes: Record<string, string>;
  seller: { id: string; displayName: string | null; avatarUrl: string | null; city: string | null };
  createdAt: string;
}

export interface ListingFilters {
  q?: string;
  categoryIds: string[];
  conditions: string[];
  cities: string[];
  sizes: string[];
  minPrice?: number;
  maxPrice?: number;
}

export const EMPTY_LISTING_FILTERS: ListingFilters = {
  categoryIds: [],
  conditions: [],
  cities: [],
  sizes: [],
};

function filtersToQuery(filters?: ListingFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
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

  // Uploads directly to Cloudinary using a short-lived signature from our
  // API (see getUploadSignature) — the image bytes never pass through our
  // server. The signature is only valid for the exact params we signed
  // (folder + transformation), so the resize can't be bypassed client-side.
  async uploadImage(fileUri: string, signature: UploadSignature): Promise<string> {
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
  },
};
