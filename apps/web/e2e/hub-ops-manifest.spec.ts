import fs from "fs";
import path from "path";
import { test, expect, APIRequestContext } from "@playwright/test";

// Same setup shape as the other hub-ops specs: no self-serve signup for
// hub/ops staff, so this provisions throwaway staff via the admin API.
// Skipped unless E2E_ADMIN_TOKEN is set.
const API_URL = "https://api-staging-9878.up.railway.app";
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

test.describe("hub-ops dispatch manifest workflow", () => {
  test.skip(!ADMIN_TOKEN, "E2E_ADMIN_TOKEN not set -- this spec provisions real staff via the admin API");

  test("hub supervisor can assign a sealed parcel to a run and finalize the manifest", async ({ page, request }) => {
    const uniqueId = Date.now();

    // --- Seller creates and confirms a shipment (buyer pays -> AWAITING_DROPOFF) ---
    const sellerEmail = `e2e-manifest-seller-${uniqueId}@faira-test.dev`;
    await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email: sellerEmail, password: PASSWORD } });
    const sellerToken = await signIn(request, sellerEmail, PASSWORD);

    const hubsRes = await request.get(`${API_URL}/api/v1/fulfilment/hubs`, { headers: { Authorization: `Bearer ${sellerToken}` } });
    const hubs = (await hubsRes.json()).data as { id: string; city: string }[];
    const harare = hubs.find(h => h.city === "Harare")!;
    const bulawayo = hubs.find(h => h.city === "Bulawayo")!;

    await request.patch(`${API_URL}/api/v1/fulfilment/sellers/me/onboarding`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
      data: {
        fullName: "E2E Manifest Seller",
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
    expect(confirmed.status).toBe("AWAITING_DROPOFF");

    // --- Provision one staff member with both HUB_AGENT and HUB_SUPERVISOR at Harare ---
    const staffEmail = `e2e-manifest-staff-${uniqueId}@faira-test.dev`;
    const staffSignupRes = await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email: staffEmail, password: PASSWORD } });
    const staffId = (await staffSignupRes.json()).data.id;
    const staffToken = await signIn(request, staffEmail, PASSWORD);
    await request.get(`${API_URL}/api/v1/fulfilment/hubs`, { headers: { Authorization: `Bearer ${staffToken}` } });

    await request.post(`${API_URL}/api/v1/fulfilment/user-roles`, {
      headers: { "x-admin-token": ADMIN_TOKEN! },
      data: { userId: staffId, role: "HUB_AGENT", hubId: harare.id },
    });
    await request.post(`${API_URL}/api/v1/fulfilment/user-roles`, {
      headers: { "x-admin-token": ADMIN_TOKEN! },
      data: { userId: staffId, role: "HUB_SUPERVISOR", hubId: harare.id },
    });

    // --- Accept, inspect, and seal via the API (each already covered by their own e2e specs) ---
    await request.post(`${API_URL}/api/v1/fulfilment/hub-ops/shipments/${shipment.id}/accept-dropoff`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    const uploadParamsRes = await request.get(`${API_URL}/api/v1/fulfilment/hub-ops/evidence-upload-params`, {
      headers: { Authorization: `Bearer ${staffToken}` },
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
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { weightKg: 1.5, dimensions: "20x15x10cm", condition: "GOOD", photoPublicIds: [publicId] },
    });
    await request.post(`${API_URL}/api/v1/fulfilment/hub-ops/shipments/${shipment.id}/seal`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { sealNumber: `SEAL-E2E-${uniqueId}` },
    });

    // --- Provision an ops admin and schedule a run on the existing pilot route ---
    const adminEmail = `e2e-manifest-opsadmin-${uniqueId}@faira-test.dev`;
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

    const departure = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // a week out, safely in the future
    const arrival = new Date(departure.getTime() + 6 * 60 * 60 * 1000);
    await request.post(`${API_URL}/api/v1/fulfilment/transport/runs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        routeId: pilotRoute.id,
        scheduledDeparture: departure.toISOString(),
        scheduledArrival: arrival.toISOString(),
        vehicleReference: `E2E-${uniqueId}`,
      },
    });

    // --- Drive the actual manifest UI as the hub supervisor ---
    await page.goto("/login");
    await page.getByLabel("Email address").fill(staffEmail);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/hub-ops/manifest");
    await page.getByRole("combobox").click();
    // Match on the vehicle reference specifically -- the route/date label
    // alone is ambiguous across repeated test runs sharing the pilot route.
    await page.getByRole("option", { name: new RegExp(`E2E-${uniqueId}`) }).click();
    await page.getByRole("button", { name: "Open manifest" }).click();

    await expect(page.getByText("No parcels assigned yet.")).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Add a sealed parcel by reference").fill(confirmed.reference);
    await page.getByRole("button", { name: "Add to manifest" }).click();

    await expect(page.getByText(confirmed.reference).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Finalize manifest" }).click();
    await expect(page.getByText("FINALIZED", { exact: true })).toBeVisible({ timeout: 15_000 });

    const [documentPage] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "View manifest document" }).click(),
    ]);
    await documentPage.waitForLoadState();
    const documentText = await documentPage.locator("body").innerText();
    expect(documentText).toContain(confirmed.reference);
  });
});
