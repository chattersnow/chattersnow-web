import { test, expect } from "@playwright/test";
import { clickNavLink } from "./helpers/nav";

test.describe("public learn page", () => {
  test("learn page loads", async ({ page }) => {
    await page.goto("/learn");
    await expect(
      page.getByRole("heading", { level: 1, name: "Learn" }),
    ).toBeVisible();
  });

  test("nav resolves to Learn", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Learn");

    await expect(page).toHaveURL(/\/learn$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Learn" }),
    ).toBeVisible();
  });
});
