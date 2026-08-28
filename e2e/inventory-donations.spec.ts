import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

test.describe("portal inventory donations", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the Donations page", async ({ page }) => {
    await page.goto("/portal/inventory/donations");
    await expect(
      page.getByRole("heading", { level: 1, name: "Donations", exact: true }),
    ).toBeVisible();
  });

  test("records a manual donation and edits it from the list", async ({
    page,
  }) => {
    await page.goto("/portal/inventory/donations");
    await expect(
      page.getByRole("heading", { level: 1, name: "Donations", exact: true }),
    ).toBeVisible();

    const donorName = `E2E Donor ${Date.now()}`;
    const itemDescription = `E2E Test Jacket ${Date.now()}`;

    await page.getByRole("button", { name: "Add donation" }).click();
    const addSheet = page.getByRole("dialog");
    await expect(
      addSheet.getByRole("heading", { name: "Record a donation" }),
    ).toBeVisible();

    await addSheet.getByLabel("Donor name").fill(donorName);
    await addSheet.getByLabel("Donor source").click();
    await page
      .getByRole("listbox")
      .getByText("Individual", { exact: true })
      .click();
    await addSheet.getByRole("button", { name: "Continue" }).click();

    await addSheet.getByLabel("Item description").fill(itemDescription);
    await addSheet.getByLabel("Item type").fill("Jacket");
    await addSheet.getByRole("button", { name: "Save donation" }).click();

    await expect(addSheet).not.toBeVisible();

    const row = page.getByRole("row").filter({ hasText: donorName });
    await expect(row).toBeVisible();
    await expect(row).toContainText(itemDescription);

    await row.getByRole("button", { name: "View donation" }).click();
    const editSheet = page.getByRole("dialog");
    await expect(editSheet.getByText(donorName)).toBeVisible();

    await editSheet.getByRole("button", { name: "Edit donation" }).click();
    const updatedNotes = `E2E updated notes ${Date.now()}`;
    await editSheet.getByLabel("Donation notes").fill(updatedNotes);
    await editSheet.getByRole("button", { name: "Save changes" }).click();

    await expect(
      editSheet.getByRole("button", { name: "Edit donation" }),
    ).toBeVisible();
    await expect(editSheet.getByText(updatedNotes)).toBeVisible();
  });
});
