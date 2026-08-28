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
