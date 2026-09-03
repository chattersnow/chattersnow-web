import type { Locator, Page } from "@playwright/test";

/**
 * The open modal (Dialog or Sheet), excluding toasts.
 *
 * Base UI toasts render with role="dialog" (role="alertdialog" for errors) so
 * keyboard users can reach them with F6, which means a bare
 * `getByRole("dialog")` also matches the "Saved." confirmation that appears
 * the moment a form dialog closes -- exactly when specs assert that the
 * dialog is gone. The toast root carries data-slot="toast" for this reason.
 */
export function modal(page: Page): Locator {
  return page
    .getByRole("dialog")
    .and(page.locator(':not([data-slot="toast"])'));
}
