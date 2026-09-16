import { test, expect } from "./helpers/test";
import type { Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

// Issue #595: every public page put seven tab stops (logo, five nav links,
// theme toggle) between the top of the document and the content. The three
// routes below cover the three ways a public page gets its <main>: /home
// hand-rolls one, /about gets it from a layout wrapping PageShell, and
// /inventory/sizing used to nest its own inside the /inventory PageShell.
//
// /my/sign-in is the fourth way, and the one that was broken: the constituent
// area's layout is gate-and-slot, so until #1179 each page under it rendered
// no <main> at all and the skip link pointed at nothing.
const ROUTES = ["/home", "/about", "/inventory/sizing", "/my/sign-in"];

// The rest of the area needs a session -- signed out all four redirect to
// /my/sign-in, which would test that one page four times. admin@ is used for
// the reason the a11y sweep uses it: a staff account is linked to its own
// people row on first sign-in, so these render the real pages rather than the
// claim form. Any new signed-in /my route belongs here.
const SIGNED_IN_ROUTES = [
  "/my",
  "/my/details",
  "/my/hours",
  "/my/notifications",
];

/**
 * Tabs to the first focusable element that belongs to the app. `next dev`
 * injects a <nextjs-portal> dev overlay that can take a tab stop of its own
 * and does not exist in a production build, so asserting on a bare first Tab
 * would be testing the dev server.
 */
async function tabToFirstAppStop(page: Page) {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    const isDevOverlay = await page.evaluate(() =>
      (document.activeElement?.tagName ?? "")
        .toLowerCase()
        .startsWith("nextjs"),
    );
    if (!isDevOverlay) return;
  }
  throw new Error("never reached an app focusable element");
}

test.describe("skip link", () => {
  for (const route of ROUTES) {
    test(`moves focus straight to main content on ${route}`, async ({
      page,
    }) => {
      await page.goto(route);

      const skipLink = page.getByRole("link", {
        name: "Skip to main content",
      });

      await tabToFirstAppStop(page);
      await expect(skipLink).toBeFocused();
      // sr-only until focused, or sighted keyboard users cannot see where
      // they are.
      await expect(skipLink).toBeVisible();

      await page.keyboard.press("Enter");
      await expect(page.locator("#main-content")).toBeFocused();
    });
  }

  for (const route of SIGNED_IN_ROUTES) {
    test(`moves focus straight to main content on ${route}`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto(route);

      const skipLink = page.getByRole("link", {
        name: "Skip to main content",
      });

      await tabToFirstAppStop(page);
      await expect(skipLink).toBeFocused();
      await expect(skipLink).toBeVisible();

      await page.keyboard.press("Enter");
      await expect(page.locator("#main-content")).toBeFocused();
    });
  }

  test("exactly one main landmark per page", async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(
        page.locator("main"),
        `main landmarks on ${route}`,
      ).toHaveCount(1);
    }

    await signIn(page);
    for (const route of SIGNED_IN_ROUTES) {
      await page.goto(route);
      await expect(
        page.locator("main"),
        `main landmarks on ${route}`,
      ).toHaveCount(1);
    }
  });

  // The portal has had a skip link since before #595, but it sat inside
  // SidebarInset -- which renders after the sidebar -- so a keyboard user
  // tabbed through all 25-40 stops it was meant to skip before reaching it.
  test("comes before the sidebar in the portal", async ({ page }) => {
    await signIn(page);

    const skipLink = page.getByRole("link", { name: "Skip to main content" });

    await tabToFirstAppStop(page);
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page.locator("#portal-main")).toBeFocused();
  });
});
