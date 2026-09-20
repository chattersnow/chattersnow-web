import { test, expect } from "./helpers/test";
import { clickNavLink } from "./helpers/nav";

/**
 * The two front doors (#1328). `/nonprofits` and `/business` are one
 * implementation behind two routes, so what is worth driving a browser for is
 * the part a unit test cannot see: that both routes actually render, that the
 * one component reads the right page's slots on each, and that the nav reaches
 * them.
 *
 * Both are gated by the `audiences` slot, which is off for every tenant by
 * default; `supabase/seed.sql` turns it on for local and CI. The gate itself
 * is covered where the other slots' gates are, in `e2e/page-visibility.spec.ts`
 * and `src/lib/page-visibility.test.ts` -- toggling a real `app_settings` row
 * takes the whole site's nav with it, which is why that spec has a Playwright
 * project to itself.
 */
test.describe("the audience paths", () => {
  test("the nonprofit page leads with governance", async ({ page }) => {
    await page.goto("/nonprofits");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "nonprofit",
    );
    // First of the section headings, not merely present: governance leading
    // is the positioning decision, and a page that mentions it fourth has
    // quietly lost it.
    await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(
      "Governance",
    );
  });

  test("the business page omits governance rather than stretching it", async ({
    page,
  }) => {
    await page.goto("/business");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "business",
    );
    await expect(
      page.getByRole("heading", { level: 2, name: "Governance" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 2, name: "Stock and equipment" }),
    ).toBeVisible();
  });

  // The two pages are the same product in two vocabularies, and the site has
  // to say so rather than implying a nonprofit edition and a business one.
  test("both say the wording is a setting, not a separate edition", async ({
    page,
  }) => {
    for (const [path, edition] of [
      ["/nonprofits", "not a nonprofit edition"],
      ["/business", "not a business edition"],
    ] as const) {
      await page.goto(path);
      const main = page.getByRole("main");
      await expect(main, path).toContainText(edition);
      await expect(main, `${path} calls the wording a setting`).toContainText(
        "a setting",
      );
    }
  });

  test("both are reachable from the main navigation", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "For business", { group: "Who it's for" });
    await expect(page).toHaveURL(/\/business$/);

    await clickNavLink(page, "For nonprofits", { group: "Who it's for" });
    await expect(page).toHaveURL(/\/nonprofits$/);
  });
});
