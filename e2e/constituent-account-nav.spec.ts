import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";

/**
 * The public site's way in to `/my` (#1175).
 *
 * `/my` shipped across #1161-#1165 with nothing linking to it: a person reached
 * their own record by typing the URL and signed out by navigating back to the
 * one page that held the button. These tests are about the entry point, not the
 * pages behind it.
 *
 * The seeded tenant has `constituent_accounts` on (`supabase/seed.sql`), which
 * is also what let the a11y scan stop skipping the area. The module-off case is
 * covered by the unit tests, since turning a module off for the seeded tenant
 * mid-run would take the whole public site's account control down for whatever
 * else is running.
 */
test.describe("the public account control", () => {
  test("offers a signed-out visitor a way to sign in", async ({ page }) => {
    await page.goto("/home");

    const signInLink = page.getByRole("link", { name: "Sign in" }).first();
    await expect(signInLink).toBeVisible();
    await signInLink.click();

    await expect(page).toHaveURL(/\/my\/sign-in$/);
  });

  // The acceptance test for one account across two hosts (#1161), read off the
  // header: an administrator who signed in at the portal is already signed in
  // on the public site, and now the site says so.
  test("names the signed-in account on an ordinary public page", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/events");

    await expect(
      page.getByRole("button", { name: /Your account/ }),
    ).toBeVisible();
  });

  test("reaches /my from the header menu", async ({ page }) => {
    await signIn(page);
    await page.goto("/home");

    await page.getByRole("button", { name: /Your account/ }).click();
    await page.getByRole("menuitem", { name: "Your account" }).click();

    await expect(page).toHaveURL(/\/my$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Your account" }),
    ).toBeVisible();
  });

  // Signing out used to mean finding `/my` first. From any page now -- and the
  // header has to agree afterwards, which is what `router.refresh()` in
  // `useConstituentSignOut` is for.
  test("signs out from a public page and the header follows", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/events");

    await page.getByRole("button", { name: /Your account/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/my\/sign-in/);
    await expect(
      page.getByRole("link", { name: "Sign in" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Your account/ }),
    ).toHaveCount(0);
  });

  // The phone arrangement is a different control, not the same one shrunk: the
  // header has no room for a fifth item below `sm`, so the rows live in the
  // menu sheet the way the portal's do.
  test("puts the account in the menu sheet on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto("/home");

    await expect(
      page.getByRole("button", { name: /Your account/ }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.getByRole("link", { name: "Your account" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});
