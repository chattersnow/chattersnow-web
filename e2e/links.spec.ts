import { test, expect } from "./helpers/test";

/**
 * The link-in-bio page (#937): the one URL an Instagram bio points at.
 *
 * No fixture and nothing to seed -- the registry's own default gives a tenant
 * that has written nothing one link, and that is exactly what an organization
 * sees on the day the page is turned on.
 */
test.describe("/links", () => {
  test("renders the configured links as links, not buttons", async ({
    page,
  }) => {
    await page.goto("/links");

    const stack = page.getByRole("navigation", { name: /find us here/i });
    await expect(stack).toBeVisible();

    const first = stack.getByRole("link").first();
    await expect(first).toBeVisible();
    // A destination configured in the portal rather than a hardcoded route,
    // so this asserts the shape of one instead of pinning today's copy.
    await expect(first).toHaveAttribute("href", /^(\/|https:\/\/|mailto:)/);
  });

  // The whole point of the page: someone arriving from a social profile gets
  // the choices, not the site's own navigation offering the same ones again.
  test("carries none of the site's header nav or footer", async ({ page }) => {
    await page.goto("/links");

    // The landmarks rather than the controls inside them: `banner` and
    // `contentinfo` are what `(public)/layout.tsx` contributes, so their
    // absence is the whole claim in two assertions that cannot go stale as
    // the nav and footer change.
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
  });

  test("reads as one column on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/links");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Nothing may push the page sideways -- this is read with one thumb.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows).toBe(false);
  });

  test("offers a way back to the site", async ({ page }) => {
    await page.goto("/links");

    await expect(
      page.getByRole("link", { name: "Visit our website" }),
    ).toHaveAttribute("href", "/home");
  });
});
