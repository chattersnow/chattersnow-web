import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { seedPortalUser } from "./helpers/rbac";

test.describe("portal administration audit log", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the Audit Log page", async ({ page }) => {
    await page.goto("/portal/administration/audit-log");

    await expect(
      page.getByRole("heading", { level: 1, name: "Audit Log", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Occurred at" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Actor" }),
    ).toBeVisible();
  });

  test("an admin action lands in the audit log and can be filtered to", async ({
    page,
  }) => {
    test.slow();

    const admin = createAdminClient();
    const user = await seedPortalUser(admin);

    try {
      await page.goto("/portal/administration/users");
      const row = page.getByRole("row").filter({ hasText: user.fullName });
      await row.getByRole("button", { name: "Add role", exact: true }).click();
      await row.getByRole("combobox", { name: "Add role" }).click();
      await page
        .getByRole("option", { name: "Volunteer", exact: true })
        .click();
      await row.getByRole("button", { name: "Add", exact: true }).click();
      // The badge's remove button only exists once the assignment has landed
      // and the list has refreshed -- unlike the row's text, which shows
      // "Volunteer" as soon as it's picked in the still-open select.
      await expect(
        row.getByRole("button", { name: "Remove Volunteer" }),
      ).toBeVisible();

      // The audit entry is keyed by the user_roles row's own id, which only
      // the database knows -- read it back so the assertion pins the exact
      // entry this test produced rather than any user_roles write that the
      // other Playwright project happened to make at the same time.
      const { data: grant, error } = await admin
        .from("user_roles")
        .select("id")
        .eq("user_id", user.userId)
        .single();
      if (error) throw error;
      const recordId = grant.id as string;

      await page.goto("/portal/administration/audit-log");
      await page.getByRole("button", { name: /^Filters/ }).click();
      await page.getByLabel("Table").selectOption("user_roles");
      await page.getByLabel("Action").selectOption("insert");
      await page.getByRole("button", { name: "Filter", exact: true }).click();

      await expect(page).toHaveURL(/table=user_roles/);
      const entryRow = page
        .getByRole("row")
        .filter({ hasText: recordId.slice(0, 8) });
      await expect(entryRow).toBeVisible();
      await expect(entryRow).toContainText("User roles");
      await expect(entryRow).toContainText("admin@example.test");

      // Submitting the filters is a full page load, so this click can land
      // before the page has hydrated -- the trigger has no handler yet and
      // the click is simply lost. Retry until the sheet actually opens.
      const detailSheet = page.getByRole("dialog");
      await expect(async () => {
        await entryRow
          .getByRole("button", { name: "View entry details" })
          .click();
        await expect(detailSheet).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });

      await expect(detailSheet).toContainText(recordId);
      await expect(detailSheet).toContainText(user.userId);
    } finally {
      await user.cleanup();
    }
  });

  test("clearing filters restores the unfiltered log", async ({ page }) => {
    await page.goto(
      "/portal/administration/audit-log?table=user_roles&action=delete",
    );

    await expect(page.getByRole("button", { name: /^Filters/ })).toContainText(
      "2",
    );

    await page.getByRole("button", { name: /^Filters/ }).click();
    // Rendered as a Link, but Base UI's Button gives it role="button".
    await page.getByRole("button", { name: "Clear", exact: true }).click();

    await expect(page).toHaveURL(/\/portal\/administration\/audit-log$/);
    // Clearing navigates client-side, which leaves the sheet mounted and
    // open -- and while it is, it holds the rest of the page aria-hidden,
    // where no role-based locator can reach the Filters trigger.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Filters/ }),
    ).not.toContainText("2");
  });
});
