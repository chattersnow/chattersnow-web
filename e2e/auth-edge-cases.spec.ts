import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import {
  createAdminClient,
  generateRecoveryLink,
} from "./helpers/admin-client";

test("invalid credentials show an error and do not redirect", async ({
  page,
}) => {
  await page.goto("/portal/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Those login details" }),
  ).toContainText("Those login details could not be verified.");
  await expect(page).toHaveURL(/\/portal\/login$/);
});

test("logging out returns to a signed-out state", async ({ page }) => {
  await signIn(page);

  // On mobile viewports the sidebar (and its Log out button) starts inside
  // a closed off-canvas sheet; open it via its trigger first. On desktop
  // it's already visible, so this is skipped.
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

  await page.goto("/portal/home");
  await expect(page).toHaveURL(/\/portal\/login$/);
});

test("visiting a protected route while signed out redirects to login", async ({
  page,
}) => {
  await page.goto("/portal/home");
  await expect(page).toHaveURL(/\/portal\/login$/);
});

// Creates its own throwaway account rather than borrowing a seeded one, the
// same approach volunteer-hours-self-log.spec.ts takes, because this test
// *rotates the account's password* and so cannot share it with anything.
//
// It used to pick a seeded account per browser project -- board, coordinator,
// finance, and volunteer -- on the stated assumption that none was used
// elsewhere in e2e/. That was true of the first three but not of
// volunteer@example.test, which portal-calendar-item-detail.spec.ts and
// volunteer-hours-self-log.spec.ts also sign in as. Once this test ran under
// mobile-chromium, volunteer@example.test's password was no longer the seeded
// one, and any later mobile-chromium test signing in as it failed with "Those
// login details could not be verified." -- surfacing far away, as
// portal-calendar-item-detail.spec.ts timing out on toHaveURL(/portal/home).
//
// A unique account per run also removes the race the per-project map existed
// for in the first place: Supabase invalidates a user's outstanding recovery
// token when a new one is generated for them, so two projects requesting a
// link for the same account starved one of them.
test("setting a password from a recovery link signs the user in", async ({
  page,
}) => {
  const admin = createAdminClient();
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `e2e-recovery-${suffix}@example.test`;

  const { data: userData, error: userError } =
    await admin.auth.admin.createUser({
      email,
      password: "InitialPassword123!",
      email_confirm: true,
    });
  if (userError || !userData.user) {
    throw userError ?? new Error("createUser returned no user");
  }
  const userId = userData.user.id;

  // Any role will do -- the assertion is just that the recovery flow lands
  // the user inside the portal -- but without one the portal bounces them
  // to /portal/login?error=no_access.
  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("name", "volunteer")
    .single();
  if (roleError) throw roleError;

  const { error: userRoleError } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_id: role.id, created_by: userId });
  if (userRoleError) throw userRoleError;

  try {
    const link = await generateRecoveryLink(email);

    // /auth/confirm redirects to a literal "localhost" origin regardless of
    // the request's actual Host header (true in both dev and production
    // builds). Requesting the link on that same origin up front, rather than
    // the suite's default 127.0.0.1 baseURL, keeps the session cookie set by
    // /auth/confirm on the origin the redirect actually lands on.
    const confirmUrl = new URL(link);
    confirmUrl.hostname = "localhost";
    await page.goto(confirmUrl.toString());
    await expect(page).toHaveURL(/\/portal\/set-password/);

    await page.getByLabel("Password", { exact: true }).fill("NewPassword123!");
    await page.getByLabel("Confirm password").fill("NewPassword123!");
    await page.getByRole("button", { name: "Set password" }).click();

    await expect(page).toHaveURL(/\/portal\/home$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard", exact: true }),
    ).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
