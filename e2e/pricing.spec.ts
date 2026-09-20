import { test, expect } from "./helpers/test";
import { clickNavLink } from "./helpers/nav";

/**
 * The price list (#1330).
 *
 * The tenant this runs against is the seeded one, not the platform tenant, so
 * the cards it renders carry the registry's shape and the registry's em dashes
 * rather than anybody's real prices -- which is exactly the state the page is in
 * before somebody fills it in, and worth seeing rendered. The figures live in
 * the platform tenant's own `site_content` rows (20260920030000).
 *
 * Gated by the `pricing` slot, off for every tenant by default and turned on in
 * `supabase/seed.sql` for local and CI.
 */
test.describe("the price list", () => {
  test("renders a card per plan, from content rows", async ({ page }) => {
    await page.goto("/pricing");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const plan of ["Starter", "Standard", "Full"]) {
      await expect(
        page.getByRole("heading", { level: 2, name: plan }),
      ).toBeVisible();
    }
  });

  // #998 asks this page to say what comes with every plan, and to state the
  // setup fee rather than let a reader find out about it later.
  test("says what every plan includes, and what setup costs", async ({
    page,
  }) => {
    await page.goto("/pricing");
    const main = page.getByRole("main");

    await expect(main).toContainText("Every plan includes");
    await expect(main).toContainText("domain");
    await expect(main).toContainText("Setting it up");
  });

  // One product, one set of plans: a reader who arrived through /business is the
  // one who wonders whether there is a different price list for them.
  test("says the plans do not differ by audience", async ({ page }) => {
    await page.goto("/pricing");

    await expect(page.getByRole("main")).toContainText("one product");
  });

  test("is reachable from the main navigation", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Pricing", { group: "Product" });

    await expect(page).toHaveURL(/\/pricing$/);
  });
});
