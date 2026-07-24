import fs from "fs";
import path from "path";
import { test, expect, APIRequestContext } from "@playwright/test";

// Reuses the same seller->seal->dispatch->arrival chain as
// hub-ops-arrival.spec.ts (that's what actually reaches READY_FOR_COLLECTION
// and generates a tracking-eligible shipment), then drives the public,
// unauthenticated /track/[token] page instead of just checking the toast.
const API_URL = process.env.E2E_API_URL ?? "https://api-staging-9878.up.railway.app";
const SUPABASE_URL = "https://eqjvtugbyjukuvztdyuc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_GTBKG2bIEZIoWsX5w4Rjgg_5qvDCfMQ";
const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN;
const PASSWORD = "e2eTestPassword123";
const TEST_PHOTO_PATH = path.join(__dirname, "fixtures", "test-parcel-photo.png");

async function signIn(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    data: { email, password },
  });
  const json = await res.json();
  return json.access_token as string;
}

test.describe("buyer tracking page", () => {
  test.skip(!ADMIN_TOKEN, "E2E_ADMIN_TOKEN not set -- this spec provisions real staff via the admin API");

  test("buyer can view tracking info via a signed link, with no seller PII exposed", async ({ page, request }) => {
    test.setTimeout(150_000);
    const uniqueId = Date.now();

    const bootstrapEmail = `e2e-tracking-bootstrap-${uniqueId}@faira-test.dev`;
    await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email: bootstrapEmail, password: PASSWORD } });
    const bootstrapToken = await signIn(request, bootstrapEmail, PASSWORD);
    const hubsRes = await request.get(`${API_URL}/api/v1/fulfilment/hubs`, { headers: { Authorization: `Bearer ${bootstrapToken}` } });
    const hubs = (await hubsRes.json()).data as { id: string; city: string }[];
    const harare = hubs.find(h => h.city === "Harare")!;
    const bulawayo = hubs.find(h => h.city === "Bulawayo")!;

    // --- Seller creates and confirms a shipment (buyer pays -> AWAITING_DROPOFF) ---
    const sellerEmail = `e2e-tracking-seller-${uniqueId}@faira-test.dev`;
    await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email: sellerEmail, password: PASSWORD } });
    const sellerToken = await signIn(request, sellerEmail, PASSWORD);

    await request.patch(`${API_URL}/api/v1/fulfilment/sellers/me/onboarding`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
      data: {
        fullName: "E2E Tracking Seller",
        mobileNumber: "+263771234567",
        sellerType: "INDIVIDUAL",
        city: "Harare",
        preferredHubId: harare.id,
        agreeToTerms: true,
      },
    });
    await request.post(`${API_URL}/api/v1/fulfilment/sellers/me/onboarding/submit`, { headers: { Authorization: `Bearer ${sellerToken}` } });

    const shipmentRes = await request.post(`${API_URL}/api/v1/fulfilment/shipments`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
      data: {
        buyerName: "Buyer Example",
        buyerContact: "+263779876543",
        originHubId: harare.id,
        destinationHubId: bulawayo.id,
        category: "Electronics",
        declaredValue: 50,
        sizeTier: "SMALL",
      },
    });
    const shipment = (await shipmentRes.json()).data;

    await request.post(`${API_URL}/api/v1/fulfilment/shipments/${shipment.id}/quote`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
      data: { feePayer: "BUYER" },
    });
    const confirmRes = await request.post(`${API_URL}/api/v1/fulfilment/shipments/${shipment.id}/confirm`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const confirmed = (await confirmRes.json()).data;

    // --- Origin-hub staff: accept, inspect, seal ---
    const originStaffEmail = `e2e-tracking-origin-staff-${uniqueId}@faira-test.dev`;
    const originStaffSignupRes = await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email: originStaffEmail, password: PASSWORD } });
    const originStaffId = (await originStaffSignupRes.json()).data.id;
    const originStaffToken = await signIn(request, originStaffEmail, PASSWORD);
    await request.get(`${API_URL}/api/v1/fulfilment/hubs`, { headers: { Authorization: `Bearer ${originStaffToken}` } });
    await request.post(`${API_URL}/api/v1/fulfilment/user-roles`, {
      headers: { "x-admin-token": ADMIN_TOKEN! },
      data: { userId: originStaffId, role: "HUB_AGENT", hubId: harare.id },
    });
    await request.post(`${API_URL}/api/v1/fulfilment/user-roles`, {
      headers: { "x-admin-token": ADMIN_TOKEN! },
      data: { userId: originStaffId, role: "HUB_SUPERVISOR", hubId: harare.id },
    });

    await request.post(`${API_URL}/api/v1/fulfilment/hub-ops/shipments/${shipment.id}/accept-dropoff`, {
      headers: { Authorization: `Bearer ${originStaffToken}` },
    });
    const uploadParamsRes = await request.get(`${API_URL}/api/v1/fulfilment/hub-ops/evidence-upload-params`, {
      headers: { Authorization: `Bearer ${originStaffToken}` },
    });
    const uploadParams = (await uploadParamsRes.json()).data;
    const cloudinaryRes = await request.post(`https://api.cloudinary.com/v1_1/${uploadParams.cloudName}/image/upload`, {
      multipart: {
        file: { name: "test-parcel-photo.png", mimeType: "image/png", buffer: fs.readFileSync(TEST_PHOTO_PATH) },
        api_key: uploadParams.apiKey,
        timestamp: String(uploadParams.timestamp),
        signature: uploadParams.signature,
        folder: uploadParams.folder,
        transformation: uploadParams.transformation,
        type: uploadParams.type,
      },
    });
    const publicId = (await cloudinaryRes.json()).public_id as string;
    await request.post(`${API_URL}/api/v1/fulfilment/hub-ops/shipments/${shipment.id}/inspect`, {
      headers: { Authorization: `Bearer ${originStaffToken}` },
      data: { weightKg: 1.2, dimensions: "20x15x10cm", condition: "GOOD", photoPublicIds: [publicId] },
    });
    await request.post(`${API_URL}/api/v1/fulfilment/hub-ops/shipments/${shipment.id}/seal`, {
      headers: { Authorization: `Bearer ${originStaffToken}` },
      data: { sealNumber: `SEAL-TRACKING-${uniqueId}` },
    });

    // --- Ops admin schedules a run, origin staff creates+finalizes the manifest, scans it out ---
    const adminEmail = `e2e-tracking-opsadmin-${uniqueId}@faira-test.dev`;
    const adminSignupRes = await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email: adminEmail, password: PASSWORD } });
    const adminId = (await adminSignupRes.json()).data.id;
    const adminToken = await signIn(request, adminEmail, PASSWORD);
    await request.get(`${API_URL}/api/v1/fulfilment/hubs`, { headers: { Authorization: `Bearer ${adminToken}` } });
    await request.post(`${API_URL}/api/v1/fulfilment/user-roles`, {
      headers: { "x-admin-token": ADMIN_TOKEN! },
      data: { userId: adminId, role: "OPERATIONS_ADMIN" },
    });

    const routesRes = await request.get(`${API_URL}/api/v1/fulfilment/transport/routes`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const pilotRoute = (await routesRes.json()).data.find(
      (r: { originHubId: string; destinationHubId: string }) => r.originHubId === harare.id && r.destinationHubId === bulawayo.id,
    );
    const departure = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const arrival = new Date(departure.getTime() + 6 * 60 * 60 * 1000);
    const runRes = await request.post(`${API_URL}/api/v1/fulfilment/transport/runs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        routeId: pilotRoute.id,
        scheduledDeparture: departure.toISOString(),
        scheduledArrival: arrival.toISOString(),
        vehicleReference: `TRACKING-${uniqueId}`,
      },
    });
    const run = (await runRes.json()).data;

    const manifestRes = await request.post(`${API_URL}/api/v1/fulfilment/manifests`, {
      headers: { Authorization: `Bearer ${originStaffToken}` },
      data: { runId: run.id },
    });
    const manifest = (await manifestRes.json()).data;
    await request.post(`${API_URL}/api/v1/fulfilment/manifests/${manifest.id}/parcels`, {
      headers: { Authorization: `Bearer ${originStaffToken}` },
      data: { shipmentId: shipment.id },
    });
    await request.post(`${API_URL}/api/v1/fulfilment/manifests/${manifest.id}/finalize`, {
      headers: { Authorization: `Bearer ${originStaffToken}` },
    });
    await request.post(`${API_URL}/api/v1/fulfilment/manifests/${manifest.id}/scan-out`, {
      headers: { Authorization: `Bearer ${originStaffToken}` },
      data: { reference: confirmed.reference },
    });

    // --- Destination-hub staff scans it in (via the API -- the arrival UI itself is covered by hub-ops-arrival.spec.ts) ---
    const destStaffEmail = `e2e-tracking-dest-staff-${uniqueId}@faira-test.dev`;
    const destStaffSignupRes = await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email: destStaffEmail, password: PASSWORD } });
    const destStaffId = (await destStaffSignupRes.json()).data.id;
    const destStaffToken = await signIn(request, destStaffEmail, PASSWORD);
    await request.get(`${API_URL}/api/v1/fulfilment/hubs`, { headers: { Authorization: `Bearer ${destStaffToken}` } });
    await request.post(`${API_URL}/api/v1/fulfilment/user-roles`, {
      headers: { "x-admin-token": ADMIN_TOKEN! },
      data: { userId: destStaffId, role: "HUB_AGENT", hubId: bulawayo.id },
    });
    await request.post(`${API_URL}/api/v1/fulfilment/manifests/scan-in`, {
      headers: { Authorization: `Bearer ${destStaffToken}` },
      data: { reference: confirmed.reference },
    });

    // --- Seller fetches the buyer's tracking link ---
    const linkRes = await request.get(`${API_URL}/api/v1/fulfilment/shipments/${shipment.id}/tracking-link`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const { token } = (await linkRes.json()).data as { token: string; url: string };

    // --- Buyer (no account, no auth) views the public tracking page ---
    await page.goto(`/track/${token}`);

    await expect(page.getByText("Ready for collection").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(harare.city, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(bulawayo.city, { exact: false }).first()).toBeVisible();
    await expect(page.getByText("ready for collection. Bring your collection code")).toBeVisible();

    const pageContent = await page.content();
    expect(pageContent).not.toContain(confirmed.reference);
    expect(pageContent).not.toContain("E2E Tracking Seller");
    expect(pageContent).not.toContain("+263771234567");
  });
});

// Doesn't need staff provisioning (no ADMIN_TOKEN gate) -- this is just the
// public page rendering its own error state for a garbage token.
test.describe("buyer tracking page -- invalid token", () => {
  test("shows an error for an invalid tracking token", async ({ page }) => {
    await page.goto("/track/not-a-real-token");

    await expect(page.getByText("This tracking link is invalid or has expired.")).toBeVisible({ timeout: 15_000 });
  });
});
