// Issue #440: E2E coverage for /portal/finance/reports. The report is a
// read-only, live-computed rollup with no create/edit forms of its own, so
// this covers the page loading with its default (year-to-date) summary cards
// and the date-range filter actually changing what's shown, rather than
// asserting on specific seeded totals that could drift.
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

function summaryCard(page: Page, title: string) {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: title }),
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

    await page.getByRole("button", { name: "Filters" }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Reset to this year" })
      .click();

    await expect(page).toHaveURL(/\/portal\/finance\/reports$/);
    await expect(
      page.getByText("No revenue recorded in this period."),
    ).not.toBeVisible();
  });
});
