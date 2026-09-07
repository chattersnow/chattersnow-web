import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { deleteRoleByName, roleLabel } from "./helpers/rbac";
import { modal } from "./helpers/dialog";

test.describe("portal administration roles", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the Roles page and lists the built-in roles", async ({
    page,
  }) => {
    await page.goto("/portal/administration/roles");

    await expect(
      page.getByRole("heading", { level: 1, name: "Roles", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View admin" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View event_coordinator" }),
    ).toBeVisible();
  });

  test("creates, renames, and deletes a role", async ({ page }) => {
    const admin = createAdminClient();
    const name = `e2e_role_${crypto.randomUUID().slice(0, 8)}`;
    const renamed = `${name}_renamed`;

    try {
      await page.goto("/portal/administration/roles");

      await page.getByRole("button", { name: "New role" }).click();
      const createDialog = modal(page);
      await createDialog.getByLabel("Name").fill(name);
      await createDialog
        .getByLabel("Description")
        .fill("Created by an e2e test.");
      await createDialog.getByRole("button", { name: "Create role" }).click();
      await expect(createDialog).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: roleLabel(name) });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Created by an e2e test.");

      await row.getByRole("button", { name: `View ${name}` }).click();
      const sheet = modal(page);
      await expect(sheet.getByText(roleLabel(name))).toBeVisible();

      await sheet.getByRole("button", { name: "Edit role" }).click();
      await sheet.getByLabel("Role name").fill(renamed);
      await sheet.getByLabel("Description").fill("Renamed by an e2e test.");
      await sheet.getByRole("button", { name: "Save changes" }).click();
      // Back in view mode, showing what was just saved.
      await expect(
        sheet.getByRole("button", { name: "Edit role" }),
      ).toBeVisible();
      await expect(sheet.getByText(roleLabel(renamed))).toBeVisible();

      // The sheet is modal, so it marks the rest of the page aria-hidden --
      // no role-based locator resolves against the table until it's closed.
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(sheet).not.toBeVisible();

      const renamedRow = page
        .getByRole("row")
        .filter({ hasText: roleLabel(renamed) });
      await expect(renamedRow).toContainText("Renamed by an e2e test.");

      await page.getByRole("button", { name: `View ${renamed}` }).click();
      await sheet.getByRole("button", { name: "Edit role" }).click();
      await sheet.getByRole("button", { name: "Delete role" }).click();
      const confirm = page.getByRole("alertdialog");
      await confirm.getByRole("button", { name: "Delete role" }).click();

      await expect(sheet).not.toBeVisible();
      await expect(renamedRow).toHaveCount(0);
    } finally {
      await deleteRoleByName(admin, name);
      await deleteRoleByName(admin, renamed);
    }
  });

  test("a built-in role can't be renamed or deleted", async ({ page }) => {
    await page.goto("/portal/administration/roles");

    await page.getByRole("button", { name: "View admin" }).click();
    const sheet = modal(page);
    await sheet.getByRole("button", { name: "Edit role" }).click();

    await expect(sheet.getByLabel("Role name")).toBeDisabled();
    await expect(
      sheet.getByRole("button", { name: "Delete role" }),
    ).toBeDisabled();
  });
});
