// Issue #1079: the portal renders one of two shells, chosen by the proxy from
// the request rather than by the client from the viewport.
//
// The whole point of the `device_override` cookie is that a test forces a
// shell without spoofing a user-agent: UA sniffing is what the cookie exists
// to correct, so a suite that spoofed one would be testing the wrong path.
import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";

async function useShell(page: Page, device: "mobile" | "desktop") {
  await page.context().addCookies([
    {
      name: "device_override",
      value: device,
      url: page.url(),
    },
  ]);
}

test.describe("the portal's two shells", () => {
  test("a mobile request gets the tab bar and no sidebar", async ({ page }) => {
    await signIn(page);
    await useShell(page, "mobile");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/home");

    const tabBar = page.getByRole("navigation", { name: "Primary" });
    await expect(tabBar).toBeVisible();
    await expect(tabBar.getByRole("link", { name: "Dashboard" })).toBeVisible();

    // The acceptance criterion is stronger than "the sidebar is hidden": the
    // mobile response must not carry it at all, which is what makes the two
    // shells worth having rather than one tree with `hidden md:block` on it.
    await expect(
      page.getByRole("button", { name: /toggle sidebar/i }),
    ).toHaveCount(0);
  });

  test("every destination stays reachable through the More sheet", async ({
    page,
  }) => {
    await signIn(page);
    await useShell(page, "mobile");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/home");

    await page.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    // Administration is nobody's tab-bar entry, so if it is reachable the
    // sheet is doing the job the navigation rules require of it.
    await sheet.getByRole("link", { name: "Administration" }).first().click();
    await expect(page).toHaveURL(/\/portal\/administration/);
  });

  test("the dashboard leads with what needs the reader", async ({ page }) => {
    await signIn(page);
    await useShell(page, "mobile");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/home");

    await expect(
      page.getByRole("heading", { name: "Needs you" }),
    ).toBeVisible();
  });

  test("a desktop request is unchanged", async ({ page }) => {
    await signIn(page);
    await useShell(page, "desktop");
    // A narrow desktop window is still the desktop shell: the decision is the
    // request's, not the viewport's, which is what stops the shell swapping
    // mid-session.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/home");

    await expect(
      page.getByRole("button", { name: /toggle sidebar/i }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
      0,
    );
  });
});
