import type { Locator, Page } from "@playwright/test";
import { expect } from "./test";

export type TablePager = { previous: Locator; next: Locator; status: Locator };

/**
 * The pagination controls of the `n`th paginated table on the page (the
 * first by default). A page can hold more than one -- Administration's Users
 * page has two -- so the index picks which.
 */
export function pager(page: Page, index = 0): TablePager {
  return {
    previous: page.getByRole("button", { name: "Previous" }).nth(index),
    next: page.getByRole("button", { name: "Next" }).nth(index),
    status: page
      .getByRole("status")
      .filter({ hasText: /Page \d+ of \d+/ })
      .nth(index),
  };
}

/**
 * Clicks a pager control and waits for the page to actually turn.
 *
 * Both table variants need this. `PortalDataTable` pages in client state, so
 * the new rows arrive a render later; the server-paginated tables page by
 * navigating, so they arrive a round trip later. Either way a `count()` fired
 * straight after the click can still see the page it just left -- and the
 * search loop below would then take that for "not here" and step past the
 * page the row is actually on.
 */
async function turnPage({ status }: TablePager, control: Locator) {
  const before = (await status.textContent())?.trim();
  await control.click();
  await expect
    .poll(async () => (await status.textContent())?.trim(), { timeout: 10_000 })
    .not.toBe(before);
}

/**
 * Pages a paginated table until `row` matches something.
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
export async function revealRow(row: Locator, tablePager: TablePager) {
  const { previous, next } = tablePager;
  // Bounded rather than `while (true)` throughout: a control that never
  // settles should end the test at the caller's own assertion rather than by
  // running it out of time.
  for (let guard = 0; guard < 50; guard += 1) {
    if (!(await previous.isVisible()) || (await previous.isDisabled())) break;
    await turnPage(tablePager, previous);
  }
  for (let guard = 0; guard < 50; guard += 1) {
    if ((await row.count()) > 0) return;
    if (!(await next.isVisible()) || (await next.isDisabled())) return;
    await turnPage(tablePager, next);
  }
}
