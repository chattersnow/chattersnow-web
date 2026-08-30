// Issue #443: E2E coverage for /portal/calendar/work-queue, the content
// calendar's primary workflow page.
//
// Everything here leans on the two calendar items seeded by
// supabase/seed.sql rather than creating its own:
//
//   - "Winter Gear Swap Promotion" -- a Tier 1 item whose content
//     opportunity is in `draft` with admin@example.test as both owner and
//     reviewer, which is what puts it in the My work tab.
//   - "Sample Recurring Observance" -- a Tier 1 item with no content
//     opportunity at all, so it only ever shows in the Upcoming queue.
//
// The seed never sets the opportunity's draft/review due columns, so
// effectiveDueDate() is null and overdueStage() returns null for it. That
// makes both rows reliable negative probes for the Overdue only filter.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

const SEEDED_OPPORTUNITY = "Winter Gear Swap Promotion";
const SEEDED_OBSERVANCE = "Sample Recurring Observance";

test.describe("portal calendar work queue", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("defaults to My work and lists the signed-in user's own content work", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/work-queue");

    await expect(
      page.getByRole("heading", { level: 1, name: "Work queue", exact: true }),
    ).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: SEEDED_OPPORTUNITY });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Content opportunity");
    await expect(row).toContainText("Tier 1");
    await expect(row).toContainText("Draft");
    // Owner and reviewer both resolve to the signed-in admin -- that pairing
    // is exactly what isMyContentWork() keys off.
    await expect(row).toContainText("admin@example.test");
    // No lead-time due dates are seeded, so the Due cell stays empty.
    await expect(row).toContainText("—");

    // Overdue only is an Upcoming queue control; it isn't rendered here.
    await expect(
      page.getByRole("button", { name: "Overdue only" }),
    ).toHaveCount(0);
  });

  test("switches to the upcoming queue, which is not scoped to the current user", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/work-queue");

    // The tab controls are Links rendered through the Button primitive with
    // nativeButton={false}, so they're exposed as buttons, not links.
    await page.getByRole("button", { name: "Upcoming queue" }).click();
    await expect(page).toHaveURL(/\/work-queue\?tab=queue$/);

    await expect(
      page.getByRole("row").filter({ hasText: SEEDED_OPPORTUNITY }),
    ).toBeVisible();
    // Only shows up here: it has no content opportunity, so it can't be
    // anyone's My work item.
    await expect(
      page.getByRole("row").filter({ hasText: SEEDED_OBSERVANCE }),
    ).toBeVisible();
  });

  test("filters the upcoming queue down to overdue work", async ({ page }) => {
    await page.goto("/portal/calendar/work-queue?tab=queue");

    await expect(
      page.getByRole("row").filter({ hasText: SEEDED_OPPORTUNITY }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Overdue only" }).click();
    await expect(page).toHaveURL(/\/work-queue\?tab=queue&filter=overdue$/);

    // Neither seeded row survives the filter: the observance has no content
    // opportunity, and the promotion's stage due date was never set, so
    // nothing about it has "passed".
    await expect(
      page.getByRole("row").filter({ hasText: SEEDED_OPPORTUNITY }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("row").filter({ hasText: SEEDED_OBSERVANCE }),
    ).toHaveCount(0);

    // Clearing the filter restores the unfiltered queue.
    await page.getByRole("button", { name: "Overdue only" }).click();
    await expect(page).toHaveURL(/\/work-queue\?tab=queue$/);
    await expect(
      page.getByRole("row").filter({ hasText: SEEDED_OPPORTUNITY }),
    ).toBeVisible();
  });

  test("links a queued item to its detail page, content brief included", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/work-queue");

    await page
      .getByRole("button", { name: `View ${SEEDED_OPPORTUNITY}` })
      .click();

    // Since #467 the row's View action is a link to the item's dedicated
    // detail page, where the content brief is a flat always-visible section
    // rather than a sheet tab.
    await expect(page).toHaveURL(/\/portal\/calendar\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: SEEDED_OPPORTUNITY }),
    ).toBeVisible();
    await expect(
      page.getByText("Promote the upcoming gear swap and registration link."),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Show how shared gear helps neighbors participate outdoors.",
      ),
    ).toBeVisible();
    // ReadOnlyField renders a labelled <div>, not a form control, so this
    // reads the value by its id rather than by label.
    await expect(page.locator("#brief-outstanding")).toContainText(
      "Confirm final registration link and accessibility details.",
    );
  });

  test("explains the lead-time stages in its how-to sheet", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/work-queue");

    await page.getByRole("button", { name: "Help for this page" }).click();

    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("heading", { name: "How the work queue works" }),
    ).toBeVisible();
    await expect(sheet.getByText("Who can do this")).toBeVisible();
    await expect(sheet.getByText("Common mistakes")).toBeVisible();
  });
});
