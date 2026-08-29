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

// The portal shell hydrates with a known server/client mismatch
// (SidebarInset vs Sidebar, logged on every portal route in CI), so React
// discards and regenerates that subtree on the client. A click that lands in
// that window hits a SheetTrigger whose handler isn't attached yet and is
// dropped silently: the sheet never opens, and a `dialog` locator then waits
// out the whole test timeout with nothing to show for it.
//
// The second open below is the one that kept losing this race in CI -- the
// Filter submit is a native <form method="get">, so it goes through a full
// page navigation, and every assertion between it and the next click is on
// server-rendered markup that is happily present mid-hydration. Retry the
// open until the sheet is really on screen rather than trusting one click.
async function openFiltersSheet(page: Page) {
  const sheet = page.getByRole("dialog");

  await expect(async () => {
    if (await sheet.isVisible()) return;
    await page
      .getByRole("button", { name: "Filters" })
      .click({ timeout: 2_000 });
    await expect(sheet).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 10_000 });

  return sheet;
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
    const filtersSheet = await openFiltersSheet(page);
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

    const resetSheet = await openFiltersSheet(page);
    // Rendered as an <a>, but the Button primitive it's built from sets an
    // explicit role="button" whenever nativeButton={false} -- see
    // src/components/ui/button.tsx and node_modules/@base-ui/react's
    // useButton -- so this is exposed as "button", not "link".
    await resetSheet
      .getByRole("button", { name: "Reset to this year" })
      .click();

    await expect(page).toHaveURL(/\/portal\/finance\/reports$/);
    await expect(
      page.getByText("No revenue recorded in this period."),
    ).not.toBeVisible();
  });
});
