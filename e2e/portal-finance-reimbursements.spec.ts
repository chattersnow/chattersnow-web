// Issue #440: E2E coverage for /portal/finance/reimbursements, testing
// through the shared approval workflow extracted in #282 (createApprovalWorkflow
// et al. in src/lib/finance/approval-workflow.ts) rather than around it -- the
// same rules already exercised for expenses apply here via that shared module.
//
// Uses freshly created auth users (rather than the shared seeded accounts)
// for the submitter/approver roles: this file's tests may run fully in
// parallel across Playwright projects, and the approval flow needs a
// submitter who is NOT the approver, which the shared seeded accounts can't
// safely provide without racing another run's sign-ins (see
// volunteer-hours-self-log.spec.ts for the same reasoning).
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";
import { markOnboarded } from "./helpers/onboarding";
import { pickPerson } from "./helpers/people";

type RoleUser = {
  userId: string;
  email: string;
  password: string;
};

async function createRoleUser(
  admin: ReturnType<typeof createAdminClient>,
  roleName: string,
  label: string,
): Promise<RoleUser> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `e2e-${label}-${suffix}@example.test`;
  const password = "password123";

  const { data: userData, error: userError } =
    await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (userError || !userData.user) {
    throw userError ?? new Error("createUser returned no user");
  }
  const userId = userData.user.id;
  await markOnboarded(admin, userId);

  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("name", roleName)
    .single();
  if (roleError) throw roleError;

  const { error: userRoleError } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_id: role.id, created_by: userId });
  if (userRoleError) throw userRoleError;

  return { userId, email, password };
}

async function seedRequester(admin: ReturnType<typeof createAdminClient>) {
  const name = `E2E Requester ${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await admin
    .from("people")
    .insert({ name, source_type: "individual" })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, name };
}

async function logOut(page: Page) {
  const logoutButton = page.getByRole("button", { name: "Log out" });
  if (!(await logoutButton.isVisible())) {
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  }
  await logoutButton.click();
  // Logging out asks for confirmation since 355a8f7; the dialog's action
  // button carries the same "Log out" label as the sidebar trigger.
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Log out" })
    .click();
  await expect(page).toHaveURL(/\/portal\/login$/);
}

test.describe("portal finance reimbursements", () => {
  test("loads the Reimbursements page", async ({ page }) => {
    await signIn(page);
    await page.goto("/portal/finance/reimbursements");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Reimbursements",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("submits a below-threshold reimbursement and self-approves it", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const finance = await createRoleUser(admin, "finance", "finance");
    const requester = await seedRequester(admin);

    try {
      await signIn(page, { email: finance.email, password: finance.password });
      await page.goto("/portal/finance/reimbursements");

      const description = `E2E Reimbursement ${Date.now()}`;

      await page.getByRole("button", { name: "New Reimbursement" }).click();
      const addDialog = modal(page);
      await expect(
        addDialog.getByRole("heading", { name: "Add reimbursement" }),
      ).toBeVisible();

      await pickPerson(addDialog, requester.name);
      await addDialog.getByLabel("Description").fill(description);
      // Reimbursement threshold defaults to $500 -- this stays under it so
      // the submitter (finance) is eligible to self-approve.
      await addDialog.getByLabel("Amount").fill("42.50");
      await addDialog
        .getByRole("button", { name: "Add reimbursement" })
        .click();

      await expect(addDialog).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: description });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Submitted");

      await row.getByRole("button", { name: "View reimbursement" }).click();
      const viewSheet = modal(page);
      await expect(
        viewSheet.getByText("you can self-approve this"),
      ).toBeVisible();

      await viewSheet.getByRole("button", { name: "Approve" }).click();
      // finance also holds the "reimbursements" permission markPaid is
      // gated on, so the next-step message points at marking it paid
      // rather than the generic "awaiting payment" a non-finance approver
      // would see.
      await expect(
        viewSheet.getByText(
          "Approved — mark it as paid once payment has been sent.",
        ),
      ).toBeVisible();

      await viewSheet.getByRole("button", { name: "Mark as paid" }).click();
      await expect(
        viewSheet.getByText("Paid. This reimbursement is complete."),
      ).toBeVisible();
    } finally {
      await admin.from("reimbursements").delete().eq("person_id", requester.id);
      await admin.from("people").delete().eq("id", requester.id);
      await admin.auth.admin.deleteUser(finance.userId);
    }
  });

  test("a reimbursement at or above the threshold needs a different approver, who can reject it", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const finance = await createRoleUser(admin, "finance", "finance");
    const approver = await createRoleUser(admin, "admin", "approver");
    const requester = await seedRequester(admin);

    try {
      await signIn(page, { email: finance.email, password: finance.password });
      await page.goto("/portal/finance/reimbursements");

      const description = `E2E Reimbursement ${Date.now()}`;

      await page.getByRole("button", { name: "New Reimbursement" }).click();
      const addDialog = modal(page);
      await pickPerson(addDialog, requester.name);
      await addDialog.getByLabel("Description").fill(description);
      // At or above the $500 threshold, the submitter can't self-approve --
      // it needs an admin or board member who isn't them.
      await addDialog.getByLabel("Amount").fill("750.00");
      await addDialog
        .getByRole("button", { name: "Add reimbursement" })
        .click();
      await expect(addDialog).not.toBeVisible();

      const submitterRow = page
        .getByRole("row")
        .filter({ hasText: description });
      await submitterRow
        .getByRole("button", { name: "View reimbursement" })
        .click();
      const submitterSheet = modal(page);
      await expect(
        submitterSheet.getByText(
          "needs approval from another admin or board member",
        ),
      ).toBeVisible();
      await expect(
        submitterSheet.getByRole("button", { name: "Approve" }),
      ).not.toBeAttached();
      await expect(
        submitterSheet.getByRole("button", { name: "Reject" }),
      ).not.toBeAttached();
      await submitterSheet.getByRole("button", { name: "Close" }).click();

      await logOut(page);
      await signIn(page, {
        email: approver.email,
        password: approver.password,
      });
      await page.goto("/portal/finance/reimbursements");

      const approverRow = page
        .getByRole("row")
        .filter({ hasText: description });
      await approverRow
        .getByRole("button", { name: "View reimbursement" })
        .click();
      const approverSheet = modal(page);
      await expect(
        approverSheet.getByRole("button", { name: "Reject" }),
      ).toBeVisible();

      await approverSheet.getByRole("button", { name: "Reject" }).click();
      const rejectDialog = page.getByRole("dialog", {
        name: "Reject reimbursement",
      });
      const reason = "Missing receipt for this request.";
      await rejectDialog.getByLabel("Reason").fill(reason);
      await rejectDialog
        .getByRole("button", { name: "Reject reimbursement" })
        .click();
      await expect(rejectDialog).not.toBeVisible();

      await expect(
        approverSheet.getByText("Rejected. See the reason below."),
      ).toBeVisible();
      await expect(approverSheet.getByText(reason)).toBeVisible();
    } finally {
      await admin.from("reimbursements").delete().eq("person_id", requester.id);
      await admin.from("people").delete().eq("id", requester.id);
      await admin.auth.admin.deleteUser(finance.userId);
      await admin.auth.admin.deleteUser(approver.userId);
    }
  });
});
