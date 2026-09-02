import { test, expect } from "@playwright/test";
import { reloadStayingSignedIn, signIn } from "./helpers/auth";

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

  test("records a manual donation and edits it from its detail page", async ({
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
    await addSheet.getByLabel("Condition").click();
    await page.getByRole("listbox").getByText("Good", { exact: true }).click();
    await addSheet.getByRole("button", { name: "Save donation" }).click();

    await expect(addSheet).not.toBeVisible();

    // Saving triggers a router.refresh() that re-renders the table; a click
    // racing that re-render can land on a node React just replaced and go
    // nowhere. Reload so the list is settled before navigating.
    await reloadStayingSignedIn(page);

    const row = page.getByRole("row").filter({ hasText: donorName });
    await expect(row).toBeVisible();
    await expect(row).toContainText(itemDescription);

    // Since #469 the row's View action is a link to the donation's dedicated
    // detail page, with editing kept on a sheet opened from the page.
    await row.getByRole("button", { name: "View donation" }).click();
    await expect(page).toHaveURL(
      /\/portal\/inventory\/donations\/[0-9a-f-]{36}$/,
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("heading", { level: 1, name: donorName }),
    ).toBeVisible();
    await expect(page.getByText("Donation details")).toBeVisible();
    await expect(page.getByText(itemDescription)).toBeVisible();

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editSheet = page.getByRole("dialog");
    await expect(
      editSheet.getByRole("heading", { name: "Edit donation" }),
    ).toBeVisible();
    const updatedNotes = `E2E updated notes ${Date.now()}`;
    await editSheet.getByLabel("Donation notes").fill(updatedNotes);
    await editSheet.getByRole("button", { name: "Save changes" }).click();

    await expect(editSheet).not.toBeVisible();
    await expect(page.getByText(updatedNotes)).toBeVisible();

    // The back link returns to the list (a Link rendered through the Button
    // primitive, so it's exposed as a button). Scoped to main: the sidebar
    // has its own "Donations" nav entry.
    await page
      .getByRole("main")
      .getByRole("button", { name: "Donations", exact: true })
      .click();
    await expect(page).toHaveURL(/\/portal\/inventory\/donations(\?.*)?$/);
  });
});
