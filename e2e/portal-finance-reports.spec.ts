// Issue #440: E2E coverage for /portal/finance/reports. The report is a
// read-only, live-computed rollup with no create/edit forms of its own, so
// this covers the page loading with its default (year-to-date) summary cards
// and the date-range filter actually changing what's shown, rather than
// asserting on specific seeded totals that could drift.
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

// hasText does substring matching, and "Income" is also a substring of the
// "Income by source" and "Income and paid spend by event" card titles
// further down the page -- anchor to an exact match so this only ever
// resolves to the one summary card.
function summaryCard(page: Page, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', {
      hasText: new RegExp(`^${escaped}$`),
    }),
  });
}

test.describe("portal finance reports", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the Financial Reports page with year-to-date figures", async ({
    page,
  }) => {
    await page.goto("/portal/finance/reports");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Financial Reports",
        exact: true,
      }),
    ).toBeVisible();

    for (const title of [
      "Income",
      "Expenses paid",
      "Net",
      "In-kind donations",
    ]) {
      await expect(summaryCard(page, title)).toBeVisible();
    }
  });

  test("filtering to a date range with no records empties the breakdown tables, and resetting restores year-to-date", async ({
    page,
  }) => {
    await page.goto("/portal/finance/reports");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Financial Reports",
        exact: true,
      }),
    ).toBeVisible();

    // The summary cards still render (at $0.00) for a period with nothing
    // in it -- only the breakdown tables switch to their empty-state copy.
    await page.getByRole("button", { name: "Filters" }).click();
    const filtersSheet = page.getByRole("dialog");
    await filtersSheet.getByLabel("From").fill("2000-01-01");
    await filtersSheet.getByLabel("To").fill("2000-01-02");
    await filtersSheet.getByRole("button", { name: "Filter" }).click();

    await expect(page).toHaveURL(/from=2000-01-01&to=2000-01-02/);
    await expect(summaryCard(page, "Income")).toContainText("$0.00");
    await expect(
      page.getByText("No revenue recorded in this period."),
    ).toBeVisible();
    await expect(
      page.getByText("Nothing recorded in this period."),
    ).toBeVisible();

    // Reopening races the filter navigation: "Reset to this year" only
    // renders once hasCustomRange is true, and a click landing while the
    // filtered page is still committing is dropped along with the Sheet's
    // client-side open state, so the sheet silently never opens. Retry the
    // open until it sticks rather than waiting out the test timeout on a
    // sheet that was never going to appear.
    // The reset control is rendered as an <a>, but the Button primitive it's
    // built from sets an explicit role="button" whenever nativeButton={false}
    // -- see src/components/ui/button.tsx and node_modules/@base-ui/react's
    // useButton -- so it's exposed as "button", not "link".
    const resetButton = page
      .getByRole("dialog")
      .getByRole("button", { name: "Reset to this year" });
    await expect(async () => {
      // Both steps are bounded so a failed attempt ends the iteration and
      // lets toPass retry, instead of hanging until the test timeout.
      await page
        .getByRole("button", { name: "Filters" })
        .click({ timeout: 2_000 });
      await expect(resetButton).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await resetButton.click();

    await expect(page).toHaveURL(/\/portal\/finance\/reports$/);
    await expect(
      page.getByText("No revenue recorded in this period."),
    ).not.toBeVisible();
  });
});
