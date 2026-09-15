// Issue #1079: the portal renders one of two shells, chosen by the proxy from
// the request rather than by the client from the viewport.
//
// The whole point of the `device_override` cookie is that a test forces a
// shell without spoofing a user-agent: UA sniffing is what the cookie exists
// to correct, so a suite that spoofed one would be testing the wrong path.
import type { Locator, Page } from "@playwright/test";
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

    // Sections arrive collapsed, so the sheet opens on a list of sections
    // rather than on every page in the portal at once.
    await expect(sheet.getByRole("link", { name: "Users" })).toHaveCount(0);

    // Administration is nobody's tab-bar entry, so if it is reachable the
    // sheet is doing the job the navigation rules require of it.
    await sheet.getByRole("button", { name: "Administration" }).click();
    await sheet.getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL(/\/portal\/administration\/users/);
  });

  // The other half of the same complaint: the account, theme and log out rows
  // used to trail the tree, so reaching log out meant scrolling past every
  // section in the portal.
  test("the account rows stay on screen however far the menu scrolls", async ({
    page,
  }) => {
    await signIn(page);
    await useShell(page, "mobile");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/home");

    await page.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog");
    const logOut = sheet.getByRole("button", { name: "Log out" });
    await expect(logOut).toBeInViewport();

    // Expanded, Governance alone is longer than the sheet, which is what put
    // the footer off the bottom before.
    await sheet.getByRole("button", { name: "Governance" }).click();
    await sheet.getByRole("link", { name: "Grants" }).scrollIntoViewIfNeeded();
    await expect(logOut).toBeInViewport();
  });

  // Issue #1096: every other modal surface in the app offers a visible exit --
  // 31 sheets render their own control, every dialog keeps the primitive's X.
  // Navigation was the one that did not, on the surface where touch is the
  // only input and Escape is not available.
  test("the More sheet closes from a control you can see and hit", async ({
    page,
  }) => {
    await signIn(page);
    await useShell(page, "mobile");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/home");

    await page.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    const close = sheet.getByRole("button", { name: "Close menu" });
    const box = await close.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await close.click();
    await expect(sheet).toHaveCount(0);
    // Closing is not navigating: the reader who opened the menu to look and
    // then decided to stay put is still where they were.
    await expect(page).toHaveURL(/\/portal\/home/);
  });

  // The other half of #1096: a desktop-classified browser under `md` still
  // gets the sidebar's own sheet, which hid the close button outright.
  test("the sidebar's sheet closes from a control you can see and hit", async ({
    page,
  }) => {
    await signIn(page);
    await useShell(page, "desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/home");

    await page.getByRole("button", { name: /toggle sidebar/i }).click();
    const sheet = page.getByRole("navigation", { name: "Sidebar" });
    await expect(sheet).toBeVisible();

    const close = sheet.getByRole("button", { name: "Close menu" });
    const box = await close.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await close.click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/\/portal\/home/);
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
  // Issue #1115: a form is a sheet on a phone and a dialog at a desk, decided
  // on the server. Layout is the one thing a className unit test cannot check
  // -- `portal-form-surface.dom.test.tsx` asserts the classes are present, and
  // only a real layout says whether they did anything -- so this is the only
  // e2e the primitive gets.
  test("a form fills the width of a phone and pins its submit button", async ({
    page,
  }) => {
    await signIn(page);
    await useShell(page, "mobile");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/inventory/distribution");

    // Only one button carries this name until the surface opens; the submit
    // button inside it shares the label, so every assertion below is scoped.
    await page.getByRole("button", { name: "Record distribution" }).click();
    const surface = page.getByRole("dialog");
    await expect(surface).toBeVisible();

    // Polled rather than read once: the sheet enters on a 200ms transition
    // from `translate-y-[2.5rem]`, so a single `boundingBox()` catches it 40px
    // low and reports a sheet hanging off the bottom of the screen.
    await expect
      .poll(async () => {
        const box = await surface.boundingBox();
        if (!box) return null;
        return {
          x: box.x,
          width: box.width,
          bottom: Math.round(box.y + box.height),
        };
      })
      // Flush to both edges and anchored to the bottom -- the dead space
      // either side of a centred dialog is the thing this replaced.
      .toEqual({ x: 0, width: 390, bottom: 844 });

    // Not the whole screen: the strip of backdrop left showing is what says
    // the sheet is dismissible rather than a page you navigated to.
    const settled = await surface.boundingBox();
    expect(settled?.y ?? 0).toBeGreaterThan(0);

    // The submit button is on screen without scrolling the form, which is what
    // the pinned footer is for.
    await expect(
      surface.getByRole("button", { name: "Record distribution" }),
    ).toBeInViewport();
  });
});

// Issue #1117: the portal's icon buttons are 32px, which is comfortable with a
// mouse and not with a thumb. The mobile shell expands the hit area to 44px
// without moving the button, so these assert the invisible thing -- the
// pseudo-element -- rather than the button's own box.
test.describe("tap targets on a phone", () => {
  function hitArea(target: Locator) {
    return target.evaluate((element) => {
      const after = getComputedStyle(element, "::after");
      return {
        content: after.content,
        width: after.width,
        height: after.height,
      };
    });
  }

  test("a row's disclosure is 44px to a thumb and 24px to the eye", async ({
    page,
  }) => {
    await signIn(page);
    await useShell(page, "mobile");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/governance/board-members");

    // `icon-xs` is the smallest control in the portal and the one a phone hits
    // most, since dropping columns (#1090) is what puts it there.
    const chevron = page
      .getByRole("button", { name: "Show more columns" })
      .first();
    await expect(chevron).toBeVisible();

    const box = await chevron.boundingBox();
    expect(box?.width).toBeLessThan(44);
    const area = await hitArea(chevron);
    expect(area.width).toBe("44px");
    expect(area.height).toBe("44px");
  });

  test("neighbouring icon buttons do not steal each other's taps", async ({
    page,
  }) => {
    await signIn(page);
    await useShell(page, "mobile");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/home");

    const search = page.getByRole("button", { name: "Search the portal" });
    const help = page.getByRole("button", { name: "Help for this page" });
    const searchBox = (await search.boundingBox())!;
    const helpBox = (await help.boundingBox())!;

    // Expanded targets that overlap are worse than small ones: the later
    // sibling paints over its neighbour's visible edge, so a tap that landed
    // on what you aimed at runs the control beside it. Centre to centre has to
    // clear the 44px the targets are.
    const centres =
      helpBox.x + helpBox.width / 2 - (searchBox.x + searchBox.width / 2);
    expect(centres).toBeGreaterThanOrEqual(44);
  });

  test("a desktop request keeps its own targets", async ({ page }) => {
    await signIn(page);
    await useShell(page, "desktop");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/portal/home");

    // The density of a desktop table is why the hit area is a shell concern
    // rather than a button one: the same control grows nothing here.
    const search = page.getByRole("button", { name: "Search the portal" });
    await expect(search).toBeVisible();
    expect((await hitArea(search)).content).toBe("none");
  });
});
