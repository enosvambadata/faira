import { test, expect } from "@playwright/test";

// No admin token needed -- company registration and booking are both
// self-serve/guest, unlike Fulfilment's hub-staff personas.
test.describe("Faira Collect UK guest booking", () => {
  test("a customer can book a collection via a company's link and track it; the company sees it on their dashboard", async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const uniqueId = Date.now();
    const email = `e2e-collect-uk-booking-${uniqueId}@faira-test.dev`;
    const password = "e2eTestPassword123";
    const companyName = `E2E Booking Logistics ${uniqueId}`;

    // --- Company admin registers and adds a warehouse ---
    await request.post("https://api-staging-9878.up.railway.app/api/v1/auth/signup", {
      data: { email, password },
    });

    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/collect-uk/register");
    await page.getByLabel("Company name").fill(companyName);
    await page.getByLabel("Countries served").fill("Zimbabwe, Zambia");
    await page.getByRole("button", { name: "Register company" }).click();
    await page.waitForURL(/\/collect-uk\/companies\/.+/, { timeout: 15_000 });

    const companySlug = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

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

    // --- Customer (same browser tab -- booking is public, no auth needed) books a collection ---
    await page.goto(`/collect-uk/book/${companySlug}`);
    await expect(page.getByRole("heading", { name: `Book a collection with ${companyName}` })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Your name").fill("Jane Customer");
    await page.getByLabel("Contact number or email").fill("+447700900000");
    await page.getByLabel("Destination country").click();
    await page.getByRole("option", { name: "Zimbabwe" }).click();
    await page.getByLabel("Collection address").fill("10 Customer Street");
    await page.getByLabel("Postcode").fill("SW1A 1AA");
    await page.getByLabel("Parcel size").click();
    await page.getByRole("option", { name: "Medium (microwave)" }).click();
    await page.getByRole("checkbox", { name: "Drum(s)" }).click();
    await page.getByRole("button", { name: "Book collection" }).click();

    await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible({ timeout: 15_000 });
    const referenceText = await page.locator("p.font-mono").textContent();
    expect(referenceText).toMatch(new RegExp(`FC-${companySlug}-\\d{6}`));

    const trackingLink = await page.getByRole("link", { name: /\/collect-uk\/track\// }).getAttribute("href");
    expect(trackingLink).toBeTruthy();

    // --- Customer follows the tracking link ---
    await page.goto(trackingLink!);
    // Full label, not a substring -- the tracking page's progress timeline
    // also contains a "Booking received" step name.
    await expect(page.getByText("Booking received -- awaiting scheduling")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(companyName)).toBeVisible();
    await expect(page.getByText("Zimbabwe")).toBeVisible();

    // --- Company admin sees the booking on their dashboard ---
    await page.goto("/collect-uk");
    await page.getByRole("link", { name: new RegExp(companyName) }).click();
    // Bookings live on their own tab since the page-per-function split.
    await page.getByRole("link", { name: "Bookings" }).click();
    await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Jane Customer")).toBeVisible();
  });
});
