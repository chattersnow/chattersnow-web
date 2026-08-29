// Issue #467: calendar item details moved from a Sheet into a dedicated
// /portal/calendar/[itemId] page (flat always-visible Card sections), with
// editing kept on a Sheet opened from the page. Leans on the two calendar
// items seeded by supabase/seed.sql:
//
//   - "Winter Gear Swap Promotion" -- Tier 1, active, with categories, a
//     linked program, and a content opportunity in `draft`.
//   - "Sample Recurring Observance" -- Tier 1 with structured recurrence
//     (series_key + recurrence month/day), which is what unlocks the
//     "Generate next year" header action.
//
// Everything here is read-only against the seed: nothing saves, deletes,
// duplicates, or generates, so the suite can't corrupt later specs.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

const SEEDED_OPPORTUNITY = "Winter Gear Swap Promotion";
const SEEDED_OBSERVANCE = "Sample Recurring Observance";

const SECTION_TITLES = [
  "Schedule & details",
  "Planning & decision",
  "Sensitive topic",
  "Content brief",
  "Related items",
];

test.describe("portal calendar item detail page", () => {
  test("navigates from the list view to a flat, section-based detail page", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/portal/calendar");

    await page
      .getByRole("button", { name: `View ${SEEDED_OPPORTUNITY}` })
      .click();

    await expect(page).toHaveURL(/\/portal\/calendar\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: SEEDED_OPPORTUNITY }),
    ).toBeVisible();

    // Every section is a flat, always-visible card -- no tabs anywhere.
    for (const title of SECTION_TITLES) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("tab")).toHaveCount(0);

    // Spot-check seeded values across sections.
    await expect(
      page.getByText("Promote the upcoming gear swap and registration link."),
    ).toBeVisible();
    await expect(
      page.getByText("Directly supports participant access and event turnout."),
    ).toBeVisible();
    await expect(page.getByText("Not flagged")).toBeVisible();

    // The back link returns to the calendar list (a Link rendered through
    // the Button primitive, so it's exposed as a button). Scoped to the main
    // content area: the sidebar has its own "Calendar" nav entry.
    await page
      .getByRole("main")
      .getByRole("button", { name: "Calendar", exact: true })
      .click();
    await expect(page).toHaveURL(/\/portal\/calendar(\?.*)?$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Calendar", exact: true }),
    ).toBeVisible();
  });

  test("keeps editing on a sheet opened from the page", async ({ page }) => {
    await signIn(page);
    await page.goto("/portal/calendar");
    await page
      .getByRole("button", { name: `View ${SEEDED_OPPORTUNITY}` })
      .click();

    await page.getByRole("button", { name: "Edit", exact: true }).click();

    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("heading", { name: SEEDED_OPPORTUNITY }),
    ).toBeVisible();
    await expect(sheet.getByLabel("Title")).toHaveValue(SEEDED_OPPORTUNITY);
    await expect(
      sheet.getByRole("button", { name: "Save changes" }),
    ).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Archive" })).toBeVisible();

    // Close without touching anything -- no dirty-state prompt expected.
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();
  });

  test("offers Generate next year only for structured-recurrence items", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/portal/calendar");
    await page
      .getByRole("button", { name: `View ${SEEDED_OBSERVANCE}` })
      .click();

    await expect(
      page.getByRole("heading", { level: 1, name: SEEDED_OBSERVANCE }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generate next year" }),
    ).toBeVisible();
  });

  test("hides mutation controls from a view-only role", async ({ page }) => {
    await signIn(page, { email: "volunteer@example.test" });
    await page.goto("/portal/calendar");
    await page
      .getByRole("button", { name: `View ${SEEDED_OPPORTUNITY}` })
      .click();

    await expect(
      page.getByRole("heading", { level: 1, name: SEEDED_OPPORTUNITY }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Duplicate" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Delete calendar item" }),
    ).toHaveCount(0);
  });
});
