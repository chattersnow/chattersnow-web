import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { modal } from "./helpers/dialog";

test.describe("portal governance nonprofit status milestones", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("adds a milestone, marks it cancelled, then deletes it (#407)", async ({
    page,
  }) => {
    await page.goto("/portal/governance/nonprofit-status");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Nonprofit Status",
        exact: true,
      }),
    ).toBeVisible();

    const description = `E2E Milestone ${Date.now()}`;

    await page.getByRole("button", { name: "Add milestone" }).click();
    const addDialog = modal(page);
    await expect(
      addDialog.getByRole("heading", { name: "Add milestone" }),
    ).toBeVisible();

    await addDialog.getByLabel("Description").fill(description);
    await addDialog.getByLabel("Phase").fill("E2E Phase");
    await addDialog.getByRole("button", { name: "Add milestone" }).click();
    await expect(addDialog).not.toBeVisible();

    const row = page.getByRole("row").filter({ hasText: description });
    await expect(row).toBeVisible();

    await row
      .getByRole("combobox", { name: `Status for ${description}` })
      .click();
    await page
      .getByRole("listbox")
      .getByText("Cancelled", { exact: true })
      .click();
    await expect(row.getByText("Cancelled", { exact: true })).toBeVisible();

    await row.getByRole("button", { name: "View milestone" }).click();
    const editSheet = modal(page);
    await expect(editSheet.getByText(description)).toBeVisible();
    await expect(editSheet.getByText("Cancelled")).toBeVisible();

    await editSheet.getByRole("button", { name: "Delete" }).click();
    const confirmDialog = page.getByRole("alertdialog");
    await expect(
      confirmDialog.getByText("Delete this milestone?"),
    ).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();

    await expect(editSheet).not.toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: description }),
    ).toHaveCount(0);
  });
});
