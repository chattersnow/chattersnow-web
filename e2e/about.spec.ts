import { test, expect } from "./helpers/test";
import { clickNavLink } from "./helpers/nav";

test.describe("public about pages", () => {
  test("about index redirects to Our Story", async ({ page }) => {
    await page.goto("/about");
    await expect(page).toHaveURL(/\/about\/story$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "About us" }),
    ).toBeVisible();
  });

  test("nav resolves to Our Story", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Our Story", { group: "About" });

    await expect(page).toHaveURL(/\/about\/story$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "About us" }),
    ).toBeVisible();
  });

  test("Our Story section renders its photo alongside the copy", async ({
    page,
  }) => {
    await page.goto("/about/story");

    await expect(
      page.getByRole("heading", { level: 2, name: "Our Story" }),
    ).toBeVisible();
    // No site image is seeded in the test DB, so this may render the actual
    // photo or its ImagePlaceholder fallback — either way it keeps the
    // portrait aspect ratio from the (no longer floated-and-cramped) layout.
    await expect(page.locator(".aspect-\\[3\\/4\\]").first()).toBeVisible();
  });

  test("nav resolves to Mission & Values", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Mission & Values", { group: "About" });

    await expect(page).toHaveURL(/\/about\/mission$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Our Mission" }),
    ).toBeVisible();
  });

  // Both headings come from slots. "Why LGBTQ+ snow sports" was Chatter Snow's
  // wording, which local and CI only saw because the database bootstrapped as
  // their tenant; since #795 Phase 3 it bootstraps as the neutral one and these
  // resolve to the registry defaults. The claim -- that the Mission page renders
  // both of its sections -- is unchanged.
  test("Our Values and Why this work matters both render on the Mission page", async ({
    page,
  }) => {
    await page.goto("/about/mission");

    await expect(
      page.getByRole("heading", { level: 2, name: "Our Values" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Why this work matters" }),
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
