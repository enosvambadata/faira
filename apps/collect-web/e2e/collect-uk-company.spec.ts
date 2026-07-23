import { test, expect } from "@playwright/test";

// No admin token needed -- company registration is self-serve (unlike
// Fulfilment's hub-staff personas, which require admin-assigned roles).
test.describe("Faira Collect UK company portal", () => {
  test("a new user can register a company, view its profile, and add a warehouse", async ({ page, request }) => {
    test.setTimeout(120_000);
    const uniqueId = Date.now();
    const email = `e2e-collect-uk-company-${uniqueId}@faira-test.dev`;
    const password = "e2eTestPassword123";

    await request.post("https://api-staging-9878.up.railway.app/api/v1/auth/signup", {
      data: { email, password },
    });

    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/collect-uk/, { timeout: 15_000 });

    await page.goto("/collect-uk");
    await expect(page.getByText("You aren't part of any company yet.")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: "Register a company" }).click();
    await page.waitForURL(/\/collect-uk\/register/);
    await page.getByLabel("Company name").fill(`E2E Logistics ${uniqueId}`);
    await page.getByLabel("Countries served").fill("Zimbabwe, Zambia");
    await page.getByRole("button", { name: "Register company" }).click();

    await page.waitForURL(/\/collect-uk\/companies\/.+/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: `E2E Logistics ${uniqueId}` })).toBeVisible();
    await expect(page.getByText("Admin").first()).toBeVisible();

    // Warehouses live on their own tab since the page-per-function split.
    await page.getByRole("link", { name: "Warehouses" }).click();
    await page.waitForURL(/\/collect-uk\/companies\/.+\/warehouses/);
    await page.getByLabel("Warehouse name").fill("Main Depot");
    await page.getByLabel("Address").fill("1 Test Road");
    await page.getByLabel("City").fill("London");
    await page.getByLabel("Postcode").fill("E1 6AN");
    await page.getByLabel("Opening hours").fill("Mon-Fri 9am-5pm");
    await page.getByRole("button", { name: "Add warehouse" }).click();

    await expect(page.getByText("Main Depot")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("1 Test Road, London E1 6AN")).toBeVisible();
  });
});
