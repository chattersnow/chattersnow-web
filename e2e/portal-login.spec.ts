import { test, expect } from "@playwright/test";

test("signing in redirects to the portal home", async ({ page }) => {
  await page.goto("/portal/login");

  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/portal\/home$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Dashboard", exact: true }),
  ).toBeVisible();
});

test("a deep link survives being bounced through sign-in", async ({ page }) => {
  // Signed out, the portal layout redirects here -- and used to drop the
  // destination, so every shared portal link landed on the dashboard.
  await page.goto("/portal/people");
  await expect(page).toHaveURL(/\/portal\/login\?next=/);

  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/portal\/people$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "People", exact: true }),
  ).toBeVisible();
});

test("the login page offers a way back to the public site", async ({
  page,
}) => {
  await page.goto("/portal/login");
  await expect(
    page.getByRole("heading", { level: 1, name: "Operations Portal" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to chattersnow.org" }).click();
  await expect(page).toHaveURL(/\/home$/);
});
