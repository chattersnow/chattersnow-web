import { test, expect } from "@playwright/test";

test.describe("public support pages", () => {
  test("support index page loads", async ({ page }) => {
    await page.goto("/support");
    await expect(
      page.getByRole("heading", { level: 1, name: "Support Chatter" }),
    ).toBeVisible();
  });

  test("nav resolves to Donations", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "Support" }).click();
    await nav.getByRole("link", { name: "Donations" }).click();

    await expect(page).toHaveURL(/\/support\/donations$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Donations" }),
    ).toBeVisible();
  });

  test("nav resolves to Sponsorship", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "Support" }).click();
    await nav.getByRole("link", { name: "Sponsorship" }).click();

    await expect(page).toHaveURL(/\/support\/sponsorship$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sponsorship" }),
    ).toBeVisible();
  });
});
