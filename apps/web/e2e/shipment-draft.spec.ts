import { test, expect } from "@playwright/test";

// Extends the registration journey through to creating a shipment draft --
// same caveat as registration.spec.ts: creates real throwaway staging
// data with no automated cleanup yet.
test("verified-limit seller can create a shipment draft after registering", async ({ page }) => {
  const uniqueEmail = `e2e-shipment-${Date.now()}@faira-test.dev`;

  await page.goto("/signup");
  await page.getByLabel("Email address").fill(uniqueEmail);
  const passwordInputs = page.locator('input[type="password"]');
  await passwordInputs.nth(0).fill("e2eTestPassword123");
  await passwordInputs.nth(1).fill("e2eTestPassword123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });

  await page.getByLabel("Full name").fill("E2E Shipment Seller");
  await page.getByLabel("Mobile number").fill("+263771234567");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByText("Individual seller").click();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByText("Electronics").click();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByText("No", { exact: true }).click();
  await page.getByLabel("City").fill("Harare");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("combobox").click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByText(/agree to the Faira Fulfilment seller terms/i).click();
  await page.getByRole("button", { name: "Submit registration" }).click();

  await expect(page).toHaveURL(/\/onboarding\/submitted/, { timeout: 15_000 });

  await page.goto("/shipments/new");
  await page.getByLabel("Buyer name").fill("Buyer Example");
  await page.getByLabel("Buyer contact").fill("+263779876543");

  const hubSelects = page.getByRole("combobox");
  await hubSelects.nth(0).click();
  await page.getByRole("option").first().click();
  await hubSelects.nth(1).click();
  await page.getByRole("option").nth(1).click();

  await page.getByLabel("Category").fill("Electronics");
  await page.getByLabel("Declared value (USD)").fill("100");

  await hubSelects.nth(2).click();
  await page.getByRole("option").first().click();

  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/shipments\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByText("DRAFT", { exact: false })).toBeVisible();
  await expect(page.getByText("Buyer Example")).toBeVisible();
});
