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
    // Unique per run (not a fixed value like "88.13") so this can't collide
    // with another Playwright project's still-present row from the same
    // shared local Supabase instance -- the row lookup below has no other
    // way to tell two Merchandise records apart.
    const amount = ((Date.now() % 100000) / 100).toFixed(2);
    await addDialog.getByLabel("Amount").fill(amount);

    const notes = `E2E revenue notes ${Date.now()}`;
    const notesField = addDialog.getByLabel("Notes");
    await notesField.fill(notes);
    // Confirms the value actually landed in the field before submitting,
    // so a mismatch here (rather than a later assertion) points straight
    // at the fill instead of the round trip through the server.
    await expect(notesField).toHaveValue(notes);
    await addDialog.getByRole("button", { name: "Add revenue" }).click();

    await expect(addDialog).not.toBeVisible();

    const row = page
      .getByRole("row")
      .filter({ hasText: "Merchandise" })
      .filter({ hasText: `$${amount}` });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "View revenue" }).click();
    const viewSheet = page.getByRole("dialog");
    await expect(
      viewSheet.getByRole("heading", { name: "Revenue", exact: true }),
    ).toBeVisible();
    await expect(viewSheet.getByText(`$${amount}`)).toBeVisible();

    // Verified through the edit form's textarea value rather than the
    // read-only view text: this is the same mechanism already confirmed
    // reliable above (the pre-submit toHaveValue check) and it directly
    // proves what was submitted is what the server now has, without
    // depending on how the read-only view renders it.
    await viewSheet.getByRole("button", { name: "Edit revenue" }).click();
    await expect(viewSheet.getByLabel("Notes")).toHaveValue(notes);
  });
});
