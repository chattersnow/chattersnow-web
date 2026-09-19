import { expect, type Locator, type Page } from "@playwright/test";

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

/**
 * Waits for every toast to leave the screen.
 *
 * The toast viewport is `fixed bottom-4` and, below `sm`, nearly the full
 * viewport width, so on a mobile run it covers whatever sits at the bottom of
 * the page -- and Playwright refuses a click whose target another element
 * would receive. A spec that writes twice and then clicks a control in the
 * table underneath is racing the confirmations' auto-dismiss, and which side
 * wins depends on where the row happens to land, which depends on the
 * tenant's typography (#1260).
 *
 * Waiting them out rather than clicking each Dismiss: the stack collapses
 * behind the frontmost toast, so the ones underneath are not reliably
 * clickable, and the auto-dismiss is what a reader experiences anyway.
 *
 * The mouse has to be moved out of the way first, and that is not a nicety
 * (#1283). Base UI pauses every toast's dismissal timer while the pointer is
 * over the viewport -- `onMouseEnter`/`onMouseMove` call `pauseTimers()`, and
 * only `mouseleave` resumes them -- which is the right behaviour for a reader
 * reaching for Dismiss and fatal here. Playwright leaves the cursor wherever
 * it last clicked, and on a phone-width viewport the toast stack is nearly the
 * full width at the bottom of the page, so a click low in the table parks the
 * cursor inside it. The toasts then never dismiss at all, and this waits out
 * its whole timeout on a stack that is deliberately frozen: the failure reads
 * as "two toasts outlived the wait" when nothing was counting down.
 */
export async function toastsCleared(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-slot="toast"]')).toHaveCount(0, {
    timeout: 15_000,
  });
}
