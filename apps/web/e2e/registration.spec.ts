import { test, expect } from "@playwright/test";

// Exercises the real staging API end to end (create account -> complete
// the onboarding wizard -> land on the confirmation screen) rather than
// mocking the backend, since the whole point of an e2e test here is to
// catch a real integration break between apps/web and apps/api. This
// creates a genuine (if throwaway) Supabase user + FulfilmentSellerProfile
// row in staging each run — there is no automated cleanup yet; a
// dedicated ephemeral test project or a cleanup job is future work.
test("seller can register and complete onboarding", async ({ page }) => {
  const uniqueEmail = `e2e-onboarding-${Date.now()}@faira-test.dev`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Faira Fulfilment" })).toBeVisible();
  await page.getByRole("link", { name: "Register as a seller" }).click();

  await expect(page).toHaveURL(/\/signup/);
  await page.getByLabel("Email address").fill(uniqueEmail);
  // The two password fields both contain "password" in their accessible
  // name (one is literally a substring of the other), so disambiguating
  // by label text is fragile — target by input order instead.
  const passwordInputs = page.locator('input[type="password"]');
  await passwordInputs.nth(0).fill("e2eTestPassword123");
  await passwordInputs.nth(1).fill("e2eTestPassword123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });

  // Step 1: About you
  await page.getByLabel("Full name").fill("E2E Test Seller");
  await page.getByLabel("Mobile number").fill("+263771234567");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2: Your business
  await page.getByText("Individual seller").click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3: What you sell
  await page.getByText("Electronics").click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 4: Your shop
  await page.getByText("No", { exact: true }).click();
  await page.getByLabel("City").fill("Harare");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 5: Preferred hub
  await page.getByRole("combobox").click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 6: Review & confirm
  await page.getByText(/agree to the Faira Fulfilment seller terms/i).click();
  await page.getByRole("button", { name: "Submit registration" }).click();

  await expect(page).toHaveURL(/\/onboarding\/submitted/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Registration submitted" })).toBeVisible();
});
