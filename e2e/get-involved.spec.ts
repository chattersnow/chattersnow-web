import { test, expect } from "@playwright/test";

test.describe("public get-involved pages", () => {
  test("get-involved index page loads", async ({ page }) => {
    await page.goto("/get-involved");
    await expect(page).toHaveURL(/\/get-involved$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Get involved" }),
    ).toBeVisible();
  });

  test("nav resolves to Attend", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "Get Involved" }).click();
    await nav.getByRole("link", { name: "Attend" }).click();

    await expect(page).toHaveURL(/\/get-involved\/attend$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Get involved" }),
    ).toBeVisible();
  });

  test("nav resolves to Volunteer", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "Get Involved" }).click();
    await nav.getByRole("link", { name: "Volunteer" }).click();

    await expect(page).toHaveURL(/\/get-involved\/volunteer$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Volunteer" }),
    ).toBeVisible();
  });

  test("nav resolves to Become a Partner", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "Get Involved" }).click();
    await nav.getByRole("link", { name: "Become a Partner" }).click();

    await expect(page).toHaveURL(/\/get-involved\/partner$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Become a partner" }),
    ).toBeVisible();
  });
});
