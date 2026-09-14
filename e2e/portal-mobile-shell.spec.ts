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

// Its own describe because it needs a touch context. The other tests force a
// shell with the cookie; this one is about what the probe decides on its own,
// and the probe deliberately ignores a narrow *desktop* window -- so resizing
// the default desktop browser would exercise the wrong branch entirely.
test.describe("a phone that gets rotated", () => {
  test.use({ viewport: { width: 430, height: 932 }, hasTouch: true });

  // Reported from a real iPhone and reproduced against the deployed site.
  // DeviceProbe measured `window.innerWidth`, which a rotation changes: an
  // iPhone 15 Pro Max is 430px in portrait and 932px in landscape, so turning
  // the phone once wrote `device_override=desktop`, and the next navigation --
  // back in portrait -- served the desktop shell at 430px, which is a layout
  // you have to zoom out to read. It righted itself a navigation later, which
  // is what made it look intermittent rather than broken.
  test("keeps the mobile shell through a rotation", async ({ page }) => {
    await signIn(page);

    // Two loads to start: the user-agent here is a desktop one, so the first
    // response is the desktop shell and the probe corrects it. That is the
    // documented behaviour -- the point of this test is what happens after.
    await page.goto("/portal/home");
    await page.goto("/portal/home");
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto("/portal/home");
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto("/portal/home");

    // Asserted on what the portrait navigation was *served*, not on the
    // cookie: the probe rewrites the cookie back on that very page, so a
    // cookie assertion passes against the broken code too.
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /toggle sidebar/i }),
    ).toHaveCount(0);
  });
});

// Issue #1090: a wide table is carried onto a phone by dropping columns, and
// dropping a column is only honest if the value it dropped is still reachable.
test.describe("portal tables on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a dropped column comes back through the row's disclosure", async ({
    page,
  }) => {
    await signIn(page);
    await useShell(page, "mobile");
    await page.goto("/portal/governance/board-members");

    // Term start and term end are `hideBelow`, so the phone never shows them
    // as columns of their own.
    await expect(
      page.getByRole("columnheader", { name: "Term start" }),
    ).toBeHidden();

    const row = page.getByRole("row").filter({ hasText: "Secretary" }).first();
    await row.getByRole("button", { name: "Show more columns" }).click();

    const detail = page.locator("tr[data-row-detail]").first();
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Term start");
    await expect(detail).toContainText("Term end");
  });

  test("inventory opens on the gallery, and the toggle still wins", async ({
    page,
  }) => {
    await signIn(page);
    await useShell(page, "mobile");
    await page.goto("/portal/inventory/items");

    // The photograph is what identifies a gear item, so on a 390px screen a
    // 2-up grid beats a table read through a sideways scroll. It is only the
    // starting point: the toggle and its stored choice still decide.
    //
    // Named by a column of the items table rather than by `table`: the page
    // also carries a short value-by-status aggregate that neither view
    // touches.
    const itemsTable = page.getByRole("columnheader", { name: "Description" });
    await expect(itemsTable).toHaveCount(0);

    await page.getByRole("button", { name: "List view" }).click();
    await expect(itemsTable).toBeVisible();

    // The stored choice survives a fresh request, where the server is still
    // saying `mobile`.
    await page.reload();
    await expect(itemsTable).toBeVisible();
  });
});
