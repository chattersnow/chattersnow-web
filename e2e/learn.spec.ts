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

  test("etiquette category renders its articles", async ({ page }) => {
    await page.goto("/learn/etiquette");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Mountain & Lift Etiquette",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Mountain & lift etiquette basics",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Uphill/downhill traffic & the Responsibility Code",
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

  test("mountain basics category renders its articles", async ({ page }) => {
    await page.goto("/learn/mountain-basics");

    await expect(
      page.getByRole("heading", { level: 1, name: "Mountain Basics" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Trail ratings explained: green, blue, black & beyond",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Reading a trail map" }),
    ).toBeVisible();
    await expect(page.getByText("coming soon")).toHaveCount(0);
  });

  test("budget category renders its articles", async ({ page }) => {
    await page.goto("/learn/budget");

    await expect(
      page.getByRole("heading", { level: 1, name: "Snow Sports on a Budget" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "What skiing and snowboarding actually cost",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Finding used gear without overpaying",
      }),
    ).toBeVisible();
    await expect(page.getByText("coming soon")).toHaveCount(0);
  });

  test("gear and sizing category renders its articles", async ({ page }) => {
    await page.goto("/learn/gear-and-sizing");

    await expect(
      page.getByRole("heading", { level: 1, name: "Gear & Sizing" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Gear 101: what you actually need for your first day",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Understanding binding DIN settings",
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
