import { test, expect } from "@playwright/test";

// Extends the shipment draft journey through confirming a delivery quote --
// same caveat as registration.spec.ts: creates real throwaway staging data
// with no automated cleanup yet.
test("seller can confirm a delivery quote and choose who pays", async ({ page }) => {
  const uniqueEmail = `e2e-quote-${Date.now()}@faira-test.dev`;

  await page.goto("/signup");
  await page.getByLabel("Email address").fill(uniqueEmail);
  const passwordInputs = page.locator('input[type="password"]');
  await passwordInputs.nth(0).fill("e2eTestPassword123");
  await passwordInputs.nth(1).fill("e2eTestPassword123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });

  await page.getByLabel("Full name").fill("E2E Quote Seller");
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

  await expect(page.getByText("Delivery fee")).toBeVisible();
  await expect(page.getByText(/^\$\d+(\.\d{2})?$/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("radio", { name: /^Buyer pays/ }).click();
  await page.getByRole("button", { name: "Confirm delivery fee" }).click();

  const paidByRow = page.getByText("Paid by").locator("..");
  await expect(paidByRow).toBeVisible({ timeout: 15_000 });
  await expect(paidByRow.getByText("Buyer", { exact: true })).toBeVisible();
});
