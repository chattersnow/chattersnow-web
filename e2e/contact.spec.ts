import { test, expect } from "@playwright/test";

test.describe("public contact page", () => {
  test("contact page loads", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { level: 1, name: "Get in touch" }),
    ).toBeVisible();
  });

  test("nav resolves to Contact", async ({ page }) => {
    await page.goto("/home");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Contact", exact: true })
      .click();

    await expect(page).toHaveURL(/\/contact$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Get in touch" }),
    ).toBeVisible();
  });
});
