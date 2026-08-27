import { test, expect } from "@playwright/test";

test.describe("public gears pages", () => {
  test("gears index redirects to the gear library", async ({ page }) => {
    await page.goto("/gears");
    await expect(page).toHaveURL(/\/gears\/library$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Gear library" }),
    ).toBeVisible();
  });

  test("nav resolves to Gear Library", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "Gear" }).click();
    await nav.getByRole("link", { name: "Gear Library" }).click();

    await expect(page).toHaveURL(/\/gears\/library$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Gear library" }),
    ).toBeVisible();
  });

  test("nav resolves to Sizing Guide", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "Gear" }).click();
    await nav.getByRole("link", { name: "Sizing Guide" }).click();

    await expect(page).toHaveURL(/\/gears\/sizing$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sizing guide" }),
    ).toBeVisible();
  });

  test("nav resolves to the gear donation page", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "Gear" }).click();
    await nav.getByRole("link", { name: "How It Works" }).click();

    await expect(page).toHaveURL(/\/gears\/donate/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "How the gear program works",
      }),
    ).toBeVisible();
  });
});
