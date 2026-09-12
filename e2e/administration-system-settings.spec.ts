import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { portalMain } from "./helpers/regions";

const EXPENSE_THRESHOLD_KEY = "finance.expense_approval_threshold";

test.describe("portal administration system settings", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads System Settings and switches between its tabs", async ({
    page,
  }) => {
    await page.goto("/portal/administration/system-settings");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "System Settings",
        exact: true,
      }),
    ).toBeVisible();

    // The page opens on Organization (the fiscal year setting); the approval
    // thresholds moved behind "Workflow settings" when that tab was added.
    await expect(
      page.getByRole("tab", { name: "Organization" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Fiscal year starts in")).toBeVisible();

    await page.getByRole("tab", { name: "Workflow settings" }).click();
    await expect(page.getByText("Expense approval threshold")).toBeVisible();
    await expect(
      page.getByText("Reimbursement approval threshold"),
    ).toBeVisible();
    await expect(portalMain(page).locator("#expense-threshold")).toBeVisible();

    await page.getByRole("tab", { name: "Branding" }).click();
    await expect(page.getByLabel("Logo URL")).toBeVisible();

    await page.getByRole("tab", { name: "Data" }).click();
    await expect(page.getByText("Download export")).toBeVisible();
  });

  // #947: eight panels that could not be linked, bookmarked or returned to.
  test("a tab is addressable, survives a reload, and comes back with Back", async ({
    page,
  }) => {
    // Deep link straight into a panel, which is what every cross-link in the
    // portal now does -- the finance pages point at Workflow settings, the
    // Website editor at Page visibility and Legal documents.
    await page.goto("/portal/administration/system-settings?tab=branding");
    await expect(page.getByRole("tab", { name: "Branding" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByLabel("Logo URL")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("tab", { name: "Branding" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.getByRole("tab", { name: "Legal documents" }).click();
    await expect(page).toHaveURL(/\?tab=legal$/);
    await page.goBack();
    await expect(page).toHaveURL(/\?tab=branding$/);
    await expect(page.getByRole("tab", { name: "Branding" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // A hand-edited or stale value falls back rather than rendering nothing.
    await page.goto("/portal/administration/system-settings?tab=nonsense");
    await expect(
      page.getByRole("tab", { name: "Organization" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  // app_settings rows are a global singleton -- unlike every other fixture in
  // these specs there's no per-test copy to mutate, so two Playwright
  // projects running this concurrently against the one Supabase instance
  // would overwrite each other's value between the save and the reload.
  // Pinned to a single project (still covered on every PR, since the PR
  // suite runs chromium) and restored afterwards.
  test("saves an approval threshold and persists it", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Mutates a global app_settings row; see comment above.",
    );

    const admin = createAdminClient();
    const { data: original } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", EXPENSE_THRESHOLD_KEY)
      .maybeSingle();

    try {
      await page.goto("/portal/administration/system-settings");
      await page.getByRole("tab", { name: "Workflow settings" }).click();

      // `has:` is matched relative to each candidate form, so its locator
      // stays page-rooted; scoping the forms themselves is what keeps the
      // streamed copy of the page out (see portalMain).
      const expenseForm = portalMain(page)
        .locator("form")
        .filter({ has: page.locator("#expense-threshold") });
      await expenseForm.locator("#expense-threshold").fill("321.5");
      await expenseForm.getByRole("button", { name: "Save" }).click();

      // Saves confirm with a toast at the page root, not an inline alert
      // in the form.
      await expect(
        page.getByRole("region", { name: "Notifications" }),
      ).toContainText("Expense approval threshold updated.");

      // The tab is in the URL since #947, so the reload comes back to it
      // rather than dropping to Organization.
      await page.reload();
      await expect(
        page.getByRole("tab", { name: "Workflow settings" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(portalMain(page).locator("#expense-threshold")).toHaveValue(
        "321.5",
      );
    } finally {
      if (original) {
        await admin
          .from("app_settings")
          .update({ value: original.value })
          .eq("key", EXPENSE_THRESHOLD_KEY);
      } else {
        await admin
          .from("app_settings")
          .delete()
          .eq("key", EXPENSE_THRESHOLD_KEY);
      }
    }
  });
});

// Outside the block above on purpose: that one signs in as admin in
// beforeEach, and a second sign-in on the same page would not find the login
// form.
test.describe("system settings for a board member", () => {
  // System Settings is the board's only Administration page -- they hold
  // system_settings:manage and nothing else in the section -- and no panel is
  // gated below the layout, so a deep link into one has to work for them too.
  test("a board member can deep-link into a tab", async ({ page }) => {
    await signIn(page, { email: "board@example.test" });
    await page.goto("/portal/administration/system-settings?tab=notifications");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "System Settings",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Notifications" }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
