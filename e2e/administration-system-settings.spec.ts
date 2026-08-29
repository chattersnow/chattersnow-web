import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";

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
    await expect(page.getByText("Expense approval threshold")).toBeVisible();
    await expect(
      page.getByText("Reimbursement approval threshold"),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Image settings" }).click();
    await expect(page.getByText("Edit image")).toBeVisible();
    await expect(page.getByLabel("Slot")).toBeVisible();

    await page.getByRole("tab", { name: "Workflow settings" }).click();
    await expect(page.locator("#expense-threshold")).toBeVisible();
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

      const expenseForm = page
        .locator("form")
        .filter({ has: page.locator("#expense-threshold") });
      await expenseForm.locator("#expense-threshold").fill("321.5");
      await expenseForm.getByRole("button", { name: "Save" }).click();

      await expect(page.getByRole("alert")).toContainText("Threshold updated.");

      await page.reload();
      await expect(page.locator("#expense-threshold")).toHaveValue("321.5");
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
