// Issue #859: an organization puts its terms of use in force from
// Administration, and that decision is its own -- not one boolean compiled into
// the application, deciding for every tenant at once.
//
// Putting a document in force must both serve its URL and put it back in the
// footer: a link the footer no longer renders is still a live page, and a page
// that is live but unlinked is text nobody can find but anybody can reach.
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";

const TERMS_KEY = "legal_publication.terms";
const CONDUCT_KEY = "legal_publication.code_of_conduct";
const ACCESSIBILITY_KEY = "legal_publication.accessibility";

async function setInForce(key: string, inForce: boolean) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert({ key, value: inForce }, { onConflict: "tenant_id,key" });
  if (error) throw new Error(`Could not set ${key}: ${error.message}`);
}

async function clear(key: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("app_settings").delete().eq("key", key);
  if (error) throw new Error(`Could not clear ${key}: ${error.message}`);
}

test.describe("per-tenant legal publication", () => {
  // One app_settings row shared by the whole site, so this file mutates global
  // state and cannot run beside anything -- itself included. Serial mode orders
  // the cases within the file; staying out of the way of the rest of the suite
  // is playwright.config.ts's job, where this is one of the `mutating` specs.
  // The gate is server-side, so there is nothing browser-specific to gain from
  // running it in more than one browser.
  test.describe.configure({ mode: "serial" });

  // Back to the seeded state -- no rows at all -- however a test ends. Deleting
  // rather than setting false, because absent is what a tenant that has never
  // opened the panel looks like, and that is the state the rest of the suite
  // (e2e/legal.spec.ts especially) expects to find.
  test.afterEach(async () => {
    await clear(TERMS_KEY);
    await clear(CONDUCT_KEY);
    await clear(ACCESSIBILITY_KEY);
  });

  test("putting the terms in force serves them and links them", async ({
    page,
  }) => {
    await setInForce(TERMS_KEY, true);

    const response = await page.goto("/terms");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Terms of Use" }),
    ).toBeVisible();

    await page.goto("/home");
    await expect(
      page
        .getByRole("navigation", { name: "Legal" })
        .getByRole("link", { name: "Terms of Use" }),
    ).toBeVisible();
  });

  test("the other documents are unaffected by that decision", async ({
    page,
  }) => {
    await setInForce(TERMS_KEY, true);

    // Each document is adopted on its own: the terms going live says nothing
    // about a code of conduct the organization has not adopted.
    const conduct = await page.goto("/code-of-conduct");
    expect(conduct?.status()).toBe(404);

    // And the privacy policy is served either way, which is the whole reason it
    // has no publication state.
    const privacy = await page.goto("/privacy");
    expect(privacy?.status()).toBe(200);
  });

  test("taking them back out of force 404s the route again", async ({
    page,
  }) => {
    await setInForce(TERMS_KEY, true);
    await setInForce(TERMS_KEY, false);

    const response = await page.goto("/terms");
    expect(response?.status()).toBe(404);

    await page.goto("/home");
    // The privacy policy is `alwaysInForce`, so the Legal nav is the one
    // landmark here that is never empty. Asserting it arrived is what stops
    // the absence below being satisfied by a footer that has not rendered --
    // on its own, `toHaveCount(0)` for the terms link is equally true of a
    // blank page, and could never go red.
    const legal = page.getByRole("navigation", { name: "Legal" });
    await expect(
      legal.getByRole("link", { name: "Privacy Policy" }),
    ).toBeVisible();
    await expect(legal.getByRole("link", { name: "Terms of Use" })).toHaveCount(
      0,
    );
  });
});

/**
 * The accessibility statement's own page, scanned (#1368).
 *
 * `e2e/a11y-scan.ts` cannot reach it. The scan runs against the seeded tenant,
 * which has adopted nothing, so `/accessibility` 404s there and sits in
 * `SKIPPED_ROUTES` beside /terms and /code-of-conduct -- which leaves the one
 * page on the site that describes how this site is tested as a page the tests
 * never see. On any other document that is a footnote; on this one it is the
 * claim failing on its own terms.
 *
 * So it is scanned here instead, where a document can be put in force. Same
 * rule set as the sweep, and in both themes, because a legal page is a wall of
 * text and contrast is the rule a wall of text fails.
 */
test.describe("the accessibility statement's own page", () => {
  test.describe.configure({ mode: "serial" });

  test.afterEach(async () => {
    await clear(ACCESSIBILITY_KEY);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no axe violations in ${theme} mode`, async ({ page }) => {
      await setInForce(ACCESSIBILITY_KEY, true);

      const response = await page.goto("/accessibility");
      expect(response?.status()).toBe(200);

      await page.evaluate((next) => {
        document.documentElement.setAttribute("data-theme", next);
        document.documentElement.classList.toggle("dark", next === "dark");
      }, theme);
      // The palette crossfade, which axe would otherwise measure mid-blend.
      await page.waitForTimeout(600);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      expect(
        results.violations.map((violation) => violation.id),
        "the page saying how this site is tested may not itself fail the test",
      ).toEqual([]);
    });
  }

  // The rail is how anyone reads a document this long, and an anchor that
  // scrolls nowhere is invisible to axe and to types alike.
  test("every section link in the rail points at a heading", async ({
    page,
  }) => {
    await setInForce(ACCESSIBILITY_KEY, true);
    await page.goto("/accessibility");

    const dead = await page.evaluate(() =>
      [...document.querySelectorAll('nav a[href^="#"]')]
        .map((link) => link.getAttribute("href")!)
        .filter((href) => href.length > 1 && !document.querySelector(href)),
    );

    expect(dead).toEqual([]);
  });
});
