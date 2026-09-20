import { test, expect } from "./helpers/test";
import { signIn, SEEDED_PASSWORD } from "./helpers/auth";

/**
 * The public site's way in to `/my` (#1175).
 *
 * `/my` shipped across #1161-#1165 with nothing linking to it: a person reached
 * their own record by typing the URL and signed out by navigating back to the
 * one page that held the button. These tests are about the entry point, not the
 * pages behind it.
 *
 * ## Every test sets its own viewport, deliberately
 *
 * The control is two different things either side of `sm`: a header icon above,
 * rows in the menu sheet below, and never both. So which one a test is talking
 * about cannot be left to the project's device -- the suite runs the same specs
 * under Desktop Chrome and a Pixel 7, and a test that assumed one of them
 * passed in three projects and failed in the fourth. Naming the width is also
 * the clearer test: the arrangement under test is the point of the test.
 *
 * The seeded tenant has `constituent_accounts` on (`supabase/seed.sql`), which
 * is also what let the a11y scan stop skipping the area. The module-off case is
 * covered by the unit tests, since turning a module off for the seeded tenant
 * mid-run would take the whole public site's account control down for whatever
 * else is running.
 */
const WIDE = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

test.describe("the public account control", () => {
  test("offers a signed-out visitor a way to sign in", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto("/home");

    const header = page
      .locator("header")
      .getByRole("link", { name: "Sign in" });
    await expect(header).toHaveAttribute("href", "/my/sign-in");
    await header.click();

    await expect(page).toHaveURL(/\/my\/sign-in$/);
  });

  // The acceptance test for one account across two hosts (#1161), read off the
  // header: an administrator who signed in at the portal is already signed in
  // on the public site, and now the site says so.
  test("names the signed-in account on an ordinary public page", async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await signIn(page);
    await page.goto("/events");

    await expect(
      page.getByRole("button", { name: /Your account/ }),
    ).toBeVisible();
  });

  test("reaches /my from the header menu", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await signIn(page);
    await page.goto("/home");

    await page.getByRole("button", { name: /Your account/ }).click();
    await page.getByRole("menuitem", { name: "Your account" }).click();

    await expect(page).toHaveURL(/\/my$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Your account" }),
    ).toBeVisible();
  });

  // The mirror of the sign-out test below, and the reason both paths share
  // `navigateAfterSessionChange` (#1304): `/my/sign-in` and `/my` sit in one
  // layout segment, so without the refresh the header keeps the signed-out
  // payload it was rendered with and offers "Sign in" on the signed-in page.
  test("signs in from /my/sign-in and the header follows", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto("/my/sign-in");

    await page.getByLabel("Email").fill("admin@example.test");
    await page.getByLabel("Password").fill(SEEDED_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/my$/);
    await expect(
      page.locator("header").getByRole("button", { name: /Your account/ }),
    ).toBeVisible();
    await expect(
      page.locator("header").getByRole("link", { name: "Sign in" }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", { name: "Resources" })
        .getByRole("link", { name: "Your account" }),
    ).toHaveAttribute("href", "/my");
  });

  // Signing out used to mean finding `/my` first. From any page now -- and the
  // header has to agree afterwards, which is what the refresh in
  // `navigateAfterSessionChange` is for.
  test("signs out from a public page and the header follows", async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await signIn(page);
    await page.goto("/events");

    await page.getByRole("button", { name: /Your account/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/my\/sign-in/);
    await expect(
      page.locator("header").getByRole("link", { name: "Sign in" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Your account/ }),
    ).toHaveCount(0);
  });

  // The footer link is the header's quiet twin, for a visitor who has read to
  // the bottom of a page rather than back up to the top of it.
  test("also offers the account from the footer", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await signIn(page);
    await page.goto("/home");

    await expect(
      page
        .getByRole("navigation", { name: "Resources" })
        .getByRole("link", { name: "Your account" }),
    ).toHaveAttribute("href", "/my");
  });

  // The phone arrangement is a different control, not the same one shrunk: the
  // header has no room for a fifth item below `sm`, so the rows live in the
  // menu sheet the way the portal's do.
  test("puts the account in the menu sheet on a phone", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signIn(page);
    await page.goto("/home");

    await expect(
      page.locator("header").getByRole("button", { name: /Your account/ }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Open menu" }).click();
    // Scoped to the sheet: the footer carries the same two labels on every
    // page, so an unscoped query matches twice and fails strict mode -- which
    // is the right complaint, since these are two different surfaces.
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(
      sheet.getByRole("link", { name: "Your account" }),
    ).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("offers sign in from the menu sheet when signed out", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/home");

    await page.getByRole("button", { name: "Open menu" }).click();
    const row = page
      .locator('[data-slot="sheet-content"]')
      .getByRole("link", { name: "Sign in" });
    await expect(row).toBeVisible();
    await row.click();

    await expect(page).toHaveURL(/\/my\/sign-in$/);
  });
});
