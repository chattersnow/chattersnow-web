import { test, expect } from "@playwright/test";

test("signing in redirects to the portal home", async ({ page }) => {
  await page.goto("/portal/login");

  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/portal\/home$/);
  await expect(
    page.getByRole("paragraph").filter({ hasText: "Dashboard" }),
  ).toBeVisible();
});
