import { expect, type Page } from "@playwright/test";

// The public site nav renders two different DOM shapes depending on
// viewport: a desktop NavigationMenu (grouped items sit behind a trigger
// button) that's hidden below the `lg` breakpoint, and a flat off-canvas
// Sheet menu opened via an "Open menu" button on narrower viewports, where
// grouped links are direct children with no intermediate trigger. This
// opens whichever is present, then clicks the target link.
//
// Scoped to the nav named "Main" rather than any navigation landmark: the
// footer is a <nav> too, and its links reuse the section labels ("Events",
// "Gear", "Contact"...), so an unscoped query matches two elements and trips
// Playwright's strict mode. Only one "Main" nav is in the accessibility tree
// at a time -- whichever of the two the breakpoint has not display:none'd.
export async function clickNavLink(
  page: Page,
  linkName: string,
  opts?: { group?: string },
) {
  const mainNav = page.getByRole("navigation", { name: "Main" });
  const menuTrigger = page.getByRole("button", { name: "Open menu" });

  // The shape is read only once one of the two is actually on screen (#1294).
  // `isVisible()` does not retry, and this runs straight after a navigation:
  // sampled before the header paints, it answers "no" for the mobile trigger
  // on a mobile run, and the desktop branch below then clicks a group trigger
  // this viewport does not have.
  //
  // Polled on the predicate rather than `menuTrigger.or(mainNav)`: the shape
  // this viewport is not using is `display:none`, not absent, so an `.or()`
  // can resolve to the hidden one and assert visibility of the wrong shell.
  await expect
    .poll(
      async () =>
        (await menuTrigger.isVisible()) || (await mainNav.isVisible()),
    )
    .toBe(true);

  if (await menuTrigger.isVisible()) {
    await menuTrigger.click();
  } else if (opts?.group) {
    await mainNav.getByRole("button", { name: opts.group }).click();
  }

  // Two places the link can be. Top-level items and every mobile-sheet item
  // are inside the "Main" nav, but Base UI portals the desktop dropdown panel
  // to the end of <body> -- into its own unlabelled <nav> -- so a dropdown
  // child is not a descendant of the nav its trigger lives in. Matching both,
  // rather than any navigation landmark, still keeps the footer out.
  const link = page
    .locator('nav[aria-label="Main"], [data-slot="navigation-menu-content"]')
    .getByRole("link", { name: linkName, exact: true });
  // The mobile off-canvas menu can be taller than the viewport; its own
  // scroll container doesn't always get auto-scrolled by click()'s
  // actionability check, so scroll explicitly first.
  await link.scrollIntoViewIfNeeded();
  await link.click();
}
