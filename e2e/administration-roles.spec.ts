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
    // Named the way the screen names them: the row button carries the role's
    // display name, not the `roles.name` key behind it (#910).
    await expect(
      page.getByRole("button", { name: "View Admin" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View Event coordinator" }),
    ).toBeVisible();
  });

  // #946: a role's identity and a role's access are one page now. The tab has
  // to be in the URL for Back to mean "the other tab" rather than "the
  // previous page" -- the first threshold in docs/portal-navigation.md.
  test("the role list and the permissions matrix are two tabs of one page", async ({
    page,
  }) => {
    await page.goto("/portal/administration/roles");

    await expect(page.getByRole("tab", { name: "All roles" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.getByRole("tab", { name: "Permissions" }).click();
    await expect(page).toHaveURL(
      /\/portal\/administration\/roles\?tab=permissions$/,
    );
    await expect(page.getByRole("combobox", { name: "Role" })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("tab", { name: "All roles" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("button", { name: "View Admin" }),
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
      await createDialog.getByLabel("Key").fill(name);
      await createDialog
        .getByLabel("Description")
        .fill("Created by an e2e test.");
      await createDialog.getByRole("button", { name: "Create role" }).click();
      await expect(createDialog).not.toBeVisible();

      // No label was given, so the row shows the wording derived from the key.
      const row = page.getByRole("row").filter({ hasText: roleLabel(name) });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Created by an e2e test.");

      await row
        .getByRole("button", { name: `View ${roleLabel(name)}` })
        .click();
      const sheet = modal(page);
      await expect(sheet.getByText(roleLabel(name))).toBeVisible();

      await sheet.getByRole("button", { name: "Edit role" }).click();
      await sheet.getByLabel("Role key").fill(renamed);
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

      await page
        .getByRole("button", { name: `View ${roleLabel(renamed)}` })
        .click();
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

  // #910: the display name is the tenant's, and changing it needs no
  // migration. Driven on a throwaway role rather than a seeded one, because
  // the PR suite runs two Playwright projects against one Supabase instance.
  test("a role takes the display name this organization gives it", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const name = `e2e_role_${crypto.randomUUID().slice(0, 8)}`;
    const label = `Studio manager ${crypto.randomUUID().slice(0, 8)}`;

    try {
      await page.goto("/portal/administration/roles");

      await page.getByRole("button", { name: "New role" }).click();
      const createDialog = modal(page);
      await createDialog.getByLabel("Key").fill(name);
      await createDialog.getByLabel("Display name").fill(label);
      await createDialog.getByRole("button", { name: "Create role" }).click();
      await expect(createDialog).not.toBeVisible();

      // The table reads the label, and the derived wording is gone from it.
      const row = page.getByRole("row").filter({ hasText: label });
      await expect(row).toBeVisible();
      await expect(
        page.getByRole("row").filter({ hasText: roleLabel(name) }),
      ).toHaveCount(0);

      // The key is untouched underneath, which is what the permission matrix
      // and every migration that seeds a grant join on.
      await row.getByRole("button", { name: `View ${label}` }).click();
      const sheet = modal(page);
      await expect(sheet.getByText(name, { exact: true })).toBeVisible();

      // Clearing the label falls back to the platform's derived wording.
      await sheet.getByRole("button", { name: "Edit role" }).click();
      await sheet.getByLabel("Display name").fill("");
      await sheet.getByRole("button", { name: "Save changes" }).click();
      await expect(
        sheet.getByRole("button", { name: "Edit role" }),
      ).toBeVisible();
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(sheet).not.toBeVisible();

      await expect(
        page.getByRole("row").filter({ hasText: roleLabel(name) }),
      ).toBeVisible();
    } finally {
      await deleteRoleByName(admin, name);
    }
  });

  test("only the admin role refuses a rename and a delete", async ({
    page,
  }) => {
    await page.goto("/portal/administration/roles");

    await page.getByRole("button", { name: "View Admin" }).click();
    const sheet = modal(page);
    await sheet.getByRole("button", { name: "Edit role" }).click();

    await expect(sheet.getByLabel("Role key")).toBeDisabled();
    await expect(
      sheet.getByRole("button", { name: "Delete role" }),
    ).toBeDisabled();
    // Its wording is still the organization's to change.
    await expect(sheet.getByLabel("Display name")).toBeEnabled();

    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).not.toBeVisible();
  });

  // #910 narrowed the delete guard to `admin` alone: an organization with no
  // board can retire Board. Asserted on the button rather than by clicking it,
  // since the seeded role is shared with every other spec in the run.
  test("a built-in role other than admin keeps its key but can be retired", async ({
    page,
  }) => {
    await page.goto("/portal/administration/roles");

    await page.getByRole("button", { name: "View Board" }).click();
    const sheet = modal(page);
    await sheet.getByRole("button", { name: "Edit role" }).click();

    await expect(sheet.getByLabel("Role key")).toBeDisabled();
    await expect(sheet.getByLabel("Display name")).toBeEnabled();
    await expect(
      sheet.getByRole("button", { name: "Delete role" }),
    ).toBeEnabled();
  });
});
