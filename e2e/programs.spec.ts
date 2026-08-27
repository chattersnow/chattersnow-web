import { test, expect } from "@playwright/test";
import { clickNavLink } from "./helpers/nav";

test.describe("public programs page", () => {
  test("programs page loads", async ({ page }) => {
    await page.goto("/programs");
    await expect(
      page.getByRole("heading", { level: 1, name: "Programs" }),
    ).toBeVisible();
  });

  test("nav resolves to Programs", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Programs");

    await expect(page).toHaveURL(/\/programs$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Programs" }),
    ).toBeVisible();
  });
});
