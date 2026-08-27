import { test, expect } from "@playwright/test";

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
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "About" }).click();
    await nav.getByRole("link", { name: "Our Story" }).click();

    await expect(page).toHaveURL(/\/about\/story$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "About Chatter" }),
    ).toBeVisible();
  });

  test("nav resolves to Mission & Values", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "About" }).click();
    await nav.getByRole("link", { name: "Mission & Values" }).click();

    await expect(page).toHaveURL(/\/about\/mission$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Our Mission" }),
    ).toBeVisible();
  });

  test("nav resolves to Meet the Team", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "About" }).click();
    await nav.getByRole("link", { name: "Meet the Team" }).click();

    await expect(page).toHaveURL(/\/about\/team$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Meet the team" }),
    ).toBeVisible();
  });
});
