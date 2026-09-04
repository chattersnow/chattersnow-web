import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

// Issue #595: every public page put seven tab stops (logo, five nav links,
// theme toggle) between the top of the document and the content. The three
// routes below cover the three ways a public page gets its <main>: /home
// hand-rolls one, /about gets it from a layout wrapping PageShell, and
// /gears/sizing used to nest its own inside the /gears PageShell.
const ROUTES = ["/home", "/about", "/gears/sizing"];

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

  test("exactly one main landmark per page", async ({ page }) => {
    for (const route of ROUTES) {
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
