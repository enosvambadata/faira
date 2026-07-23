import path from "path";
import { test, expect, APIRequestContext } from "@playwright/test";

// Same setup shape as hub-ops-dropoff.spec.ts: no self-serve signup for hub
// staff, so this provisions a throwaway HUB_AGENT via the admin API.
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

test.describe("hub-ops inspect and seal workflow", () => {
  test.skip(!ADMIN_TOKEN, "E2E_ADMIN_TOKEN not set -- this spec provisions a real HUB_AGENT via the admin API");

  test("hub agent can inspect and seal a received parcel", async ({ page, request }) => {
    const uniqueId = Date.now();

    // --- Set up a shipment already RECEIVED_AT_ORIGIN (API-only) ---
    const sellerEmail = `e2e-hubops-inspect-seller-${uniqueId}@faira-test.dev`;
    await request.post(`${API_URL}/api/v1/auth/signup`, { data: { email: sellerEmail, password: PASSWORD } });
    const sellerToken = await signIn(request, sellerEmail, PASSWORD);

    const hubsRes = await request.get(`${API_URL}/api/v1/fulfilment/hubs`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const hubs = (await hubsRes.json()).data as { id: string; city: string }[];
    const harare = hubs.find(h => h.city === "Harare")!;
    const bulawayo = hubs.find(h => h.city === "Bulawayo")!;

    await request.patch(`${API_URL}/api/v1/fulfilment/sellers/me/onboarding`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
      data: {
        fullName: "E2E Hub Ops Inspect Seller",
        mobileNumber: "+263771234567",
        sellerType: "INDIVIDUAL",
        city: "Harare",
        preferredHubId: harare.id,
        agreeToTerms: true,
      },
    });
    await request.post(`${API_URL}/api/v1/fulfilment/sellers/me/onboarding/submit`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });

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

    // --- Provision a throwaway hub agent, assigned to the Harare hub ---
    const agentEmail = `e2e-hubops-inspect-agent-${uniqueId}@faira-test.dev`;
    const agentSignupRes = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { email: agentEmail, password: PASSWORD },
    });
    const agentId = (await agentSignupRes.json()).data.id;
    const agentToken = await signIn(request, agentEmail, PASSWORD);
    await request.get(`${API_URL}/api/v1/fulfilment/hubs`, { headers: { Authorization: `Bearer ${agentToken}` } });

    await request.post(`${API_URL}/api/v1/fulfilment/user-roles`, {
      headers: { "x-admin-token": ADMIN_TOKEN! },
      data: { userId: agentId, role: "HUB_AGENT", hubId: harare.id },
    });

    // Accept the drop-off via API so this spec focuses on inspect/seal, not
    // the accept flow already covered by hub-ops-dropoff.spec.ts.
    const acceptRes = await request.post(`${API_URL}/api/v1/fulfilment/hub-ops/shipments/${shipment.id}/accept-dropoff`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    expect((await acceptRes.json()).data.status).toBe("RECEIVED_AT_ORIGIN");

    // --- Drive the actual inspect/seal UI as the hub agent ---
    await page.goto("/login");
    await page.getByLabel("Email address").fill(agentEmail);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/hub-ops/inspect");
    await page.getByLabel("Shipment reference").fill(confirmed.reference);
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText(confirmed.reference)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Weight (kg)").fill("2.5");
    await page.getByLabel("Dimensions").fill("30x20x10cm");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: /Good/ }).click();

    await page.getByLabel("Add a photo").setInputFiles(TEST_PHOTO_PATH);
    await expect(page.getByText("Uploaded")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Record inspection" }).click();
    await expect(page.getByText("Apply seal")).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Seal number").fill("SEAL-E2E-000001");
    await page.getByRole("button", { name: "Seal parcel" }).click();

    await expect(page.getByText("This parcel is sealed and ready for dispatch.")).toBeVisible({ timeout: 15_000 });

    const [labelPage] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "Print label" }).click(),
    ]);
    await labelPage.waitForLoadState();
    expect(labelPage.url()).toMatch(/^blob:/);
    const svgContent = await labelPage.locator("svg").innerHTML();
    expect(svgContent).toContain(confirmed.reference);
  });
});
