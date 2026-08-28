import { test, expect } from "@playwright/test";
import { clickNavLink } from "./helpers/nav";

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
    await clickNavLink(page, "Gear Library", { group: "Gear" });

    await expect(page).toHaveURL(/\/gears\/library$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Gear library" }),
    ).toBeVisible();
  });

  test("nav resolves to Sizing Guide", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Sizing Guide", { group: "Gear" });

    await expect(page).toHaveURL(/\/gears\/sizing$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sizing guide" }),
    ).toBeVisible();
  });

  test("nav resolves to the gear donation page", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "How It Works", { group: "Gear" });

    await expect(page).toHaveURL(/\/gears\/donate/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "How the gear program works",
      }),
    ).toBeVisible();
  });

  test("gear library and donate copy don't imply formal membership", async ({
    page,
  }) => {
    await page.goto("/gears/library");
    await expect(
      page.getByText("Browse gear currently available to the community."),
    ).toBeVisible();
    await expect(page.getByText(/Chatter Snow members/i)).toHaveCount(0);

    await page.goto("/gears/donate");
    await expect(page.getByText(/community members/i)).toHaveCount(0);
    await expect(page.getByText(/where members can/i)).toHaveCount(0);
  });
});
