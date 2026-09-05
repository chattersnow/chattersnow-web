// Issue #440: E2E coverage for /portal/finance/expenses. Only smoke-level
// coverage of the Finance section existed before this (portal-sections.spec.ts,
// #234), so this exercises the actual create-then-view workflow.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { modal } from "./helpers/dialog";

test.describe("portal finance expenses", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the Expenses page", async ({ page }) => {
    await page.goto("/portal/finance/expenses");
    await expect(
      page.getByRole("heading", { level: 1, name: "Expenses", exact: true }),
    ).toBeVisible();
  });

  test("records an expense and views it from the list", async ({ page }) => {
    await page.goto("/portal/finance/expenses");

    const description = `E2E Expense ${Date.now()}`;

    await page.getByRole("button", { name: "New Expense" }).click();
    const addDialog = modal(page);
    await expect(
      addDialog.getByRole("heading", { name: "Add expense" }),
    ).toBeVisible();

    await addDialog.getByLabel("Description").fill(description);
    await addDialog.getByLabel("Amount").fill("123.45");
    await addDialog.getByRole("button", { name: "Add expense" }).click();

    await expect(addDialog).not.toBeVisible();

    const row = page.getByRole("row").filter({ hasText: description });
    await expect(row).toBeVisible();
    await expect(row).toContainText("$123.45");
    await expect(row).toContainText("Submitted");

    await row.getByRole("button", { name: "View expense" }).click();
    const viewSheet = modal(page);
    await expect(
      viewSheet.getByRole("heading", { name: "Expense", exact: true }),
    ).toBeVisible();
    await expect(viewSheet.getByText(description)).toBeVisible();
    await expect(viewSheet.getByText("$123.45")).toBeVisible();
  });
});
