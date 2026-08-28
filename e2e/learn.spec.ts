import { test, expect } from "@playwright/test";
import { clickNavLink } from "./helpers/nav";

test.describe("public learn page", () => {
  test("learn page loads", async ({ page }) => {
    await page.goto("/learn");
    await expect(
      page.getByRole("heading", { level: 1, name: "Learn" }),
    ).toBeVisible();
  });

  test("nav resolves to Learn", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Learn");

    await expect(page).toHaveURL(/\/learn$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Learn" }),
    ).toBeVisible();
  });

  test("getting started category renders its articles", async ({ page }) => {
    await page.goto("/learn/getting-started");

    await expect(
      page.getByRole("heading", { level: 1, name: "Getting Started" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "First day guide: what to expect at the mountain",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Booking a lesson vs. going it alone",
      }),
    ).toBeVisible();
    await expect(page.getByText("coming soon")).toHaveCount(0);
  });
});
