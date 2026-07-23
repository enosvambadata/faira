import fs from "fs";
import path from "path";
import { test, expect, APIRequestContext } from "@playwright/test";

// Reuses the same seller->seal->dispatch->arrival chain as
// hub-ops-arrival.spec.ts / tracking.spec.ts to reach READY_FOR_COLLECTION,
// then drives the real /hub-ops/collect UI.
//
// Deliberately does NOT attempt a full happy-path collection in the
// browser: the buyer's 6-digit collection code is only ever delivered by
// SMS and is stored hashed (never in plaintext, by design -- see
// services/collectionCode.ts), so there is no way for a test to legitimately
// recover it without weakening that security property. The successful
// COLLECTED transition, CollectionEvent creation, reuse/expiry/brute-force
// rejection, and the ID-check/supervisor-override gate are instead covered
// by the 17 new backend tests in hubOps.test.ts (including a concurrency
// test). This spec verifies the real UI: shipment lookup, and that an
// incorrect code is rejected with a clear error via the real endpoint.
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

test.describe("hub-ops parcel collection", () => {
  test.skip(!ADMIN_TOKEN, "E2E_ADMIN_TOKEN not set -- this spec provisions real staff via the admin API");

  test("hub agent can look up a ready-for-collection parcel and an incorrect code is rejected", async ({ page, request }) => {
    test.setTimeout(150_000);
    const uniqueId = Date.now();

    const bootstrapEmail = `e2e-collect-bootstrap-${uniqueId}@faira-test.dev`;
    await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email: bootstrapEmail, password: PASSWORD } });
    const bootstrapToken = await signIn(request, bootstrapEmail, PASSWORD);
    const hubsRes = await request.get(`${API_URL}/api/v1/fulfilment/hubs`, { headers: { Authorization: `Bearer ${bootstrapToken}` } });
    const hubs = (await hubsRes.json()).data as { id: string; city: string }[];
    const harare = hubs.find(h => h.city === "Harare")!;
    const bulawayo = hubs.find(h => h.city === "Bulawayo")!;

    // --- Seller creates and confirms a shipment (buyer pays -> AWAITING_DROPOFF) ---
    const sellerEmail = `e2e-collect-seller-${uniqueId}@faira-test.dev`;
    await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email: sellerEmail, password: PASSWORD } });
    const sellerToken = await signIn(request, sellerEmail, PASSWORD);

    await request.patch(`${API_URL}/api/v1/fulfilment/sellers/me/onboarding`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
      data: {
        fullName: "E2E Collect Seller",
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
    const originStaffEmail = `e2e-collect-origin-staff-${uniqueId}@faira-test.dev`;
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
      data: { sealNumber: `SEAL-COLLECT-${uniqueId}` },
    });

    // --- Ops admin schedules a run, origin staff creates+finalizes the manifest, scans it out ---
    const adminEmail = `e2e-collect-opsadmin-${uniqueId}@faira-test.dev`;
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
        vehicleReference: `COLLECT-${uniqueId}`,
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

    // --- Destination-hub staff scans it in (via the API), reaching READY_FOR_COLLECTION ---
    const destStaffEmail = `e2e-collect-dest-staff-${uniqueId}@faira-test.dev`;
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

    // --- Destination-hub staff drives the real collection screen ---
    await page.goto("/login");
    await page.getByLabel("Email address").fill(destStaffEmail);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/hub-ops/collect");
    await page.getByLabel("Shipment reference").fill(confirmed.reference);
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText("Ready for Collection")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Buyer Example")).toBeVisible();

    await page.getByLabel("Collection code").fill("000000");
    await page.getByRole("button", { name: "Confirm collection" }).click();

    await expect(page.getByText("Incorrect collection code")).toBeVisible({ timeout: 15_000 });
  });
});
