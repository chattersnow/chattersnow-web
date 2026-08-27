import { test, expect } from "@playwright/test";
import { clickNavLink } from "./helpers/nav";

test.describe("public contact page", () => {
  test("contact page loads", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { level: 1, name: "Get in touch" }),
    ).toBeVisible();
  });

  test("nav resolves to Contact", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Contact");

    await expect(page).toHaveURL(/\/contact$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Get in touch" }),
    ).toBeVisible();
  });
});
