import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { seedPortalUser } from "./helpers/rbac";

test.describe("portal administration users", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the Users page", async ({ page }) => {
    await page.goto("/portal/administration/users");

    await expect(
      page.getByRole("heading", { level: 1, name: "Users", exact: true }),
    ).toBeVisible();
    // The Name column shows the account's full_name, not its email.
    const adminRow = page.getByRole("row").filter({ hasText: "Avery Morgan" });
    await expect(adminRow).toContainText("Admin");
    await expect(adminRow).toContainText("Active");
    await expect(
      page.getByRole("button", { name: "Stage access" }),
    ).toBeVisible();
  });

  test("/portal/administration redirects to the Users page", async ({
    page,
  }) => {
    await page.goto("/portal/administration");

    await expect(page).toHaveURL(/\/portal\/administration\/users$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Users", exact: true }),
    ).toBeVisible();
  });

  test("assigns and revokes a role on an existing user", async ({ page }) => {
    const admin = createAdminClient();
    const user = await seedPortalUser(admin);

    try {
      await page.goto("/portal/administration/users");
      const row = page.getByRole("row").filter({ hasText: user.fullName });
      await expect(row).toBeVisible();
      await expect(row).toContainText("No access");

      await row.getByRole("button", { name: "Add role", exact: true }).click();
      await row.getByRole("combobox", { name: "Add role" }).click();
      await page
        .getByRole("option", { name: "Volunteer", exact: true })
        .click();
      await row.getByRole("button", { name: "Add", exact: true }).click();

      // The badge's remove button only exists once the assignment has landed
      // and the list has refreshed -- unlike the row's text, which shows
      // "Volunteer" as soon as it's picked in the still-open select.
      const removeRole = row.getByRole("button", { name: "Remove Volunteer" });
      await expect(removeRole).toBeVisible();

      await removeRole.click();
      await expect(row).toContainText("No access");
    } finally {
      await user.cleanup();
    }
  });

  test("deactivates and reactivates a user", async ({ page }) => {
    const admin = createAdminClient();
    const user = await seedPortalUser(admin);

    try {
      await page.goto("/portal/administration/users");
      const row = page.getByRole("row").filter({ hasText: user.fullName });
      await expect(row).toContainText("Active");

      await row.getByRole("button", { name: "Deactivate" }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toContainText(user.fullName);
      await confirm.getByRole("button", { name: "Deactivate" }).click();

      await expect(confirm).not.toBeVisible();
      await expect(row).toContainText("Deactivated");

      await row.getByRole("button", { name: "Reactivate" }).click();
      await expect(row).toContainText("Active");
    } finally {
      await user.cleanup();
    }
  });

  test("stages pending access, generates an invite link, and revokes it", async ({
    page,
  }) => {
    // Generating the invite link is a round trip through Supabase's admin
    // API, which is slower than the rest of this page's actions.
    test.slow();

    const admin = createAdminClient();
    // Staged against an account that already exists (with no roles), so the
    // invite link falls back to a magic link for that account rather than
    // creating a second, untracked auth user this spec can't clean up.
    const user = await seedPortalUser(admin);

    try {
      await page.goto("/portal/administration/users");

      await page.getByPlaceholder("name@example.com").fill(user.email);
      await page.getByRole("combobox", { name: "Grant role" }).click();
      await page
        .getByRole("option", { name: "Volunteer", exact: true })
        .click();
      await page.getByRole("button", { name: "Stage access" }).click();

      const grantRow = page.getByRole("row").filter({ hasText: user.email });
      await expect(grantRow).toBeVisible();
      await expect(grantRow).toContainText("Volunteer");
      await expect(grantRow).toContainText("Pending");

      await grantRow.getByRole("button", { name: "Invite" }).click();
      const inviteDialog = page.getByRole("dialog");
      await expect(inviteDialog).toContainText(user.email, { timeout: 15_000 });
      await expect(inviteDialog.getByRole("textbox")).toHaveValue(
        /\/auth\/confirm\?token_hash=/,
      );
      await page.keyboard.press("Escape");
      await expect(inviteDialog).not.toBeVisible();

      await expect(
        grantRow.getByRole("button", { name: "Resend link" }),
      ).toBeVisible({ timeout: 15_000 });

      await grantRow.getByRole("button", { name: "Revoke" }).click();
      const confirm = page.getByRole("alertdialog");
      await confirm.getByRole("button", { name: "Revoke" }).click();

      await expect(confirm).not.toBeVisible();
      await expect(grantRow).toContainText("Revoked");
    } finally {
      await user.cleanup();
    }
  });
});
