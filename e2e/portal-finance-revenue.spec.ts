// Issue #440: E2E coverage for /portal/finance/revenue.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

test.describe("portal finance revenue", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the Revenue page", async ({ page }) => {
    await page.goto("/portal/finance/revenue");
    await expect(
      page.getByRole("heading", { level: 1, name: "Revenue", exact: true }),
    ).toBeVisible();
  });

  test("records event revenue and views it from the list", async ({ page }) => {
    await page.goto("/portal/finance/revenue");

    await page.getByRole("button", { name: "New Revenue" }).click();
    const addDialog = page.getByRole("dialog");
    await expect(
      addDialog.getByRole("heading", { name: "Add revenue" }),
    ).toBeVisible();

    await addDialog.getByLabel("Source").click();
    await page
      .getByRole("listbox")
      .getByText("Merchandise", { exact: true })
      .click();
    await addDialog.getByLabel("Amount").fill("88.13");

    const notes = `E2E revenue notes ${Date.now()}`;
    await addDialog.getByLabel("Notes").fill(notes);
    await addDialog.getByRole("button", { name: "Add revenue" }).click();

    await expect(addDialog).not.toBeVisible();

    const row = page
      .getByRole("row")
      .filter({ hasText: "Merchandise" })
      .filter({ hasText: "$88.13" });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "View revenue" }).click();
    const viewSheet = page.getByRole("dialog");
    await expect(
      viewSheet.getByRole("heading", { name: "Revenue", exact: true }),
    ).toBeVisible();
    await expect(viewSheet.getByText("$88.13")).toBeVisible();
    await expect(viewSheet.getByText(notes)).toBeVisible();
  });
});
