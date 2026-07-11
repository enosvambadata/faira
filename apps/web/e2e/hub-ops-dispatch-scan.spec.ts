import fs from "fs";
import path from "path";
import { test, expect, APIRequestContext } from "@playwright/test";

// Same setup shape as the other hub-ops specs. Skipped unless
// E2E_ADMIN_TOKEN is set. Manifest creation/add/finalize (already covered
// by hub-ops-manifest.spec.ts) is done via the API here so this spec can
// focus its browser-driven portion on the actual scan-out/short-ship UI.
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

async function createSealedShipment(
  request: APIRequestContext,
  emailPrefix: string,
  harare: { id: string },
  bulawayo: { id: string },
): Promise<{ id: string; reference: string }> {
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@faira-test.dev`;
  await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email, password: PASSWORD } });
  const token = await signIn(request, email, PASSWORD);

  await request.patch(`${API_URL}/api/v1/fulfilment/sellers/me/onboarding`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      fullName: "E2E Dispatch Seller",
      mobileNumber: "+263771234567",
      sellerType: "INDIVIDUAL",
      city: "Harare",
      preferredHubId: harare.id,
      agreeToTerms: true,
    },
  });
  await request.post(`${API_URL}/api/v1/fulfilment/sellers/me/onboarding/submit`, { headers: { Authorization: `Bearer ${token}` } });

  const shipmentRes = await request.post(`${API_URL}/api/v1/fulfilment/shipments`, {
    headers: { Authorization: `Bearer ${token}` },
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
    headers: { Authorization: `Bearer ${token}` },
    data: { feePayer: "BUYER" },
  });
  const confirmRes = await request.post(`${API_URL}/api/v1/fulfilment/shipments/${shipment.id}/confirm`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const confirmed = (await confirmRes.json()).data;

  return { id: shipment.id, reference: confirmed.reference };
}

test.describe("hub-ops origin-hub dispatch scanning", () => {
  test.skip(!ADMIN_TOKEN, "E2E_ADMIN_TOKEN not set -- this spec provisions real staff via the admin API");

  test("hub agent can scan a parcel out and short-ship another, departing the run once both are accounted for", async ({
    page,
    request,
  }) => {
    // This spec sets up two full seller->seal cycles plus manifest
    // creation before ever touching the browser -- comfortably past the
    // 60s default given real network round trips to staging + Cloudinary.
    test.setTimeout(150_000);
    const uniqueId = Date.now();

    // Bootstrap account purely to read the hub list.
    const bootstrapEmail = `e2e-dispatch-bootstrap-${uniqueId}@faira-test.dev`;
    await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email: bootstrapEmail, password: PASSWORD } });
    const bootstrapToken = await signIn(request, bootstrapEmail, PASSWORD);
    const hubsRes = await request.get(`${API_URL}/api/v1/fulfilment/hubs`, { headers: { Authorization: `Bearer ${bootstrapToken}` } });
    const hubs = (await hubsRes.json()).data as { id: string; city: string }[];
    const harare = hubs.find(h => h.city === "Harare")!;
    const bulawayo = hubs.find(h => h.city === "Bulawayo")!;

    // --- Two sealed shipments: one will be scanned out, one short-shipped ---
    const toScan = await createSealedShipment(request, "e2e-dispatch-scan-seller", harare, bulawayo);
    const toShortShip = await createSealedShipment(request, "e2e-dispatch-short-seller", harare, bulawayo);

    // --- Staff member with HUB_AGENT + HUB_SUPERVISOR at Harare ---
    const staffEmail = `e2e-dispatch-staff-${uniqueId}@faira-test.dev`;
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

    for (const shipmentInfo of [toScan, toShortShip]) {
      await request.post(`${API_URL}/api/v1/fulfilment/hub-ops/shipments/${shipmentInfo.id}/accept-dropoff`, {
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
      await request.post(`${API_URL}/api/v1/fulfilment/hub-ops/shipments/${shipmentInfo.id}/inspect`, {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { weightKg: 1.2, dimensions: "20x15x10cm", condition: "GOOD", photoPublicIds: [publicId] },
      });
      await request.post(`${API_URL}/api/v1/fulfilment/hub-ops/shipments/${shipmentInfo.id}/seal`, {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { sealNumber: `SEAL-DISPATCH-${uniqueId}-${shipmentInfo.reference}` },
      });
    }

    // --- Ops admin schedules a run, staff creates+finalizes the manifest with both parcels ---
    const adminEmail = `e2e-dispatch-opsadmin-${uniqueId}@faira-test.dev`;
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
        vehicleReference: `DISPATCH-${uniqueId}`,
      },
    });
    const run = (await runRes.json()).data;

    const manifestRes = await request.post(`${API_URL}/api/v1/fulfilment/manifests`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { runId: run.id },
    });
    const manifest = (await manifestRes.json()).data;

    for (const shipmentInfo of [toScan, toShortShip]) {
      await request.post(`${API_URL}/api/v1/fulfilment/manifests/${manifest.id}/parcels`, {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { shipmentId: shipmentInfo.id },
      });
    }
    await request.post(`${API_URL}/api/v1/fulfilment/manifests/${manifest.id}/finalize`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    // --- Drive the actual scan-out UI as the hub agent ---
    await page.goto("/login");
    await page.getByLabel("Email address").fill(staffEmail);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto(`/hub-ops/manifest`);
    // Re-selecting the same run re-opens the existing (now finalized) manifest.
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: new RegExp(`DISPATCH-${uniqueId}`) }).click();
    await page.getByRole("button", { name: "Open manifest" }).click();

    await expect(page.getByText(toScan.reference).first()).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Parcel reference").fill(toScan.reference);
    await page.getByRole("button", { name: "Scan out" }).click();
    await expect(page.getByText("Scanned out")).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Parcel reference").fill(toShortShip.reference);
    await page.getByRole("button", { name: "Mark short-shipped" }).click();
    await page.getByLabel("Reason").fill("Not found at the hub during dispatch prep");
    await page.getByRole("button", { name: "Confirm short-shipment" }).click();

    await expect(page.getByText("Short-shipped")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/run marked as departed/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
