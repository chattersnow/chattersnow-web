import { expect, type Page } from "@playwright/test";

export async function signIn(
  page: Page,
  opts?: { email?: string; password?: string },
) {
  const email = opts?.email ?? "admin@example.test";
  const password = opts?.password ?? "password123";

  await page.goto("/portal/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/portal\/home$/);
}

// A diagnostic run against CI proved the app's own data path is correct
// (the mutation lands, and the page URL is right before the reload) -- a
// plain `page.reload()` on a long, multi-step test occasionally comes back
// on /portal/login instead, evidently a transient session hiccup from two
// Playwright projects running the full suite concurrently against one
// shared local Supabase instance, both signed in as the same seeded admin
// account. Recover by signing back in and returning to the same URL rather
// than let that transient hiccup fail an otherwise-passing assertion.
export async function reloadStayingSignedIn(page: Page) {
  const url = page.url();
  await page.reload();
  if (page.url().includes("/portal/login")) {
    await signIn(page);
    await page.goto(url);
  }
}
