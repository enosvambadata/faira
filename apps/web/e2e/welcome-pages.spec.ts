import { test, expect } from "@playwright/test";

test.describe("welcome page restructuring", () => {
  test("root \"/\" pitches Faira Collect and routes signup through to company registration", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Faira Collect" })).toBeVisible();

    await page.getByRole("link", { name: "Register your company" }).click();
    await expect(page).toHaveURL(/\/signup\?redirect=\/collect-uk\/register/);
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  });

  test("/fulfilment retains the seller pitch and routes signup through to onboarding", async ({ page }) => {
    await page.goto("/fulfilment");
    await expect(page.getByRole("heading", { name: "Faira Fulfilment" })).toBeVisible();

    await page.getByRole("link", { name: "Register as a seller" }).click();
    await expect(page).toHaveURL(/\/signup\?redirect=\/onboarding/);
  });

  test("signup's sign-in link carries the redirect param forward to login's next param", async ({ page }) => {
    await page.goto("/signup?redirect=%2Fcollect-uk%2Fregister");
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fcollect-uk%2Fregister/);
  });
});
