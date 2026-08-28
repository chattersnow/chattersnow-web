import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveTitle(/.+/);
});
