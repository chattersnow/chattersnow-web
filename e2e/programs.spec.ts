import { test, expect } from "@playwright/test";

test.describe("public programs page", () => {
  test("programs page loads", async ({ page }) => {
    await page.goto("/programs");
    await expect(
      page.getByRole("heading", { level: 1, name: "Programs" }),
    ).toBeVisible();
  });

  test("nav resolves to Programs", async ({ page }) => {
    await page.goto("/home");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Programs", exact: true })
      .click();

    await expect(page).toHaveURL(/\/programs$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Programs" }),
    ).toBeVisible();
  });
});
