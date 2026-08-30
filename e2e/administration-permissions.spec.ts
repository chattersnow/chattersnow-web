import { test, expect } from "@playwright/test";
import { signIn, submitLogin } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { seedPortalUser, seedRole } from "./helpers/rbac";

// The Permissions page shows one role at a time: a Role select drives a
// Resource/Permission table, rather than the old grid with a column per role.
// It defaults to whichever role sorts first, so tests pick their role first.
async function selectRole(
  page: import("@playwright/test").Page,
  label: string,
) {
  await page.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

// Every resource section starts collapsed, so a resource's permission control
// is not in the DOM until its section is opened. Scoped to the table: the
// section names double as sidebar nav labels.
async function expandSection(
  page: import("@playwright/test").Page,
  section: string,
) {
  const toggle = page
    .getByRole("table")
    .getByRole("button", { name: section, exact: true });
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

test.describe("portal administration permissions", () => {
  test("loads the Permissions matrix", async ({ page }) => {
    await signIn(page);
    await page.goto("/portal/administration/permissions");

    await expect(
      page.getByRole("heading", { level: 1, name: "Permissions", exact: true }),
    ).toBeVisible();
    await selectRole(page, "Admin");

    await expect(
      page.getByRole("columnheader", { name: "Resource" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Permission" }),
    ).toBeVisible();

    await expandSection(page, "Administration");
    await expect(
      page.getByRole("combobox", {
        name: "Permission for Admin on Administration",
      }),
    ).toBeVisible();
  });

  // This test drives two browser sessions through several portal screens;
  // it is about what the matrix enforces, not how it reflows, so give it a
  // desktop viewport rather than the phone-sized default.
  test.describe("permission enforcement", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    // The highest-risk gap in Administration coverage: every other test here
    // asserts the admin screens render what was saved, not that the saved
    // matrix is what actually gates a different user's access. This drives a
    // brand-new role end to end -- assigned, granted, revoked -- and checks
    // each step against a second browser session signed in as its holder.
    test("a role's permissions gate what its holder can reach", async ({
      page,
      browser,
    }) => {
      test.slow();

      const admin = createAdminClient();
      const role = await seedRole(admin);
      const user = await seedPortalUser(admin);
      const memberContext = await browser.newContext();
      const memberPage = await memberContext.newPage();

      try {
        await signIn(page);
        await page.goto("/portal/administration/users");

        const row = page.getByRole("row").filter({ hasText: user.fullName });
        await expect(row).toBeVisible();
        await row
          .getByRole("button", { name: "Add role", exact: true })
          .click();
        await row.getByRole("combobox", { name: "Add role" }).click();
        await page
          .getByRole("option", { name: role.label, exact: true })
          .click();
        await row.getByRole("button", { name: "Add", exact: true }).click();
        await expect(
          row.getByRole("button", { name: `Remove ${role.label}` }),
        ).toBeVisible();

        // A role that grants nothing is not access: the portal bounces the
        // sign-in even though the credentials themselves are valid.
        await submitLogin(memberPage, user.email, user.password);
        await expect(memberPage).toHaveURL(/\/portal\/login\?error=no_access$/);

        await page.goto("/portal/administration/permissions");
        await selectRole(page, role.label);
        await expandSection(page, "Events");
        await page
          .getByRole("combobox", {
            name: `Permission for ${role.label} on Events`,
          })
          .click();
        await page.getByRole("option", { name: "View", exact: true }).click();
        await expect(page.getByText("1 unsaved change")).toBeVisible();

        await page.getByRole("button", { name: "Save changes" }).click();
        const saveDialog = page.getByRole("dialog");
        await expect(saveDialog).toContainText(role.label);
        await saveDialog
          .getByRole("button", { name: "Confirm & save" })
          .click();
        await expect(saveDialog).not.toBeVisible();

        // Route guards read the matrix on every request, so the grant applies
        // to the session that was already signed in -- no re-login needed.
        await memberPage.goto("/portal/events");
        await expect(
          memberPage.getByRole("heading", {
            level: 1,
            name: "Events",
            exact: true,
          }),
        ).toBeVisible();

        // View on Events and nothing else: Administration stays out of reach.
        await memberPage.goto("/portal/administration/users");
        await expect(memberPage).toHaveURL(/\/portal\/home$/);

        await page.goto("/portal/administration/users");
        await row.getByRole("button", { name: `Remove ${role.label}` }).click();
        await expect(row).toContainText("No access");

        await memberPage.goto("/portal/events");
        await expect(memberPage).toHaveURL(/\/portal\/login\?error=no_access$/);
      } finally {
        await memberContext.close();
        await user.cleanup();
        await role.cleanup();
      }
    });
  });
});
