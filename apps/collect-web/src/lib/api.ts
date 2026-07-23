import { request, ApiError } from "@faira/ui";

// Vamba Collect web API client. The HTTP core (request/requestRaw/ApiError/
// auth) and the Supabase browser client live in @faira/ui; this file holds the
// Collect-UK-specific types + methods, plus the shared Cloudinary document
// upload helper the driver portal uses.
export { auth } from "@faira/ui";
export { ApiError };

// --- Cloudinary signed upload (driver documents) ---
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

export type ParcelSizeTier = "SMALL" | "MEDIUM" | "LARGE" | "EXTRA_LARGE";

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

// --- Freight rates, payments, team ---
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


// --- Companies, warehouses, shipments, bookings, tracking, driver portal, dispatch ---
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

