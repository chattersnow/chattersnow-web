import { expect, type Page } from "@playwright/test";

/**
 * Opens whichever portal navigation surface this shell has (#1079).
 *
 * The portal renders one of two shells, chosen by the proxy from the request,
 * and `mobile-chromium` runs every spec against a real phone user-agent -- so
 * a spec that reaches for the sidebar toggle finds nothing there. On a phone
 * the nav is a sheet behind the tab bar's "More" button; on a desktop it is
 * the sidebar, already open unless the reader collapsed it.
 */
export async function openPortalNav(page: Page) {
  const more = page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "More" });
  if (await more.isVisible()) {
    await more.click();
    return;
  }
  const toggle = page.getByRole("button", { name: "Toggle Sidebar" });
  if (await toggle.isVisible()) {
    await toggle.click();
  }
}

/**
 * Signs out from either shell, through the confirmation both now share.
 *
 * The "Log out" control lives in the desktop sidebar's footer and in the
 * mobile sheet, so the nav has to be open before it can be clicked -- on
 * desktop it usually already is, which is what the visibility check is for.
 */
export async function logOutOfPortal(page: Page) {
  const logoutButton = page.getByRole("button", { name: /^Log out$/ });
  if (!(await logoutButton.isVisible())) {
    await openPortalNav(page);
  }
  await logoutButton.click();
  // Logging out asks for confirmation since 355a8f7; the dialog's action
  // button carries the same "Log out" label as the trigger.
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Log out" })
    .click();
  await expect(page).toHaveURL(/\/portal\/login$/);
}
