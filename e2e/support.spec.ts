import { test, expect } from "@playwright/test";
import { clickNavLink } from "./helpers/nav";

test.describe("public support pages", () => {
  test("support index page loads", async ({ page }) => {
    await page.goto("/support");
    await expect(
      page.getByRole("heading", { level: 1, name: "Support Chatter" }),
    ).toBeVisible();
  });

  test("nav resolves to Donations", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Donations", { group: "Support" });

    await expect(page).toHaveURL(/\/support\/donations$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Donations" }),
    ).toBeVisible();
  });

  test("nav resolves to Sponsorship", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Sponsorship", { group: "Support" });

    await expect(page).toHaveURL(/\/support\/sponsorship$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sponsorship" }),
    ).toBeVisible();
  });
});
