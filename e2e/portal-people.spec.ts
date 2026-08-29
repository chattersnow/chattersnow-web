import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

// Seeded by supabase/seed.sql: Priya Natarajan (volunteer), Jamie Rivera
// (donor), and Summit Outdoor Co. (sponsor) are always present after a
// `supabase db reset`, so read-only tests lean on them instead of creating
// rows of their own.
test.describe("portal people directory", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("lists seeded people with their roles and contact details", async ({
    page,
  }) => {
    await page.goto("/portal/people");
    await expect(
      page.getByRole("heading", { level: 1, name: "People", exact: true }),
    ).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: "Priya Natarajan" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Volunteer");
    await expect(row).toContainText("priya.n@example.test");
  });

  test("opens a person's detail view from the directory", async ({ page }) => {
    await page.goto("/portal/people");

    await page
      .getByRole("row")
      .filter({ hasText: "Priya Natarajan" })
      .getByRole("button", { name: "View person" })
      .click();

    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("heading", { name: "Person", exact: true }),
    ).toBeVisible();
    await expect(sheet.getByText("Priya Natarajan")).toBeVisible();
    await expect(sheet.getByText("priya.n@example.test")).toBeVisible();
    await expect(sheet.getByText("Volunteer", { exact: true })).toBeVisible();
  });

  test("searches the directory by name", async ({ page }) => {
    await page.goto("/portal/people");

    await page.getByRole("button", { name: "Filters" }).click();
    const filters = page.getByRole("dialog");
    await filters.getByLabel("Search").fill("Priya");
    await filters.getByRole("button", { name: "Filter" }).click();

    await expect(page).toHaveURL(/search=Priya/);
    await expect(
      page.getByRole("row").filter({ hasText: "Priya Natarajan" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Jamie Rivera" }),
    ).toHaveCount(0);
  });

  test("filters the directory by role and clears filters", async ({ page }) => {
    await page.goto("/portal/people");

    await page.getByRole("button", { name: "Filters" }).click();
    const filters = page.getByRole("dialog");
    await filters.getByLabel("Role").selectOption("is_sponsor");
    await filters.getByRole("button", { name: "Filter" }).click();

    await expect(page).toHaveURL(/role=is_sponsor/);
    await expect(
      page.getByRole("row").filter({ hasText: "Summit Outdoor Co." }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Priya Natarajan" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Clear" }).click();
    await expect(page).toHaveURL(/\/portal\/people$/);
    await expect(
      page.getByRole("row").filter({ hasText: "Priya Natarajan" }),
    ).toBeVisible();
  });

  test("adds a person and edits them from their detail view", async ({
    page,
  }) => {
    await page.goto("/portal/people");

    const personName = `E2E Person ${Date.now()}`;
    const personEmail = `e2e.person.${Date.now()}@example.test`;

    await page.getByRole("button", { name: "New Person" }).click();
    const addDialog = page.getByRole("dialog");
    await expect(
      addDialog.getByRole("heading", { name: "Add person" }),
    ).toBeVisible();

    await addDialog.getByLabel("Name", { exact: true }).fill(personName);
    await addDialog.getByLabel("Email").fill(personEmail);
    await addDialog.getByLabel("Phone").fill("555-0142");
    await addDialog
      .locator("label")
      .filter({ hasText: "Volunteer" })
      .getByRole("checkbox")
      .click();
    await addDialog.getByRole("button", { name: "Add person" }).click();

    await expect(addDialog).not.toBeVisible();

    const row = page.getByRole("row").filter({ hasText: personName });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Volunteer");
    await expect(row).toContainText(personEmail);

    await row.getByRole("button", { name: "View person" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(personEmail)).toBeVisible();

    await sheet.getByRole("button", { name: "Edit person" }).click();
    const updatedNotes = `E2E updated notes ${Date.now()}`;
    await sheet.getByLabel("Notes").fill(updatedNotes);
    await sheet.getByRole("button", { name: "Save changes" }).click();

    await expect(
      sheet.getByRole("button", { name: "Edit person" }),
    ).toBeVisible();
    await expect(sheet.getByText(updatedNotes)).toBeVisible();
  });
});
