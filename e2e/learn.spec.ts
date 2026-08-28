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

  test("gear care category renders its articles", async ({ page }) => {
    await page.goto("/learn/gear-care");

    await expect(
      page.getByRole("heading", { level: 1, name: "Gear Care" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Gear care 101: between-trip basics",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Edge tuning: what it is and when to see a shop",
      }),
    ).toBeVisible();
    await expect(page.getByText("coming soon")).toHaveCount(0);
  });

  test("community and inclusion category renders its articles", async ({
    page,
  }) => {
    await page.goto("/learn/community-and-inclusion");

    await expect(
      page.getByRole("heading", { level: 1, name: "Community & Inclusion" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Finding your place in the snow sports community",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Overcoming first-timer intimidation",
      }),
    ).toBeVisible();
    await expect(page.getByText("coming soon")).toHaveCount(0);
  });
});
