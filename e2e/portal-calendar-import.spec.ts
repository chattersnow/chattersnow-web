// Issue #443: E2E coverage for /portal/calendar/import.
//
// The page has two independent halves. The CSV importer is covered
// end-to-end (parse -> preview -> import -> persisted), using run-unique
// titles because the suite runs fully parallel across two Playwright
// projects against one database.
//
// The missing-recurring-instances half is asserted read-only on purpose:
// "Generate" mutates coverage for a year that every concurrent run shares,
// so the first run to click it would flip the other run's page to the
// "already has an instance" empty state. The generation logic itself is
// covered by calendar/recurrence-actions.integration.test.ts.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

// Far enough out that these rows never collide with the seeded data the
// annual review report and the coverage card read for nearby years.
const IMPORT_YEAR = new Date().getFullYear() + 3;

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

test.describe("portal calendar import", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("lists recurring series with no instance in the target year", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/import");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Calendar Import",
        exact: true,
      }),
    ).toBeVisible();

    // Defaults to next year, where the seeded "Sample Recurring Observance"
    // (dated today, so its only instance is this year) has a coverage gap.
    const nextYear = new Date().getUTCFullYear() + 1;
    await expect(
      page.getByText(`Missing recurring instances for ${nextYear}`),
    ).toBeVisible();
    const gap = page
      .locator("li")
      .filter({ hasText: "Sample Recurring Observance" });
    await expect(gap).toBeVisible();
    await expect(gap.getByRole("button", { name: "Generate" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Generate all for ${nextYear}` }),
    ).toBeVisible();
  });

  test("scopes the coverage gap list to the year in the URL", async ({
    page,
  }) => {
    const currentYear = new Date().getUTCFullYear();
    await page.goto(`/portal/calendar/import?year=${currentYear}`);

    await expect(
      page.getByText(`Missing recurring instances for ${currentYear}`),
    ).toBeVisible();
    // The seeded observance is dated today, so this year is already covered
    // and it drops out of the gap list.
    await expect(
      page.locator("li").filter({ hasText: "Sample Recurring Observance" }),
    ).toHaveCount(0);
    // It's also the only series-keyed Tier 1/2 item in a fresh database --
    // nothing else in the suite creates one, since bulk import deliberately
    // never assigns a series_key -- so the whole card falls to its empty
    // state.
    await expect(
      page.getByText(
        `Every recurring Tier 1/2 observance already has a ${currentYear} instance.`,
      ),
    ).toBeVisible();
  });

  test("parses pasted CSV, reports skipped rows, and imports the valid ones as drafts", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const observanceTitle = `E2E Import Observance ${suffix}`;
    const campaignTitle = `E2E Import Campaign ${suffix}`;
    const csv = [
      "title,item_type,starts_at,ends_at,time_zone,recurrence_rule,priority_tier,category,region",
      `${observanceTitle},community_observance,${IMPORT_YEAR}-03-14T00:00:00Z,,America/Denver,,2,lgbtq_community,us`,
      `${campaignTitle},content_campaign,${IMPORT_YEAR}-04-02T00:00:00Z,,America/Denver,,3,chatter_events,`,
      `E2E Import Rejected ${suffix},not_a_type,${IMPORT_YEAR}-05-01T00:00:00Z,,America/Denver,,2,lgbtq_community,us`,
    ].join("\n");

    await page.goto("/portal/calendar/import");

    const importButton = page.getByRole("button", {
      name: /^Import \d+ items? as drafts$/,
    });
    await expect(importButton).toBeDisabled();

    await page.getByLabel("Or paste CSV").fill(csv);
    await page.getByRole("button", { name: "Parse" }).click();

    await expect(page.getByText("2 valid rows, 1 row skipped")).toBeVisible();
    // Row numbers are 1-based over the file, so the header is row 1.
    await expect(
      page.getByText('row 4: invalid item_type "not_a_type"'),
    ).toBeVisible();

    const previewRow = page
      .getByRole("row")
      .filter({ hasText: observanceTitle });
    await expect(previewRow).toContainText(`${IMPORT_YEAR}-03-14`);
    await expect(previewRow).toContainText("Tier 2");
    await expect(previewRow).toContainText("lgbtq_community");
    await expect(previewRow).toContainText("us");
    // The rejected row never reaches the preview table.
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: `E2E Import Rejected ${suffix}` }),
    ).toHaveCount(0);

    // A source is required for the batch, so the import stays blocked until
    // one is given even with valid rows parsed.
    await expect(
      page.getByRole("button", { name: "Import 2 items as drafts" }),
    ).toBeDisabled();
    await page.getByLabel("Source").fill(`E2E import ${suffix}`);
    await page
      .getByRole("button", { name: "Import 2 items as drafts" })
      .click();

    await expect(page.getByText("Imported 2 items as drafts.")).toBeVisible();
    // The panel resets: preview cleared, nothing left to submit.
    await expect(page.getByText("2 valid rows, 1 row skipped")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Import 0 items as drafts" }),
    ).toBeDisabled();

    // Both rows really landed. The work queue's Upcoming tab lists every
    // non-archived calendar item, so it shows imported drafts as-is.
    await page.goto("/portal/calendar/work-queue?tab=queue");
    await expect(
      page.getByRole("row").filter({ hasText: observanceTitle }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: campaignTitle }),
    ).toBeVisible();
  });

  test("explains that imported items are never published automatically", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/import");

    await page.getByRole("button", { name: "How this works" }).click();

    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("heading", { name: "How calendar import works" }),
    ).toBeVisible();
    await expect(sheet.getByText("What happens downstream")).toBeVisible();
    await expect(sheet.getByText("Common mistakes")).toBeVisible();
  });
});
