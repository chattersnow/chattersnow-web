// Issue #443: E2E coverage for /portal/calendar/reports (Annual Planning
// Review). The report is read-only and computed live, so this covers the
// page rendering its metric cards for the default year and the year filter
// actually changing what's computed, rather than asserting on totals that
// other specs' fixtures would drift.
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

const METRIC_LABELS = [
  "Tier 1 items with a decision",
  "Planned opportunities completed on time",
  "Overdue content tasks",
  "Median time to first review",
  "Public items with a clear Chatter connection",
  "Publication permissions recorded",
];

// CardTitle renders a plain div, and several labels are substrings of the
// surrounding copy, so anchor each card by an exact-match title.
function metricCard(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', {
      hasText: new RegExp(`^${escaped}$`),
    }),
  });
}

test.describe("portal calendar annual review report", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("renders the current year's planning-cycle metrics", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/reports");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Annual Planning Review",
        exact: true,
      }),
    ).toBeVisible();

    for (const label of METRIC_LABELS) {
      await expect(metricCard(page, label)).toBeVisible();
    }

    // supabase/seed.sql dates "Sample Recurring Observance" (Tier 1, no
    // decision) to today, so the current year always has at least one Tier 1
    // item and the coverage card resolves to a real percentage rather than
    // the zero-denominator dash.
    await expect(
      metricCard(page, "Tier 1 items with a decision"),
    ).toContainText(/\d+%/);
    await expect(metricCard(page, "Overdue content tasks")).toContainText(/\d/);
  });

  test("recomputes for the selected year and shows the empty state for one with no items", async ({
    page,
  }) => {
    // All seeded and test-created calendar items are dated relative to now,
    // so a year this far back is reliably empty.
    const emptyYear = new Date().getUTCFullYear() - 4;

    await page.goto("/portal/calendar/reports");
    await expect(metricCard(page, "Overdue content tasks")).toBeVisible();

    // The year form is server-rendered and its <select> is uncontrolled, so
    // React sets the element's value from defaultValue when it hydrates. A
    // selection made before that lands is reset to the current year, and the
    // plain GET submit then carries the wrong year. Retry the whole
    // select-and-submit -- it's idempotent, and by the second attempt the
    // page is hydrated and the choice sticks.
    await expect(async () => {
      await page
        .getByLabel("Year")
        .selectOption(String(emptyYear), { timeout: 2_000 });
      await page
        .getByRole("button", { name: "View", exact: true })
        .click({ timeout: 2_000 });
      await expect(page).toHaveURL(new RegExp(`\\?year=${emptyYear}$`), {
        timeout: 3_000,
      });
    }).toPass({ timeout: 20_000 });
    await expect(
      page.getByText(`No calendar items in ${emptyYear}.`),
    ).toBeVisible();
    // The empty state replaces the metric grid entirely.
    await expect(metricCard(page, "Overdue content tasks")).toHaveCount(0);

    // The year the form came back with stays selected.
    await expect(page.getByLabel("Year")).toHaveValue(String(emptyYear));
  });
});
