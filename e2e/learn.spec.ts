import { test, expect } from "@playwright/test";

test.describe("public learn page", () => {
  test("learn page loads", async ({ page }) => {
    await page.goto("/learn");
    await expect(
      page.getByRole("heading", { level: 1, name: "Learn" }),
    ).toBeVisible();
  });

  test("nav resolves to Learn", async ({ page }) => {
    await page.goto("/home");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Learn", exact: true })
      .click();

    await expect(page).toHaveURL(/\/learn$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Learn" }),
    ).toBeVisible();
  });
});
