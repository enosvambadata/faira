import { createClient } from "./supabase";

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
  // own signUp) specifically because it creates the account through
  // supabaseAdmin.auth.admin.createUser with email_confirm: true — the same
  // auto-confirmed rule the mobile app's signup already relies on. Login,
  // by contrast, goes straight through the browser Supabase client (see
  // signup/page.tsx and login/page.tsx) so @supabase/ssr's cookie-based
  // session sync stays correct.
  signup: (payload: { email: string; password: string }) =>
    request<{ id: string; email: string | null; phone: string | null }>("/api/v1/auth/signup", {
      method: "POST",
      body: payload,
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
  transformation: string;
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
  formData.append("transformation", upload.transformation);
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

export { ApiError as FulfilmentApiError };
