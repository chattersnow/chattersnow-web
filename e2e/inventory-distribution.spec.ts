// Issue #468: Inventory > Distribution grew a dedicated
// /portal/inventory/distribution/[movementId] detail page (previously the
// list had no view affordance at all), with editing on a Sheet opened from
// the page and a gated delete action. The flow below creates its own
// donation first so it has a fresh available inventory item to distribute —
// the suite runs fully parallel against one database, so nothing shared
// would be safe to mutate.
import { test, expect } from "@playwright/test";
import { reloadStayingSignedIn, signIn } from "./helpers/auth";
import { modal } from "./helpers/dialog";

test.describe("portal inventory distribution", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the Distribution page", async ({ page }) => {
    await page.goto("/portal/inventory/distribution");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Distribution",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("records a distribution, views its detail page, edits it, and deletes it", async ({
    page,
  }) => {
    const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const donorName = `E2E Dist Donor ${suffix}`;
    const itemDescription = `E2E Dist Jacket ${suffix}`;

    // Seed a fresh available inventory item via a donation.
    await page.goto("/portal/inventory/donations");
    await page.getByRole("button", { name: "Add donation" }).click();
    const addSheet = modal(page);
    await addSheet.getByLabel("Donor name").fill(donorName);
    await addSheet.getByLabel("Donor source").click();
    await page
      .getByRole("listbox")
      .getByText("Individual", { exact: true })
      .click();
    await addSheet.getByRole("button", { name: "Continue" }).click();
    await addSheet.getByLabel("Item description").fill(itemDescription);
    await addSheet.getByLabel("Item category").click();
    await page
      .getByRole("listbox")
      .getByText("Jacket", { exact: true })
      .click();
    await addSheet.getByLabel("Condition").click();
    await page.getByRole("listbox").getByText("Good", { exact: true }).click();
    await addSheet.getByRole("button", { name: "Save donation" }).click();
    await expect(addSheet).not.toBeVisible();

    // Record a distribution of that item.
    await page.goto("/portal/inventory/distribution");
    // Scoped to the page: the sidebar's quick actions offer the same button.
    await page
      .getByRole("main")
      .getByRole("button", { name: "Record distribution" })
      .click();
    const recordDialog = modal(page);
    await expect(
      recordDialog.getByRole("heading", { name: "Record a distribution" }),
    ).toBeVisible();
    await recordDialog.getByLabel("Inventory item").click();
    await page
      .getByRole("listbox")
      .getByText(`${itemDescription} (Jacket)`, { exact: true })
      .click();
    await recordDialog.getByLabel("Reason / notes").fill("E2E initial reason");
    await recordDialog
      .getByRole("button", { name: "Record distribution" })
      .click();
    await expect(recordDialog).not.toBeVisible();

    // Recording triggers a router.refresh() that re-renders the table; a
    // click racing that re-render can land on a node React just replaced and
    // go nowhere. Reload so the list is settled before navigating.
    await reloadStayingSignedIn(page);

    // The new movement shows in the list with a view affordance.
    const row = page.getByRole("row").filter({ hasText: itemDescription });
    await expect(row).toBeVisible();
    await row
      .getByRole("button", {
        name: `View distribution of ${itemDescription}`,
      })
      .click();

    // Dedicated detail page, not a sheet.
    await expect(page).toHaveURL(
      /\/portal\/inventory\/distribution\/[0-9a-f-]{36}$/,
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("heading", { level: 1, name: itemDescription }),
    ).toBeVisible();
    await expect(page.getByText("Distribution details")).toBeVisible();
    await expect(page.getByText("E2E initial reason")).toBeVisible();

    // Editing happens on a sheet opened from the page.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editSheet = modal(page);
    await expect(
      editSheet.getByRole("heading", { name: "Edit distribution" }),
    ).toBeVisible();
    await editSheet.getByLabel("Quantity").fill("3");
    await editSheet.getByLabel("Reason / notes").fill("E2E updated reason");
    await editSheet.getByRole("button", { name: "Save changes" }).click();
    await expect(editSheet).not.toBeVisible();

    await expect(page.getByText("E2E updated reason")).toBeVisible();
    await expect(page.locator("#distribution-quantity-view")).toHaveText("3");

    // The breadcrumb trail returns to the list. Scoped to the breadcrumb nav:
    // the sidebar has its own "Distribution" nav entry.
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Distribution", exact: true })
      .click();
    await expect(page).toHaveURL(/\/portal\/inventory\/distribution$/);
    await reloadStayingSignedIn(page);

    // Delete from the detail page, confirming the dialog.
    await row
      .getByRole("button", {
        name: `View distribution of ${itemDescription}`,
      })
      .click();
    await page.getByRole("button", { name: "Delete distribution" }).click();
    const confirmDialog = page.getByRole("alertdialog");
    await expect(
      confirmDialog.getByText("Delete this distribution?"),
    ).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();

    await expect(page).toHaveURL(/\/portal\/inventory\/distribution$/, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("row").filter({ hasText: itemDescription }),
    ).toHaveCount(0);
  });
});
