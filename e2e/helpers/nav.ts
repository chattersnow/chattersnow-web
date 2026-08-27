import type { Page } from "@playwright/test";

// The public site nav renders two different DOM shapes depending on
// viewport: a desktop NavigationMenu (grouped items sit behind a trigger
// button) that's hidden below the `sm` breakpoint, and a flat off-canvas
// Sheet menu opened via an "Open menu" button on narrower viewports, where
// grouped links are direct children with no intermediate trigger. This
// opens whichever is present, then clicks the target link.
export async function clickNavLink(
  page: Page,
  linkName: string,
  opts?: { group?: string },
) {
  const menuTrigger = page.getByRole("button", { name: "Open menu" });
  if (await menuTrigger.isVisible()) {
    await menuTrigger.click();
  } else if (opts?.group) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: opts.group })
      .click();
  }

  const link = page
    .getByRole("navigation")
    .getByRole("link", { name: linkName, exact: true });
  // The mobile off-canvas menu can be taller than the viewport; its own
  // scroll container doesn't always get auto-scrolled by click()'s
  // actionability check, so scroll explicitly first.
  await link.scrollIntoViewIfNeeded();
  await link.click();
}
