import { test, expect } from "./helpers/test";
import { clickNavLink } from "./helpers/nav";

/**
 * The module tour (#1329). It shares its implementation with the two audience
 * paths -- `src/app/(public)/tour-page.tsx` -- so what is worth driving a
 * browser for is what a unit test cannot see: that the route renders at all,
 * that the one component reads *this* page's slots on it, and that the nav
 * reaches it.
 *
 * Gated by the `modules` slot, which is off for every tenant by default;
 * `supabase/seed.sql` turns it on for local and CI. The gate itself is covered
 * in `e2e/page-visibility.spec.ts` and `src/lib/page-visibility.test.ts`.
 */
test.describe("the module tour", () => {
  test("covers each part of the platform, governance included", async ({
    page,
  }) => {
    await page.goto("/modules");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const sections = page.getByRole("heading", { level: 2 });
    // Eight modules ship (#998). The count is the page's own decision -- rows
    // are editable -- so this asserts that the tour is a tour rather than a
    // paragraph, and names the two that carry the argument.
    expect(await sections.count()).toBeGreaterThan(5);
    await expect(
      page.getByRole("heading", { level: 2, name: "Governance" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Inventory" }),
    ).toBeVisible();
  });

  // The page's whole argument, and the reason it is not a feature list: no
  // donor database keeps board minutes, and no inventory system raises money.
  test("closes on the combination rather than the parts", async ({ page }) => {
    await page.goto("/modules");

    await expect(page.getByRole("main")).toContainText("together");
  });

  test("is reachable from the main navigation", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "What it does", { group: "Product" });

    await expect(page).toHaveURL(/\/modules$/);
  });
});
