import { expect, type Page } from "@playwright/test";

export const SEEDED_PASSWORD = "password123";

/**
 * Fills and submits the login form without asserting where it lands.
 * Callers that expect a successful sign-in should use `signIn`; this is for
 * accounts whose sign-in is expected to bounce (no roles, deactivated).
 */
export async function submitLogin(
  page: Page,
  email: string,
  password: string = SEEDED_PASSWORD,
) {
  await page.goto("/portal/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function signIn(
  page: Page,
  opts?: { email?: string; password?: string },
) {
  await submitLogin(
    page,
    opts?.email ?? "admin@example.test",
    opts?.password ?? SEEDED_PASSWORD,
  );

  await expect(page).toHaveURL(/\/portal\/home$/);
}
