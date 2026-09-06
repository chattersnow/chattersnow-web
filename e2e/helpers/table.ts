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
 * sweep below would then take that for "not here" and step past the page the
 * row is actually on.
 */
async function turnPage({ status }: TablePager, control: Locator) {
  const before = (await status.textContent())?.trim();
  await control.click();
  await expect
    .poll(async () => (await status.textContent())?.trim(), { timeout: 10_000 })
    .not.toBe(before);
}

/** One rewind-and-search sweep over a table's pages. */
async function sweep(row: Locator, tablePager: TablePager) {
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

/**
 * Pages a paginated table until `row` is on screen.
 *
 * The portal's tables show ten rows at a time, and a spec has no way to know
 * which page a given row lands on: the list carries whatever the seed
 * created plus whatever other specs are mid-run. Asserting against page one
 * would make such a test pass or fail on the size of the list around it.
 *
 * Rewinds to the first page before searching, because a row the test has
 * just renamed re-sorts and may have moved backwards.
 *
 * Retried as a whole, and it does not return until the row is visible. A
 * single sweep is not enough: on a page that has not finished rendering
 * there is no Previous/Next yet, which reads exactly like a table with one
 * page, so the sweep would return "not here" without ever paging -- and the
 * caller's own assertion would then fail on a row that was only ever two
 * pages away. Retrying also re-finds a row that moved while the sweep was
 * walking, which the specs' concurrent fixtures can do at any moment.
 */
export async function revealRow(row: Locator, tablePager: TablePager) {
  await expect(async () => {
    await sweep(row, tablePager);
    await expect(row.first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * Clicks a control that lives in a row of a `stickyFirstColumn` table.
 *
 * Those tables pin the row's name cell over whatever scrolls under it, which
 * is the point of the feature -- you can reach the actions on a phone
 * without losing track of which row you are on. Playwright clicks an
 * element's centre, though, and for a control in a later column that centre
 * can sit under the pinned cell, where the click is refused ("<td ...>
 * intercepts pointer events") for as long as the test will let it retry.
 *
 * A person scrolls the control clear before reaching for it. Aligning it
 * with the right edge of its scroll container does the same, and is a no-op
 * on a table that fits.
 */
export async function clickRowControl(control: Locator) {
  await control.evaluate((element) =>
    element.scrollIntoView({ block: "nearest", inline: "end" }),
  );
  await control.click();
}
