// Issue #446: E2E coverage for /portal/volunteers/roles -- the named
// volunteer job types that events and logged hours get tagged with.
//
// Role types created here carry a unique name so the chromium and
// mobile-chromium projects, which test:e2e:pr runs fully in parallel
// against one Supabase instance, never touch each other's rows.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { seedUserWithRole } from "./helpers/rbac";
import { modal } from "./helpers/dialog";

type AdminClient = ReturnType<typeof createAdminClient>;

function roleTypeName() {
  return `E2E Role Type ${crypto.randomUUID().slice(0, 8)}`;
}

async function deleteRoleTypeByName(admin: AdminClient, name: string) {
  await admin.from("volunteer_role_types").delete().eq("name", name);
}

async function seedRoleType(admin: AdminClient, createdBy: string) {
  const name = roleTypeName();
  const { error } = await admin.from("volunteer_role_types").insert({
    name,
    description: "Seeded by an e2e test.",
    is_public: false,
    // Defaults to auth.uid(), which is null for the service role.
    created_by: createdBy,
  });
  if (error) throw error;

  return {
    name,
    cleanup: () => deleteRoleTypeByName(admin, name),
  };
}

test.describe("portal volunteer role types", () => {
  test("lists the seeded role types", async ({ page }) => {
    await signIn(page);
    await page.goto("/portal/volunteers/roles");

    await expect(
      page.getByRole("heading", { level: 1, name: "Roles", exact: true }),
    ).toBeVisible();

    // Seeded by supabase/seed.sql and only ever read here.
    const row = page.getByRole("row").filter({ hasText: "Ride Buddy" });
    await expect(row).toBeVisible();
    await expect(row).toContainText(
      "Supports participants during beginner outdoor activities.",
    );
    await expect(
      row.getByRole("cell", { name: "Yes", exact: true }),
    ).toBeVisible();
  });

  test("creates a role type and edits it", async ({ page }) => {
    const admin = createAdminClient();
    const name = roleTypeName();
    const renamed = `${name} renamed`;

    try {
      await signIn(page);
      await page.goto("/portal/volunteers/roles");

      await page.getByRole("button", { name: "New role type" }).click();
      const createDialog = modal(page);
      await createDialog.getByLabel("Role name").fill(name);
      await createDialog
        .getByLabel("Description")
        .fill("Created by an e2e test.");
      await createDialog
        .getByRole("button", { name: "Create role type" })
        .click();
      await expect(createDialog).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: name });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Created by an e2e test.");
      await expect(
        row.getByRole("cell", { name: "No", exact: true }),
      ).toBeVisible();

      await row.getByRole("button", { name: `View ${name}` }).click();
      const sheet = modal(page);
      await expect(sheet.getByText("Created by an e2e test.")).toBeVisible();

      await sheet.getByRole("button", { name: "Edit role type" }).click();
      await sheet.getByLabel("Role name").fill(renamed);
      await sheet.getByLabel("Description").fill("Renamed by an e2e test.");
      await sheet
        .getByRole("checkbox", { name: "Show on public site" })
        .click();
      await sheet.getByRole("button", { name: "Save changes" }).click();

      // Saving returns the sheet to view mode, showing what just landed.
      await expect(
        sheet.getByRole("button", { name: "Edit role type" }),
      ).toBeVisible();
      await expect(sheet.getByText(renamed)).toBeVisible();
      await expect(sheet.getByText("Renamed by an e2e test.")).toBeVisible();

      // The sheet is modal, so the table behind it is aria-hidden until
      // it's closed -- no role-based locator resolves against the row
      // before then.
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(sheet).not.toBeVisible();

      const renamedRow = page.getByRole("row").filter({ hasText: renamed });
      await expect(renamedRow).toContainText("Renamed by an e2e test.");
      await expect(
        renamedRow.getByRole("cell", { name: "Yes", exact: true }),
      ).toBeVisible();
    } finally {
      await deleteRoleTypeByName(admin, name);
      await deleteRoleTypeByName(admin, renamed);
    }
  });

  test("confirms before discarding unsaved edits", async ({ page }) => {
    const admin = createAdminClient();
    const name = roleTypeName();

    try {
      await signIn(page);
      await page.goto("/portal/volunteers/roles");

      // Created through the dialog rather than the admin client: role types
      // carry a not-null created_by defaulting to auth.uid(), which is null
      // for the service role, so a seeded row would need an auth user this
      // test otherwise has no use for.
      await page.getByRole("button", { name: "New role type" }).click();
      const createDialog = modal(page);
      await createDialog.getByLabel("Role name").fill(name);
      await createDialog
        .getByLabel("Description")
        .fill("Created by an e2e test.");
      await createDialog
        .getByRole("button", { name: "Create role type" })
        .click();
      await expect(createDialog).not.toBeVisible();

      await page.getByRole("button", { name: `View ${name}` }).click();
      const sheet = modal(page);
      await sheet.getByRole("button", { name: "Edit role type" }).click();
      await sheet.getByLabel("Role name").fill("Half-typed name");

      // Leaving edit mode with unsaved changes has to be confirmed first.
      await sheet.getByRole("button", { name: "View", exact: true }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(
        confirm.getByText("Discard changes?", { exact: true }),
      ).toBeVisible();
      await confirm.getByRole("button", { name: "Keep editing" }).click();
      await expect(sheet.getByLabel("Role name")).toHaveValue(
        "Half-typed name",
      );

      await sheet.getByRole("button", { name: "View", exact: true }).click();
      await confirm.getByRole("button", { name: "Discard changes" }).click();

      await expect(
        sheet.getByRole("button", { name: "Edit role type" }),
      ).toBeVisible();
      await expect(sheet.getByText(name)).toBeVisible();
      await expect(sheet.getByText("Created by an e2e test.")).toBeVisible();
    } finally {
      await deleteRoleTypeByName(admin, name);
    }
  });

  test("a view-only user can't create or edit role types", async ({ page }) => {
    const admin = createAdminClient();
    // event_coordinator holds volunteers:view, not volunteers:manage.
    const coordinator = await seedUserWithRole(admin, "event_coordinator");
    const roleType = await seedRoleType(admin, coordinator.userId);

    try {
      await signIn(page, {
        email: coordinator.email,
        password: coordinator.password,
      });
      await page.goto("/portal/volunteers/roles");

      const row = page.getByRole("row").filter({ hasText: roleType.name });
      await expect(row).toBeVisible();
      await expect(
        page.getByRole("button", { name: "New role type" }),
      ).not.toBeAttached();

      await row.getByRole("button", { name: `View ${roleType.name}` }).click();
      const sheet = modal(page);
      await expect(sheet.getByText("Seeded by an e2e test.")).toBeVisible();
      await expect(
        sheet.getByRole("button", { name: "Edit role type" }),
      ).not.toBeAttached();
    } finally {
      await roleType.cleanup();
      await coordinator.cleanup();
    }
  });
});
