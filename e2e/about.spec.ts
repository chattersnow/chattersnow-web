import { test, expect } from "@playwright/test";
import { clickNavLink } from "./helpers/nav";

test.describe("public about pages", () => {
  test("about index page loads", async ({ page }) => {
    await page.goto("/about");
    await expect(page).toHaveURL(/\/about$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "About Chatter" }),
    ).toBeVisible();
  });

  test("nav resolves to Our Story", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Our Story", { group: "About" });

    await expect(page).toHaveURL(/\/about\/story$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "About Chatter" }),
    ).toBeVisible();
  });

  test("nav resolves to Mission & Values", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Mission & Values", { group: "About" });

    await expect(page).toHaveURL(/\/about\/mission$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Our Mission" }),
    ).toBeVisible();
  });

  test("nav resolves to Meet the Team", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Meet the Team", { group: "About" });

    await expect(page).toHaveURL(/\/about\/team$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Meet the team" }),
    ).toBeVisible();
  });
});
