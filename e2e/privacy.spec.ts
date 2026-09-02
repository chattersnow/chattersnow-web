import { test, expect } from "@playwright/test";

test.describe("privacy policy", () => {
  test("privacy page loads", async ({ page }) => {
    await page.goto("/privacy");

    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeVisible();
    await expect(page.getByText("Last updated:")).toBeVisible();
  });

  // The policy has to be reachable from anywhere on the site, which is the
  // reason it lives in the footer rather than the header nav.
  test("the footer links to it from a public page", async ({ page }) => {
    await page.goto("/home");

    await page
      .getByRole("navigation", { name: "Footer" })
      .getByRole("link", { name: "Privacy Policy" })
      .click();

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeVisible();
  });
});
