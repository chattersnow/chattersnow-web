import { test, expect } from "./helpers/test";
import { clickNavLink } from "./helpers/nav";

/**
 * Learn is a tenant-owned article collection since #894, so these assertions
 * are against the categories `supabase/seed.sql` gives Example Nonprofit, not
 * against eight compiled `*-data.ts` files. Nothing here names a category the
 * platform ships, because the platform ships none.
 */
test.describe("public learn page", () => {
  test("learn page loads and lists the tenant's categories", async ({
    page,
  }) => {
    await page.goto("/learn");
    await expect(
      page.getByRole("heading", { level: 1, name: "Learn" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Getting Started/ }),
    ).toBeVisible();
    await expect(page.getByText("no guides here yet")).toHaveCount(0);
  });

  test("nav resolves to Learn", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Learn");

    await expect(page).toHaveURL(/\/learn$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Learn" }),
    ).toBeVisible();
  });

  test("a category card opens its page", async ({ page }) => {
    await page.goto("/learn");
    await page.getByRole("link", { name: /Getting Started/ }).click();

    await expect(page).toHaveURL(/\/learn\/getting-started$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Getting Started" }),
    ).toBeVisible();
  });

  test("a category renders its articles in order", async ({ page }) => {
    await page.goto("/learn/getting-started");

    await expect(
      page.getByRole("heading", { level: 1, name: "Getting Started" }),
    ).toBeVisible();

    const articleHeadings = page.getByRole("heading", { level: 2 });
    await expect(articleHeadings.first()).toHaveText("Your first visit");
    await expect(articleHeadings.nth(1)).toHaveText("What to bring");
    await expect(page.getByText("coming soon")).toHaveCount(0);
  });

  test("an article renders its list, links and disclaimer", async ({
    page,
  }) => {
    await page.goto("/learn/getting-started");

    await expect(page.getByText("Arrive early")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Example external reference" }),
    ).toHaveAttribute("href", "https://example.org/");
    await expect(
      page.getByText("Seed content for local development").first(),
    ).toBeVisible();
  });

  test("the in-page nav jumps to an article's anchor", async ({ page }) => {
    await page.goto("/learn/getting-started");

    await page
      .getByRole("navigation", { name: "Getting Started articles" })
      .getByRole("link", { name: "What to bring" })
      .click();

    await expect(page).toHaveURL(/#what-to-bring$/);
  });

  test("a category nobody has published renders the not-found page", async ({
    page,
  }) => {
    await page.goto("/learn/no-such-category");
    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    // Deliberately not asserting a 404 status. A page-level `notFound()` under
    // `(public)` serves the not-found body with a 200 in this app -- the same
    // is true of /events/e/[id], which predates #894 -- so asserting the status
    // here would be asserting a bug is fixed that this ticket did not fix.
  });
});
