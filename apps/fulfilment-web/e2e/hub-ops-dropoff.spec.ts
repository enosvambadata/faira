import { test, expect, APIRequestContext } from "@playwright/test";

// Unlike the seller-facing specs, there's no self-serve signup path for hub
// staff -- provisioning a HUB_AGENT requires the admin-gated
// POST /fulfilment/user-roles endpoint. This spec is skipped unless
// E2E_ADMIN_TOKEN is set, so it stays runnable in environments (CI) that
// don't have that secret, without silently faking coverage.
const API_URL = process.env.E2E_API_URL ?? "https://api-staging-9878.up.railway.app";
const SUPABASE_URL = "https://eqjvtugbyjukuvztdyuc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_GTBKG2bIEZIoWsX5w4Rjgg_5qvDCfMQ";
const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN;
const PASSWORD = "e2eTestPassword123";

async function signIn(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    data: { email, password },
  });
  const json = await res.json();
  return json.access_token as string;
}

test.describe("hub-ops drop-off workflow", () => {
  test.skip(!ADMIN_TOKEN, "E2E_ADMIN_TOKEN not set -- this spec provisions a real HUB_AGENT via the admin API");

  test("hub agent can accept a seller's drop-off by scanning its reference", async ({ page, request }) => {
    const uniqueId = Date.now();

    // --- Set up a confirmed, AWAITING_DROPOFF shipment as a throwaway seller (API-only) ---
    const sellerEmail = `e2e-hubops-seller-${uniqueId}@faira-test.dev`;
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
        fullName: "E2E Hub Ops Seller",
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
    expect(confirmed.status).toBe("AWAITING_DROPOFF");

    // --- Provision a throwaway hub agent, assigned to the Harare hub ---
    const agentEmail = `e2e-hubops-agent-${uniqueId}@faira-test.dev`;
    const agentSignupRes = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { email: agentEmail, password: PASSWORD },
    });
    const agentId = (await agentSignupRes.json()).data.id;

    const agentToken = await signIn(request, agentEmail, PASSWORD);
    // First authenticated call provisions the User row (requireAuth upsert)
    // that the role-assignment endpoint requires to already exist.
    await request.get(`${API_URL}/api/v1/fulfilment/hubs`, { headers: { Authorization: `Bearer ${agentToken}` } });

    const roleRes = await request.post(`${API_URL}/api/v1/fulfilment/user-roles`, {
      headers: { "x-admin-token": ADMIN_TOKEN! },
      data: { userId: agentId, role: "HUB_AGENT", hubId: harare.id },
    });
    expect(roleRes.ok()).toBeTruthy();

    // --- Drive the actual hub-ops UI as the newly-provisioned agent ---
    await page.goto("/login");
    await page.getByLabel("Email address").fill(agentEmail);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Login redirects to /dashboard on success -- wait for that redirect to
    // actually land (and the session cookie to be set) before navigating
    // away, otherwise proxy.ts's auth check bounces the next goto back here.
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/hub-ops/dropoff");
    await page.getByLabel("Shipment reference").fill(confirmed.reference);
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText(confirmed.reference)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Accept drop-off" }).click();

    // Radix Toast renders both the visible toast and a duplicate aria-live
    // announcer with the same text -- .first() is enough to prove the
    // success toast fired.
    await expect(page.getByText(/accepted/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
