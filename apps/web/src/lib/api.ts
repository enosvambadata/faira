import { createClient } from "./supabase";
import { buildMarketQuery, type MarketBrowseParams } from "./marketQuery";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const supabase = createClient();

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(code: string, message: string, status: number, details: unknown = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  // Faira-internal admin surfaces (Collect UK dispatch) authenticate with
  // the shared ADMIN_TOKEN header instead of a Supabase session.
  adminToken?: string;
}

// Mirrors apps/mobile/src/lib/api.ts's request<T>() shape so both clients
// talk to the same backend the same way — auth is always a Supabase
// access token in the Authorization header, never a cookie/session sent
// to apps/api directly.
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.auth) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }

  if (options.adminToken) {
    headers["x-admin-token"] = options.adminToken;
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(err.code ?? "UNKNOWN_ERROR", err.message ?? "Something went wrong", res.status, err.details ?? null);
  }

  return json.data as T;
}

// Like request(), but returns the whole response envelope rather than just
// `data` — for list endpoints that carry pagination metadata alongside it
// (e.g. the marketplace browse: { data, hasMore, total }).
async function requestRaw<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.auth) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, { method: options.method ?? "GET", headers, body });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(err.code ?? "UNKNOWN_ERROR", err.message ?? "Something went wrong", res.status, err.details ?? null);
  }

  return json as T;
}

export interface OnboardingDraft {
  id: string;
  fullName: string | null;
  mobileNumber: string | null;
  sellerType: "INDIVIDUAL" | "REGISTERED_BUSINESS" | null;
  businessName: string | null;
  productCategories: string[];
  hasPhysicalShop: boolean | null;
  shopAddress: string | null;
  city: string | null;
  preferredHubId: string | null;
  nationalIdNumber: string | null;
  agreedToTerms: boolean;
  status: "DRAFT" | "SUBMITTED";
  submittedAt: string | null;
}

export type OnboardingDraftUpdate = Partial<{
  fullName: string;
  mobileNumber: string;
  sellerType: "INDIVIDUAL" | "REGISTERED_BUSINESS";
  businessName: string;
  productCategories: string[];
  hasPhysicalShop: boolean;
  shopAddress: string;
  city: string;
  preferredHubId: string;
  nationalIdNumber: string;
  agreeToTerms: boolean;
}>;

export interface Hub {
  id: string;
  name: string;
  city: string;
  address: string;
  openingHours: string;
}

export type VerificationDocType = "ID" | "BUSINESS" | "SHOP_PHOTO";

export type VerificationStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "MORE_INFO_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED"
  | "EXPIRED";

export interface VerificationStatusResult {
  id?: string;
  status: VerificationStatus;
  idDocumentUrl: string | null;
  businessDocumentUrl: string | null;
  shopPhotoUrl: string | null;
  reviewNotes: string | null;
  submittedAt?: string;
  reviewedAt?: string | null;
}

export interface SignedUpload {
  path: string;
  signedUrl: string;
  token: string;
}

export const auth = {
  // Reuses the existing Express endpoint (not the Supabase browser client's
  // own signUp) so account creation stays server-controlled. The account is
  // created UNconfirmed and Supabase emails a confirm link — the caller must
  // not auto-login, it shows a "check your inbox" screen (see signup/page.tsx).
  // Login goes straight through the browser Supabase client so @supabase/ssr's
  // cookie-based session sync stays correct.
  signup: (payload: { email: string; password: string; redirectTo?: string }) =>
    request<{
      id: string;
      email: string | null;
      phone: string | null;
      confirmationEmailSent?: boolean;
    }>("/api/v1/auth/signup", {
      method: "POST",
      body: payload,
    }),

  resendConfirmation: (email: string, redirectTo?: string) =>
    request<{ message: string }>("/api/v1/auth/email/resend", {
      method: "POST",
      body: { email, redirectTo },
    }),
};

export interface CollectUkFreightRate {
  id: string;
  category: string;
  itemName: string;
  pricePence: number;
  sortOrder: number;
  isActive: boolean;
}

export interface CollectUkFreightRatePayload {
  category: string;
  itemName: string;
  pricePence: number;
  sortOrder?: number;
}

export const collectUkFreight = {
  list: (companyId: string) =>
    request<CollectUkFreightRate[]>(`/api/v1/collect-uk/companies/${companyId}/freight-rates`, { auth: true }),

  seed: (companyId: string) =>
    request<{ created: number; alreadyPopulated: boolean }>(
      `/api/v1/collect-uk/companies/${companyId}/freight-rates/seed`,
      { method: "POST", auth: true },
    ),

  add: (companyId: string, payload: CollectUkFreightRatePayload) =>
    request<CollectUkFreightRate>(`/api/v1/collect-uk/companies/${companyId}/freight-rates`, {
      method: "POST",
      body: payload,
      auth: true,
    }),

  update: (companyId: string, rateId: string, payload: Partial<CollectUkFreightRatePayload> & { isActive?: boolean }) =>
    request<CollectUkFreightRate>(`/api/v1/collect-uk/companies/${companyId}/freight-rates/${rateId}`, {
      method: "PATCH",
      body: payload,
      auth: true,
    }),

  remove: (companyId: string, rateId: string) =>
    request<{ id: string; deleted: boolean }>(
      `/api/v1/collect-uk/companies/${companyId}/freight-rates/${rateId}`,
      { method: "DELETE", auth: true },
    ),
};

