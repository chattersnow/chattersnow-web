import type { Locator, Page } from "@playwright/test";

export type TablePager = { previous: Locator; next: Locator };

/**
 * The pagination controls of the `n`th `PortalDataTable` on the page (the
 * first by default). A page can hold more than one paginated table --
 * Administration's Users page has two -- so the index picks which.
 */
export function pager(page: Page, index = 0): TablePager {
  return {
    previous: page.getByRole("button", { name: "Previous" }).nth(index),
    next: page.getByRole("button", { name: "Next" }).nth(index),
  };
}

/**
 * Pages a `PortalDataTable` until `row` matches something.
 *
 * The portal's tables show ten rows at a time, and a spec has no way to know
 * which page a given row lands on: the list carries whatever the seed
 * created plus whatever other specs are mid-run. Asserting against page one
 * would make such a test pass or fail on the size of the list around it.
 *
 * Rewinds to the first page before searching, because a row the test has
 * just renamed re-sorts and may have moved backwards. The caller still makes
 * its own assertion afterwards; this only gets the row on screen.
 */
export async function revealRow(row: Locator, { previous, next }: TablePager) {
  // Bounded rather than `while (true)` throughout: a control that never
  // settles should end the test at the caller's own assertion rather than by
  // running it out of time.
  for (let guard = 0; guard < 50; guard += 1) {
    if (!(await previous.isVisible()) || (await previous.isDisabled())) break;
    await previous.click();
  }
  for (let guard = 0; guard < 50; guard += 1) {
    if ((await row.count()) > 0) return;
    if (!(await next.isVisible()) || (await next.isDisabled())) return;
    await next.click();
  }
}
