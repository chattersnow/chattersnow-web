import { test, expect } from "@playwright/test";
import { clickNavLink } from "./helpers/nav";

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
    await clickNavLink(page, "Attend", { group: "Get Involved" });

    await expect(page).toHaveURL(/\/get-involved\/attend$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Get involved" }),
    ).toBeVisible();
  });

  test("nav resolves to Volunteer", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Volunteer", { group: "Get Involved" });

    await expect(page).toHaveURL(/\/get-involved\/volunteer$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Volunteer" }),
    ).toBeVisible();
  });

  test("nav resolves to Become a Partner", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Become a Partner", { group: "Get Involved" });

    await expect(page).toHaveURL(/\/get-involved\/partner$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Become a partner" }),
    ).toBeVisible();
  });
});
