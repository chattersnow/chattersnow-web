import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { generateRecoveryLink } from "./helpers/admin-client";

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

// Supabase invalidates a user's outstanding recovery token when a new one
// is generated for them, so running this test for the same account from two
// browser projects in parallel races and starves one of them. Each project
// gets its own seeded account (none used elsewhere in e2e/) to avoid that.
const RECOVERY_ACCOUNT_BY_PROJECT: Record<string, string> = {
  chromium: "board@example.test",
  firefox: "coordinator@example.test",
  webkit: "finance@example.test",
  "mobile-chromium": "volunteer@example.test",
};

test("setting a password from a recovery link signs the user in", async ({
  page,
}, testInfo) => {
  const email =
    RECOVERY_ACCOUNT_BY_PROJECT[testInfo.project.name] ?? "board@example.test";
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
});
