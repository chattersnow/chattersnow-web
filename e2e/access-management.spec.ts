import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

test.describe("portal access management", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the Access Management page", async ({ page }) => {
    await page.goto("/portal/administration/access-management");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Access Management",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("creates an asset with a new service, adds an access grant, and records a review", async ({
    page,
  }) => {
    await page.goto("/portal/administration/access-management");

    const assetName = `E2E Asset ${Date.now()}`;
    const serviceName = `E2E Service ${Date.now()}`;

    await page.getByRole("button", { name: "New asset" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(
      createDialog.getByRole("heading", { name: "Add asset" }),
    ).toBeVisible();

    await createDialog.getByLabel("Name").fill(assetName);
    await createDialog.getByRole("button", { name: "+ New service" }).click();
    await createDialog.getByLabel("Service name").fill(serviceName);
    await createDialog.getByRole("button", { name: "Create & select" }).click();
    await expect(createDialog.getByText(serviceName)).toBeVisible();

    await createDialog.getByRole("button", { name: "Add asset" }).click();
    await expect(createDialog).not.toBeVisible();

    const row = page.getByRole("row").filter({ hasText: assetName });
    await expect(row).toBeVisible();

    await row.getByRole("link", { name: assetName }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: assetName, exact: true }),
    ).toBeVisible();

    const personName = `E2E Person ${Date.now()}`;
    await page.getByRole("button", { name: "Add access grant" }).click();
    const grantDialog = page.getByRole("dialog");
    await grantDialog
      .getByPlaceholder("Search by name or email...")
      .fill(personName);
    await grantDialog
      .getByRole("button", { name: "+ Create new person" })
      .click();
    await grantDialog.getByLabel("Name").fill(personName);
    await grantDialog.getByRole("button", { name: "Create & select" }).click();

    await grantDialog.getByRole("button", { name: "Add access grant" }).click();
    await expect(grantDialog).not.toBeVisible();

    const grantRow = page.getByRole("row").filter({ hasText: personName });
    await expect(grantRow).toBeVisible();

    await page.getByRole("button", { name: "Record review" }).click();
    const reviewDialog = page.getByRole("alertdialog");
    await reviewDialog.getByRole("button", { name: "Record review" }).click();
    await expect(reviewDialog).not.toBeVisible();
    await expect(
      page.getByText(new Date().toISOString().slice(0, 10)),
    ).toBeVisible();
  });
});
