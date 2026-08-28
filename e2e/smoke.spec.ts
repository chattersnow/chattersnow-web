import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

test("home page loads", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveTitle(/.+/);
  await expect(page).not.toHaveTitle(/Coming soon/);
});

test("portal home page no longer shows the coming-soon tab title", async ({
  page,
}) => {
  await signIn(page);
  await expect(page).not.toHaveTitle(/Coming soon/);
});