export interface CollectUkPayment {
  id: string;
  customerName: string;
  customerContact: string | null;
  description: string;
  amountPence: number;
  currency: string;
  status: string;
  checkoutUrl: string | null;
  shipmentId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface CollectUkPaymentPayload {
  customerName: string;
  customerContact?: string;
  description: string;
  amountPence: number;
  shipmentId?: string;
}

export const collectUkPayments = {
  list: (companyId: string) =>
    request<CollectUkPayment[]>(`/api/v1/collect-uk/companies/${companyId}/payments`, { auth: true }),

  create: (companyId: string, payload: CollectUkPaymentPayload) =>
    request<CollectUkPayment>(`/api/v1/collect-uk/companies/${companyId}/payments`, {
      method: "POST",
      body: payload,
      auth: true,
    }),

  get: (companyId: string, paymentId: string) =>
    request<CollectUkPayment>(`/api/v1/collect-uk/companies/${companyId}/payments/${paymentId}`, { auth: true }),
};

export type CollectUkCompanyRoleName = "COMPANY_ADMIN" | "DISPATCHER";

export interface CollectUkTeamMember {
  roleId: string;
  userId: string;
  email: string | null;
  role: CollectUkCompanyRoleName;
  isYou: boolean;
  createdAt: string;
}

export const collectUkTeam = {
  list: (companyId: string) =>
    request<CollectUkTeamMember[]>(`/api/v1/collect-uk/companies/${companyId}/team`, { auth: true }),

  add: (companyId: string, payload: { email: string; role: CollectUkCompanyRoleName }) =>
    request<CollectUkTeamMember>(`/api/v1/collect-uk/companies/${companyId}/team`, {
      method: "POST",
      body: payload,
      auth: true,
    }),

  changeRole: (companyId: string, roleId: string, role: CollectUkCompanyRoleName) =>
    request<CollectUkTeamMember>(`/api/v1/collect-uk/companies/${companyId}/team/${roleId}`, {
      method: "PATCH",
      body: { role },
      auth: true,
    }),

  remove: (companyId: string, roleId: string) =>
    request<{ roleId: string; deleted: boolean }>(`/api/v1/collect-uk/companies/${companyId}/team/${roleId}`, {
      method: "DELETE",
      auth: true,
    }),
};

export const hubs = {
  list: () => request<Hub[]>("/api/v1/fulfilment/hubs", { auth: true }),
};

export const sellerOnboarding = {
  getDraft: () => request<OnboardingDraft>("/api/v1/fulfilment/sellers/me/onboarding", { auth: true }),

  saveDraft: (payload: OnboardingDraftUpdate) =>
    request<OnboardingDraft>("/api/v1/fulfilment/sellers/me/onboarding", { method: "PATCH", body: payload, auth: true }),

  submit: () => request<OnboardingDraft>("/api/v1/fulfilment/sellers/me/onboarding/submit", { method: "POST", auth: true }),
};

export const sellerVerification = {
  getStatus: () => request<VerificationStatusResult>("/api/v1/fulfilment/sellers/me/verification", { auth: true }),

  getUploadUrl: (docType: VerificationDocType) =>
    request<SignedUpload>("/api/v1/fulfilment/sellers/me/verification/upload-url", {
      method: "POST",
      body: { docType },
      auth: true,
    }),

  submit: (payload: { idDocumentPath: string; businessDocumentPath?: string; shopPhotoPath?: string }) =>
    request<VerificationStatusResult>("/api/v1/fulfilment/sellers/me/verification/submit", {
      method: "POST",
      body: payload,
      auth: true,
    }),

  // Uploads directly to Supabase Storage using the signed URL/token from
  // getUploadUrl — the file bytes never pass through apps/api.
  uploadFile: async (upload: SignedUpload, file: File) => {
    const supabaseClient = createClient();
    const { error } = await supabaseClient.storage
      .from("seller-verification")
      .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
    if (error) throw new ApiError("UPLOAD_FAILED", error.message, 400);
  },
};

export type ParcelSizeTier = "SMALL" | "MEDIUM" | "LARGE" | "EXTRA_LARGE";

export interface ShipmentDraft {
  id: string;
  status: string;
  buyerName: string;
  buyerContact: string;
  originHubId: string;
  destinationHubId: string;
  category: string;
  description: string | null;
  declaredValue: string;
  sizeTier: ParcelSizeTier;
  createdAt: string;
}

export interface ShipmentDetail extends ShipmentDraft {
  feePayer: "SELLER" | "BUYER" | null;
  deliveryFee: string | null;
  reference: string | null;
  qrCodeUrl: string | null;
  dropoffDeadline: string | null;
}

export type QuoteSource = "pricing_rule" | "fallback_default";

export interface ShipmentQuote {
  fee: number;
  source: QuoteSource;
  sizeTier: ParcelSizeTier;
}

export interface ShipmentQuoteConfirmation {
  id: string;
  status: string;
  feePayer: "SELLER" | "BUYER";
  deliveryFee: string;
  quoteSource: QuoteSource;
}

export interface ShipmentConfirmation {
  id: string;
  status: string;
  displayStatus: string;
  dropoffDeadline: string;
  reference: string;
  qrCodeUrl: string;
}

export interface HubOpsShipment {
  id: string;
  reference: string | null;
  status: string;
  displayStatus: string;
  buyerName: string;
  buyerContact: string;
  category: string;
  description: string | null;
  declaredValue: string;
  sizeTier: ParcelSizeTier;
  originHubId: string;
  destinationHubId: string;
}

export interface HubOpsTransitionResult {
  id: string;
  status: string;
  displayStatus: string;
}

export interface HubOpsCollectionShipment {
  id: string;
  reference: string | null;
  status: string;
  displayStatus: string;
  buyerName: string;
  buyerContact: string;
  declaredValue: string;
  requiresIdCheck: boolean;
}

export interface CollectPayload {
  code: string;
  idCheckPerformed: boolean;
  idCheckOverrideReason?: string;
  proofImageUrl?: string;
}

export const hubOps = {
  search: (reference: string) =>
    request<HubOpsShipment>(`/api/v1/fulfilment/hub-ops/shipments/search?reference=${encodeURIComponent(reference)}`, {
      auth: true,
    }),

  searchAtDestination: (reference: string) =>
    request<HubOpsCollectionShipment>(
      `/api/v1/fulfilment/hub-ops/shipments/search-at-destination?reference=${encodeURIComponent(reference)}`,
      { auth: true },
    ),

  collect: (id: string, payload: CollectPayload) =>
    request<HubOpsTransitionResult>(`/api/v1/fulfilment/hub-ops/shipments/${id}/collect`, {
      method: "POST",
      body: payload,
      auth: true,
    }),

  acceptDropoff: (id: string) =>
    request<HubOpsTransitionResult>(`/api/v1/fulfilment/hub-ops/shipments/${id}/accept-dropoff`, {
      method: "POST",
      auth: true,
    }),

  rejectDropoff: (id: string, reason: string) =>
    request<HubOpsTransitionResult>(`/api/v1/fulfilment/hub-ops/shipments/${id}/reject-dropoff`, {
      method: "POST",
      body: { reason },
      auth: true,
    }),

  getEvidenceUploadParams: () =>
    request<CloudinarySignedUpload>("/api/v1/fulfilment/hub-ops/evidence-upload-params", { auth: true }),

  inspect: (id: string, payload: InspectPayload) =>
    request<HubOpsTransitionResult>(`/api/v1/fulfilment/hub-ops/shipments/${id}/inspect`, {
      method: "POST",
      body: payload,
      auth: true,
    }),

  seal: (id: string, sealNumber: string) =>
    request<HubOpsTransitionResult>(`/api/v1/fulfilment/hub-ops/shipments/${id}/seal`, {
      method: "POST",
      body: { sealNumber },
      auth: true,
    }),

  // Bypasses request<T>() since this returns an SVG image, not JSON.
  getLabelSvg: async (id: string): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(`${API_URL}/api/v1/fulfilment/hub-ops/shipments/${id}/label`, {
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new ApiError(json?.error?.code ?? "UNKNOWN_ERROR", json?.error?.message ?? "Could not generate the label", res.status);
    }
    return res.text();
  },
};

export interface CloudinarySignedUpload {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  // Omitted for document uploads (stored untouched); present for photo
  // uploads that get an incoming resize.
  transformation?: string;
  type: "upload" | "authenticated";
}

export type ParcelCondition = "GOOD" | "DAMAGED" | "SUSPICIOUS";

export interface InspectPayload {
  weightKg: number;
  dimensions: string;
  condition: ParcelCondition;
  photoPublicIds: string[];
}

// Uploads directly to Cloudinary using the signed params from
// getEvidenceUploadParams — the image bytes never pass through apps/api.
// Returns the public_id, which is what gets sent to POST .../inspect (not
// a URL, since this folder uses authenticated delivery -- see
// getParcelEvidenceViewUrl in apps/api/src/lib/cloudinary.ts).
export async function uploadParcelEvidencePhoto(upload: CloudinarySignedUpload, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", upload.apiKey);
  formData.append("timestamp", String(upload.timestamp));
  formData.append("signature", upload.signature);
  formData.append("folder", upload.folder);
  if (upload.transformation) formData.append("transformation", upload.transformation);
  formData.append("type", upload.type);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${upload.cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new ApiError("UPLOAD_FAILED", json?.error?.message ?? "Photo upload failed", res.status);
  }
  return json.public_id as string;
}

// Driver documents are a mix of photos and PDFs, so this posts to the
// `/auto/upload` endpoint (Cloudinary picks the resource type) and never
// sends an incoming transformation -- certificates are stored as
// submitted. The signed params must match exactly (no transformation
// field), or Cloudinary rejects the signature. Returns the public_id.
export async function uploadDriverDocument(upload: CloudinarySignedUpload, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", upload.apiKey);
  formData.append("timestamp", String(upload.timestamp));
  formData.append("signature", upload.signature);
  formData.append("folder", upload.folder);
  formData.append("type", upload.type);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${upload.cloudName}/auto/upload`, {
    method: "POST",
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new ApiError("UPLOAD_FAILED", json?.error?.message ?? "Document upload failed", res.status);
  }
  return json.public_id as string;
}

export interface CreateShipmentPayload {
  buyerName: string;
  buyerContact: string;
  originHubId: string;
  destinationHubId: string;
  category: string;
  description?: string;
  declaredValue: number;
  sizeTier: ParcelSizeTier;
}

export const shipments = {
  create: (payload: CreateShipmentPayload) =>
    request<ShipmentDraft>("/api/v1/fulfilment/shipments", { method: "POST", body: payload, auth: true }),

  get: (id: string) => request<ShipmentDetail>(`/api/v1/fulfilment/shipments/${id}`, { auth: true }),

  abandon: (id: string) => request<void>(`/api/v1/fulfilment/shipments/${id}`, { method: "DELETE", auth: true }),

  getQuote: (id: string) => request<ShipmentQuote>(`/api/v1/fulfilment/shipments/${id}/quote`, { auth: true }),

  confirmQuote: (id: string, feePayer: "SELLER" | "BUYER") =>
    request<ShipmentQuoteConfirmation>(`/api/v1/fulfilment/shipments/${id}/quote`, {
      method: "POST",
      body: { feePayer },
      auth: true,
    }),

  confirm: (id: string) =>
    request<ShipmentConfirmation>(`/api/v1/fulfilment/shipments/${id}/confirm`, { method: "POST", auth: true }),

  getTrackingLink: (id: string) =>
    request<{ token: string; url: string }>(`/api/v1/fulfilment/shipments/${id}/tracking-link`, { auth: true }),
};

export interface TransportRoute {
  id: string;
  originHubId: string;
  destinationHubId: string;
  providerId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface TransportRun {
  id: string;
  routeId: string;
  providerId: string | null;
  operatorUserId: string | null;
  vehicleReference: string | null;
  scheduledDeparture: string;
  scheduledArrival: string;
  actualDeparture: string | null;
  actualArrival: string | null;
  status: string;
  createdAt: string;
}

export const transport = {
  listRoutes: () => request<TransportRoute[]>("/api/v1/fulfilment/transport/routes", { auth: true }),

  listRuns: () => request<TransportRun[]>("/api/v1/fulfilment/transport/runs?status=SCHEDULED", { auth: true }),
};

export interface ManifestParcelSummary {
  shipmentId: string;
  reference: string | null;
  destinationHubId: string;
  sizeTier: ParcelSizeTier;
  status: string;
  scannedOutAt: string | null;
  scannedInAt: string | null;
  shortShipped: boolean;
}

export interface Manifest {
  id: string;
  runId: string;
  status: "OPEN" | "FINALIZED";
  finalizedAt: string | null;
  finalizedById: string | null;
  createdAt: string;
}

export interface ManifestDetail extends Manifest {
  parcels: ManifestParcelSummary[];
}

export const manifests = {
  create: (runId: string) => request<Manifest>("/api/v1/fulfilment/manifests", { method: "POST", body: { runId }, auth: true }),

  get: (id: string) => request<ManifestDetail>(`/api/v1/fulfilment/manifests/${id}`, { auth: true }),

  addParcel: (manifestId: string, shipmentId: string) =>
    request<{ manifestId: string; shipmentId: string; status: string }>(`/api/v1/fulfilment/manifests/${manifestId}/parcels`, {
      method: "POST",
      body: { shipmentId },
      auth: true,
    }),

  removeParcel: (manifestId: string, shipmentId: string) =>
    request<void>(`/api/v1/fulfilment/manifests/${manifestId}/parcels/${shipmentId}`, { method: "DELETE", auth: true }),

  finalize: (id: string) => request<Manifest>(`/api/v1/fulfilment/manifests/${id}/finalize`, { method: "POST", auth: true }),

  // Bypasses request<T>() since this returns plain text, not JSON.
  getDocument: async (id: string): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(`${API_URL}/api/v1/fulfilment/manifests/${id}/document`, {
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new ApiError(json?.error?.code ?? "UNKNOWN_ERROR", json?.error?.message ?? "Could not generate the manifest document", res.status);
    }
    return res.text();
  },

  scanOut: (manifestId: string, reference: string) =>
    request<{ shipmentId: string; reference: string; status: string; runDeparted: boolean }>(
      `/api/v1/fulfilment/manifests/${manifestId}/scan-out`,
      { method: "POST", body: { reference }, auth: true },
    ),

  shortShip: (manifestId: string, reference: string, reason: string) =>
    request<{ shipmentId: string; reference: string; shortShipped: boolean; runDeparted: boolean }>(
      `/api/v1/fulfilment/manifests/${manifestId}/short-ship`,
      { method: "POST", body: { reference, reason }, auth: true },
    ),

  scanIn: (reference: string) =>
    request<{ shipmentId: string; reference: string; status: string }>("/api/v1/fulfilment/manifests/scan-in", {
      method: "POST",
      body: { reference },
      auth: true,
    }),
};

export interface BuyerTrackingInfo {
  status: string;
  originHub: { name: string; city: string };
  destinationHub: { name: string; city: string; address: string; openingHours: string };
  estimatedCollectionDate: string | null;
  paymentComplete: boolean;
}

// Public and unauthenticated -- no Supabase session involved, since buyers
// have no account. Uses request<T>() with auth omitted (defaults to false).
export const tracking = {
  get: (token: string) => request<BuyerTrackingInfo>(`/api/v1/fulfilment/tracking/${encodeURIComponent(token)}`),
};

export type CollectUkCompanyRoleType = "COMPANY_ADMIN" | "DISPATCHER";

export interface CollectUkCompany {
  id: string;
  name: string;
  slug: string;
  countriesServed: string[];
  brandName: string | null;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CollectUkCompanyMembership extends CollectUkCompany {
  role: CollectUkCompanyRoleType;
}

export interface CollectUkWarehouse {
  id: string;
  companyId: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  openingHours: string;
  isActive: boolean;
}

export interface CreateCollectUkCompanyPayload {
  name: string;
  countriesServed: string[];
}

export interface CollectUkWarehousePayload {
  name: string;
  address: string;
  city: string;
  postcode: string;
  openingHours: string;
}

export const collectUkCompanies = {
  create: (payload: CreateCollectUkCompanyPayload) =>
    request<CollectUkCompany>("/api/v1/collect-uk/companies", { method: "POST", body: payload, auth: true }),

  mine: () => request<CollectUkCompanyMembership[]>("/api/v1/collect-uk/companies/mine", { auth: true }),

  get: (id: string) => request<CollectUkCompany>(`/api/v1/collect-uk/companies/${id}`, { auth: true }),

  update: (id: string, payload: Partial<CreateCollectUkCompanyPayload> & { brandName?: string | null; logoUrl?: string | null }) =>
    request<CollectUkCompany>(`/api/v1/collect-uk/companies/${id}`, { method: "PATCH", body: payload, auth: true }),

  listWarehouses: (id: string) =>
    request<CollectUkWarehouse[]>(`/api/v1/collect-uk/companies/${id}/warehouses`, { auth: true }),

  createWarehouse: (id: string, payload: CollectUkWarehousePayload) =>
    request<CollectUkWarehouse>(`/api/v1/collect-uk/companies/${id}/warehouses`, { method: "POST", body: payload, auth: true }),

  updateWarehouse: (id: string, warehouseId: string, payload: Partial<CollectUkWarehousePayload & { isActive: boolean }>) =>
    request<CollectUkWarehouse>(`/api/v1/collect-uk/companies/${id}/warehouses/${warehouseId}`, {
      method: "PATCH",
      body: payload,
      auth: true,
    }),

  listBookings: (id: string) =>
    request<CollectUkBookingSummary[]>(`/api/v1/collect-uk/companies/${id}/bookings`, { auth: true }),

  confirmHandover: (id: string, bookingId: string) =>
    request<{ id: string; status: string }>(`/api/v1/collect-uk/companies/${id}/bookings/${bookingId}/confirm-handover`, {
      method: "POST",
      auth: true,
    }),

  listWindows: (id: string) =>
    request<CollectUkCompanyWindow[]>(`/api/v1/collect-uk/companies/${id}/windows`, { auth: true }),

  createWindow: (id: string, payload: { startDate: string; endDate: string }) =>
    request<CollectUkCompanyWindow & { attachedBookings: number }>(`/api/v1/collect-uk/companies/${id}/windows`, {
      method: "POST",
      body: payload,
      auth: true,
    }),

  getBilling: (id: string) => request<CollectUkBillingStatement>(`/api/v1/collect-uk/companies/${id}/billing`, { auth: true }),

  cancelBooking: (id: string, bookingId: string) =>
    request<{ id: string; status: string }>(`/api/v1/collect-uk/companies/${id}/bookings/${bookingId}/cancel`, {
      method: "POST",
      auth: true,
    }),

  // Warehouse scan-in: `reference` comes from a scanned label QR (or typed).
  receiveByReference: (id: string, reference: string) =>
    request<CollectUkReceiveResult>(`/api/v1/collect-uk/companies/${id}/bookings/receive`, {
      method: "POST",
      body: { reference },
      auth: true,
    }),
};

export interface CollectUkReceiveResult {
  id: string;
  reference: string | null;
  customerName: string;
  numberOfParcels: number;
  destinationCountry: string;
  status: string;
}

export type CollectUkShipmentStatus = "PREPARING" | "IN_TRANSIT" | "ARRIVED" | "COMPLETED" | "CANCELLED";

export interface CollectUkShipmentSummary {
  id: string;
  reference: string;
  destinationCountry: string | null;
  status: CollectUkShipmentStatus;
  createdAt: string;
  recipientCount: number;
  milestoneCount: number;
  latestStage: string | null;
}

export interface CollectUkShipmentRecipient {
  id: string;
  customerName: string;
  customerContact: string;
  bookingId: string | null;
  createdAt: string;
}

export interface CollectUkShipmentMilestone {
  id: string;
  stage: string;
  location: string | null;
  note: string | null;
  pickupAddress: string | null;
  pickupFrom: string | null;
  pickupTo: string | null;
  notifiedCount: number;
  createdAt: string;
}

export interface CollectUkShipmentParcel {
  id: string;
  recipientId: string | null;
  senderName: string;
  receiverName: string;
  receiverContact: string | null;
  receiverAddress: string | null;
  receiverCity: string | null;
  description: string;
  category: string | null;
  pieces: number;
  weightKg: number | null;
  declaredValuePence: number | null;
  loadedAt: string | null;
  createdAt: string;
}

export interface CollectUkManifestSummary {
  finalizedAt: string | null;
  parcelCount: number;
  loadedCount: number;
  totalPieces: number;
  totalWeightKg: number;
  totalDeclaredValuePence: number;
}

export interface CollectUkShipmentParcelPayload {
  recipientId?: string;
  senderName?: string;
  receiverName: string;
  receiverContact?: string;
  receiverAddress?: string;
  receiverCity?: string;
  description: string;
  category?: string;
  pieces?: number;
  weightKg?: number;
  declaredValuePence?: number;
}

export interface CollectUkShipmentDetail {
  id: string;
  reference: string;
  destinationCountry: string | null;
  status: CollectUkShipmentStatus;
  manifestFinalizedAt: string | null;
  createdAt: string;
  recipients: CollectUkShipmentRecipient[];
  milestones: CollectUkShipmentMilestone[];
  parcels: CollectUkShipmentParcel[];
  manifest: CollectUkManifestSummary;
}

export interface PostMilestonePayload {
  stage: string;
  location?: string;
  note?: string;
  pickupAddress?: string;
  pickupFrom?: string;
  pickupTo?: string;
  setStatus?: CollectUkShipmentStatus;
  notify?: boolean;
}

export interface CollectUkCorridorRow {
  destination: string;
  shipments: number;
  parcels: number;
  pieces: number;
  totalWeightKg: number;
  totalDeclaredValuePence: number;
}

export interface CollectUkShipmentAnalytics {
  totals: {
    shipments: number;
    parcels: number;
    pieces: number;
    totalWeightKg: number;
    totalDeclaredValuePence: number;
    loaded: number;
  };
  byDestination: CollectUkCorridorRow[];
  byStatus: { status: string; count: number }[];
}

export const collectUkShipments = {
  list: (companyId: string) =>
    request<CollectUkShipmentSummary[]>(`/api/v1/collect-uk/companies/${companyId}/shipments`, { auth: true }),

  analytics: (companyId: string) =>
    request<CollectUkShipmentAnalytics>(`/api/v1/collect-uk/companies/${companyId}/shipments/analytics`, { auth: true }),

  create: (companyId: string, payload: { reference: string; destinationCountry?: string }) =>
    request<{ id: string; reference: string; destinationCountry: string | null; status: CollectUkShipmentStatus; createdAt: string }>(
      `/api/v1/collect-uk/companies/${companyId}/shipments`,
      { method: "POST", body: payload, auth: true },
    ),

  get: (companyId: string, shipmentId: string) =>
    request<CollectUkShipmentDetail>(`/api/v1/collect-uk/companies/${companyId}/shipments/${shipmentId}`, { auth: true }),

  addRecipient: (
    companyId: string,
    shipmentId: string,
    payload: { bookingId?: string; customerName?: string; customerContact?: string },
  ) =>
    request<CollectUkShipmentRecipient>(`/api/v1/collect-uk/companies/${companyId}/shipments/${shipmentId}/recipients`, {
      method: "POST",
      body: payload,
      auth: true,
    }),

  removeRecipient: (companyId: string, shipmentId: string, recipientId: string) =>
    request<{ id: string; deleted: boolean }>(
      `/api/v1/collect-uk/companies/${companyId}/shipments/${shipmentId}/recipients/${recipientId}`,
      { method: "DELETE", auth: true },
    ),

  postMilestone: (companyId: string, shipmentId: string, payload: PostMilestonePayload) =>
    request<CollectUkShipmentMilestone>(`/api/v1/collect-uk/companies/${companyId}/shipments/${shipmentId}/milestones`, {
      method: "POST",
      body: payload,
      auth: true,
    }),

  addParcel: (companyId: string, shipmentId: string, payload: CollectUkShipmentParcelPayload) =>
    request<CollectUkShipmentParcel>(`/api/v1/collect-uk/companies/${companyId}/shipments/${shipmentId}/parcels`, {
      method: "POST",
      body: payload,
      auth: true,
    }),

  removeParcel: (companyId: string, shipmentId: string, parcelId: string) =>
    request<{ id: string; deleted: boolean }>(
      `/api/v1/collect-uk/companies/${companyId}/shipments/${shipmentId}/parcels/${parcelId}`,
      { method: "DELETE", auth: true },
    ),

  finalizeManifest: (companyId: string, shipmentId: string) =>
    request<{ finalizedAt: string }>(
      `/api/v1/collect-uk/companies/${companyId}/shipments/${shipmentId}/manifest/finalize`,
      { method: "POST", auth: true },
    ),

  loadParcel: (companyId: string, shipmentId: string, parcelId: string) =>
    request<CollectUkShipmentParcel & { alreadyLoaded: boolean }>(
      `/api/v1/collect-uk/companies/${companyId}/shipments/${shipmentId}/parcels/${parcelId}/load`,
      { method: "POST", auth: true },
    ),

  unloadParcel: (companyId: string, shipmentId: string, parcelId: string) =>
    request<CollectUkShipmentParcel>(
      `/api/v1/collect-uk/companies/${companyId}/shipments/${shipmentId}/parcels/${parcelId}/unload`,
      { method: "POST", auth: true },
    ),
};

export interface CollectUkWindowRange {
  startDate: string;
  endDate: string;
}

export interface CollectUkRate {
  basePerStopPence: number;
  tierSmallPence: number;
  tierMediumPence: number;
  tierLargePence: number;
  tierXlPence: number;
}

export interface CollectUkBillingLine {
  id: string;
  reference: string | null;
  customerName: string;
  parcelSizeTier: ParcelSizeTier;
  numberOfParcels: number;
  chargePence: number | null;
  isVehicle: boolean;
  handedOverAt: string;
}

export interface CollectUkBillingStatement {
  rate: CollectUkRate | null;
  grandTotalPence: number;
  groups: { window: CollectUkWindowRange | null; totalPence: number; lines: CollectUkBillingLine[] }[];
}

export interface CollectUkCompanyWindow {
  id: string;
  companyId: string;
  startDate: string;
  endDate: string;
}

export interface CollectUkBookingCompany {
  id: string;
  name: string;
  logoUrl: string | null;
  countriesServed: string[];
  nextWindow: CollectUkWindowRange | null;
}

export interface CreateBookingPayload {
  customerName: string;
  customerContact: string;
  customerEmail?: string;
  destinationCountry: string;
  collectionAddress: string;
  collectionPostcode: string;
  parcelSizeTier: ParcelSizeTier;
  numberOfParcels?: number;
  itemTypes: CollectUkItemType[];
  itemTypeOther?: string;
  vehicleType?: CollectUkVehicleType;
  parcelWeightKg?: number;
  specialInstructions?: string;
}

export type CollectUkItemType = "DRUM" | "SUITCASE" | "FRIDGE" | "STOVE" | "PALLET" | "VEHICLE" | "OTHER";
export type CollectUkVehicleType = "SEDAN" | "SUV" | "TRUCK";

export interface BookingConfirmation {
  reference: string;
  trackingUrl: string;
}

export interface CollectUkBookingSummary {
  id: string;
  reference: string | null;
  status: string;
  customerName: string;
  customerContact: string;
  destinationCountry: string;
  collectionAddress: string;
  collectionPostcode: string;
  preferredDate: string | null;
  collectionWindow: CollectUkWindowRange | null;
  parcelSizeTier: ParcelSizeTier;
  numberOfParcels: number;
  itemTypes: CollectUkItemType[];
  itemTypeOther: string | null;
  vehicleType: CollectUkVehicleType | null;
  createdAt: string;
}

export interface CollectUkBookingTrackingInfo {
  reference: string;
  status: string;
  companyName: string;
  companyLogoUrl: string | null;
  destinationCountry: string;
  collectionAddress: string;
  collectionPostcode: string;
  preferredDate: string | null;
  collectionWindow: CollectUkWindowRange | null;
}

// Public and unauthenticated -- no Faira account for guest customers, per
// the Collect UK ADR/reuse assessment's "guest booking" decision.
export const collectUkBookings = {
  getCompany: (slug: string) => request<CollectUkBookingCompany>(`/api/v1/collect-uk/book/${encodeURIComponent(slug)}`),

  create: (slug: string, payload: CreateBookingPayload) =>
    request<BookingConfirmation>(`/api/v1/collect-uk/book/${encodeURIComponent(slug)}`, { method: "POST", body: payload }),

  track: (token: string) =>
    request<CollectUkBookingTrackingInfo>(`/api/v1/collect-uk/tracking/${encodeURIComponent(token)}`),

  cancel: (token: string) =>
    request<{ reference: string | null; status: string }>(
      `/api/v1/collect-uk/tracking/${encodeURIComponent(token)}/cancel`,
      { method: "POST" },
    ),
};

export interface CollectUkShipmentTrackingMilestone {
  id: string;
  stage: string;
  location: string | null;
  note: string | null;
  pickupAddress: string | null;
  pickupFrom: string | null;
  pickupTo: string | null;
  createdAt: string;
}

export interface CollectUkShipmentTrackingInfo {
  reference: string;
  destinationCountry: string | null;
  companyName: string;
  companyLogoUrl: string | null;
  status: CollectUkShipmentStatus;
  customerName: string;
  milestones: CollectUkShipmentTrackingMilestone[];
}

// Public and unauthenticated -- the signed recipient token in the link is
// the only thing gating access, same as booking tracking.
export const collectUkShipmentTracking = {
  track: (token: string) =>
    request<CollectUkShipmentTrackingInfo>(`/api/v1/collect-uk/shipment-tracking/${encodeURIComponent(token)}`),
};

export interface CollectUkDriverProfile {
  id: string;
  userId: string;
  vehicleReference: string | null;
  capacityParcels: number;
  status: "APPLIED" | "REJECTED" | "ACTIVE" | "INACTIVE";
  fullName: string | null;
  county: string | null;
  reviewNotes: string | null;
}

export interface DriverVehiclePayload {
  makeModel: string;
  registrationPlate: string;
  capacityParcels?: number;
  photoUrl: string;
}

export interface DriverApplicationPayload {
  fullName: string;
  phone: string;
  basePostcode: string;
  county: string;
  drivingLicenceUrl: string;
  motorInsuranceUrl: string;
  motUrl: string;
  gitInsuranceUrl?: string;
  liabilityUrl?: string;
  vehicles: DriverVehiclePayload[];
}

export interface CollectUkDriverRoute {
  id: string;
  routeDate: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED";
}

export interface CollectUkDriverStop {
  id: string;
  sequenceOrder: number;
  status: "PENDING" | "COLLECTED" | "UNABLE_TO_COLLECT";
  bookingId: string;
  distanceFromPreviousMiles: number | null;
  bookingReference: string | null;
  companyName: string;
  customerName: string;
  customerContact: string;
  collectionAddress: string;
  collectionPostcode: string;
  destinationCountry: string;
  parcelSizeTier: ParcelSizeTier;
  numberOfParcels: number;
  itemTypes: CollectUkItemType[];
  itemTypeOther: string | null;
  vehicleType: CollectUkVehicleType | null;
  specialInstructions: string | null;
}

export interface CollectUkDriverRouteDetail extends CollectUkDriverRoute {
  totalDistanceMiles: number | null;
  stops: CollectUkDriverStop[];
}

export const collectUkDriverPortal = {
  me: () => request<CollectUkDriverProfile | null>("/api/v1/collect-uk/driver/me", { auth: true }),

  apply: (payload: DriverApplicationPayload) =>
    request<{ id: string; status: string }>("/api/v1/collect-uk/driver/apply", { method: "POST", body: payload, auth: true }),

  getApplyUploadParams: () =>
    request<CloudinarySignedUpload>("/api/v1/collect-uk/driver/apply/upload-params", { auth: true }),

  listRoutes: () => request<CollectUkDriverRoute[]>("/api/v1/collect-uk/driver/routes", { auth: true }),

  getRoute: (id: string) => request<CollectUkDriverRouteDetail>(`/api/v1/collect-uk/driver/routes/${id}`, { auth: true }),

  getEvidenceUploadParams: () =>
    request<CloudinarySignedUpload>("/api/v1/collect-uk/driver/evidence-upload-params", { auth: true }),

  collectStop: (stopId: string, payload: { proofPhotoUrl?: string; signatureUrl?: string }) =>
    request<{ id: string; status: string }>(`/api/v1/collect-uk/driver/stops/${stopId}/collect`, {
      method: "POST",
      body: payload,
      auth: true,
    }),

  unableToCollectStop: (stopId: string, failureReason: string) =>
    request<{ id: string; status: string }>(`/api/v1/collect-uk/driver/stops/${stopId}/unable-to-collect`, {
      method: "POST",
      body: { failureReason },
      auth: true,
    }),
};

export interface CollectUkUnscheduledBooking {
  id: string;
  reference: string | null;
  companyName: string;
  customerName: string;
  collectionAddress: string;
  collectionPostcode: string;
  preferredDate: string | null;
  collectionWindow: CollectUkWindowRange | null;
  parcelSizeTier: ParcelSizeTier;
  numberOfParcels: number;
  itemTypes: CollectUkItemType[];
  itemTypeOther: string | null;
  vehicleType: CollectUkVehicleType | null;
}

export interface CollectUkDriverApplication {
  id: string;
  fullName: string | null;
  phone: string | null;
  county: string | null;
  basePostcode: string | null;
  appliedAt: string | null;
  vehicles: {
    makeModel: string;
    registrationPlate: string;
    capacityParcels: number;
    photo: string | null;
  }[];
  documents: {
    drivingLicence: string | null;
    motorInsurance: string | null;
    gitInsurance: string | null;
    liability: string | null;
  };
}

export interface CollectUkAdminCompanyBookings {
  company: { id: string; name: string; slug: string };
  bookings: {
    id: string;
    reference: string | null;
    status: string;
    customerName: string;
    customerContact: string;
    collectionAddress: string;
    collectionPostcode: string;
    parcelSizeTier: ParcelSizeTier;
    numberOfParcels: number;
    itemTypes: CollectUkItemType[];
    itemTypeOther: string | null;
    vehicleType: CollectUkVehicleType | null;
    collectionWindow: CollectUkWindowRange | null;
    chargePence: number | null;
    createdAt: string;
  }[];
}

export interface CollectUkAdminCompany {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  rate: CollectUkRate | null;
}

export interface CollectUkFailedBooking {
  id: string;
  reference: string | null;
  companyName: string;
  customerName: string;
  collectionAddress: string;
  collectionPostcode: string;
  failureReason: string | null;
  failedAt: string | null;
}

export interface CollectUkAdminDriver {
  id: string;
  userId: string;
  vehicleReference: string | null;
  capacityParcels: number;
  status: "ACTIVE" | "INACTIVE";
}

export interface CollectUkAdminRouteSummary {
  id: string;
  routeDate: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED";
  totalDistanceMiles: number | null;
  driverId: string;
  driverVehicleReference: string | null;
  stopCount: number;
  pendingStopCount: number;
}

export interface CollectUkAdminRouteStop {
  id: string;
  sequenceOrder: number;
  status: "PENDING" | "COLLECTED" | "UNABLE_TO_COLLECT";
  bookingId: string;
  bookingReference: string | null;
  companyName: string;
  customerName: string;
  collectionAddress: string;
  collectionPostcode: string;
  distanceFromPreviousMiles: number | null;
}

export interface CollectUkAdminRouteDetail {
  id: string;
  driverId: string;
  routeDate: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED";
  totalDistanceMiles: number | null;
  stops: CollectUkAdminRouteStop[];
}

// Faira-internal dispatch tooling, authenticated with the shared
// ADMIN_TOKEN (entered on the dispatch page) rather than a user session.
export interface CollectUkAdminOverview {
  companies: { total: number; active: number };
  drivers: { active: number; pendingApplications: number };
  bookings: { total: number; thisWeek: number; unscheduled: number };
  collectionsCompleted: number;
  handedOver: number;
  revenueBilledPence: number;
  weeklyBookings: { weekStart: string; count: number }[];
}

export const collectUkDispatch = {
  getOverview: (adminToken: string) =>
    request<CollectUkAdminOverview>("/api/v1/admin/collect-uk/overview", { adminToken }),

  listUnscheduled: (adminToken: string) =>
    request<CollectUkUnscheduledBooking[]>("/api/v1/admin/collect-uk/bookings/unscheduled", { adminToken }),

  listDrivers: (adminToken: string) => request<CollectUkAdminDriver[]>("/api/v1/admin/collect-uk/drivers", { adminToken }),

  createDriver: (adminToken: string, payload: { userId: string; vehicleReference?: string; capacityParcels?: number }) =>
    request<CollectUkAdminDriver>("/api/v1/admin/collect-uk/drivers", { method: "POST", body: payload, adminToken }),

  listRoutes: (adminToken: string) => request<CollectUkAdminRouteSummary[]>("/api/v1/admin/collect-uk/routes", { adminToken }),

  createRoute: (adminToken: string, payload: { driverId: string; routeDate: string }) =>
    request<{ id: string }>("/api/v1/admin/collect-uk/routes", { method: "POST", body: payload, adminToken }),

  getRoute: (adminToken: string, id: string) =>
    request<CollectUkAdminRouteDetail>(`/api/v1/admin/collect-uk/routes/${id}`, { adminToken }),

  assignStop: (adminToken: string, routeId: string, bookingId: string) =>
    request<{ id: string }>(`/api/v1/admin/collect-uk/routes/${routeId}/stops`, {
      method: "POST",
      body: { bookingId },
      adminToken,
    }),

  listCompanies: (adminToken: string) =>
    request<CollectUkAdminCompany[]>("/api/v1/admin/collect-uk/companies", { adminToken }),

  setCompanyRate: (adminToken: string, companyId: string, rate: CollectUkRate) =>
    request<CollectUkRate & { companyId: string }>(`/api/v1/admin/collect-uk/companies/${companyId}/rate`, {
      method: "PUT",
      body: rate,
      adminToken,
    }),

  listDriverApplications: (adminToken: string) =>
    request<CollectUkDriverApplication[]>("/api/v1/admin/collect-uk/driver-applications", { adminToken }),

  approveDriver: (adminToken: string, driverId: string) =>
    request<{ id: string; status: string }>(`/api/v1/admin/collect-uk/drivers/${driverId}/approve`, {
      method: "POST",
      adminToken,
    }),

  rejectDriver: (adminToken: string, driverId: string, reviewNotes: string) =>
    request<{ id: string; status: string }>(`/api/v1/admin/collect-uk/drivers/${driverId}/reject`, {
      method: "POST",
      body: { reviewNotes },
      adminToken,
    }),

  getCompanyBookings: (adminToken: string, companyId: string) =>
    request<CollectUkAdminCompanyBookings>(`/api/v1/admin/collect-uk/companies/${companyId}/bookings`, { adminToken }),

  listFailed: (adminToken: string) =>
    request<CollectUkFailedBooking[]>("/api/v1/admin/collect-uk/bookings/failed", { adminToken }),

  requeueBooking: (adminToken: string, bookingId: string) =>
    request<{ id: string; status: string }>(`/api/v1/admin/collect-uk/bookings/${bookingId}/requeue`, {
      method: "POST",
      adminToken,
    }),

  optimiseRoute: (adminToken: string, routeId: string, startPostcode?: string) =>
    request<CollectUkAdminRouteDetail>(`/api/v1/admin/collect-uk/routes/${routeId}/optimise`, {
      method: "POST",
      body: startPostcode ? { startPostcode } : {},
      adminToken,
    }),
};

export { ApiError as FulfilmentApiError };

// ---------------------------------------------------------------------------
// Faira Market — the consumer auto-parts storefront (public browse + detail).
// Buying/garage/watchlist are auth-gated and come in a later slice.
// ---------------------------------------------------------------------------

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
