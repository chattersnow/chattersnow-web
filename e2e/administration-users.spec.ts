import { test, expect } from "@playwright/test";
import { reloadStayingSignedIn, signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { seedInviteEmail, seedPortalUser } from "./helpers/rbac";

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

  test("stages pending access and revokes it", async ({ page }) => {
    // Deliberately stops short of clicking Invite. Generating the link goes
    // out to Supabase's admin API, and driving it from here was the only
    // unstable test in this suite across seven CI runs -- while
    // users/actions.integration.test.ts already asserts the generated link's
    // shape and that invited_at is stamped, against the same server action.
    // What's left is what only an e2e can check: the staging form and the
    // revoke flow on the page.
    test.setTimeout(120_000);

    const admin = createAdminClient();
    const invite = await seedInviteEmail(admin);

    try {
      await page.goto("/portal/administration/users");

      // Opening the role select doubles as the hydration check: until the
      // client bundle takes over it doesn't open at all, and anything typed
      // into the email input before then is wiped when React re-renders it
      // from its own (still empty) state.
      const roleSelect = page.getByRole("combobox", { name: "Grant role" });
      await expect(async () => {
        await roleSelect.click();
        await expect(page.getByRole("listbox")).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await page
        .getByRole("option", { name: "Volunteer", exact: true })
        .click();

      await page.getByPlaceholder("name@example.com").fill(invite.email);
      await page.getByRole("button", { name: "Stage access" }).click();

      const pendingCard = page
        .locator("[data-slot='card']")
        .filter({ hasText: "Pending access" });
      const grantRow = pendingCard
        .getByRole("row")
        .filter({ hasText: invite.email });
      await expect(grantRow).toBeVisible({ timeout: 30_000 });
      await expect(grantRow).toContainText("Volunteer");
      await expect(grantRow).toContainText("Pending");
      await expect(
        grantRow.getByRole("button", { name: "Invite" }),
      ).toBeVisible();

      await grantRow.getByRole("button", { name: "Revoke" }).click();
      const confirm = page.getByRole("alertdialog");
      await confirm.getByRole("button", { name: "Revoke" }).click();
      await expect(confirm).not.toBeVisible();

      // Assert the write first, so a failure here is unambiguous about
      // whether the action or its rendering is at fault.
      await expect(async () => {
        const { data } = await admin
          .from("pending_role_grants")
          .select("status")
          .eq("email", invite.email)
          .single();
        expect(data?.status).toBe("revoked");
      }).toPass({ timeout: 15_000 });

      await reloadStayingSignedIn(page);
      await expect(pendingCard).not.toContainText("No pending access staged.");
      await expect(grantRow).toContainText("Revoked", { timeout: 30_000 });
    } finally {
      await invite.cleanup();
    }
  });
});
