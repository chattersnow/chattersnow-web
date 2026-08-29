import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

// Seeded by supabase/seed.sql: the "Winter Access Program" (active) exists
// with the "Winter Gear Swap" event tagged to it, so read-only tests lean
// on it instead of creating rows of their own.
test.describe("portal programs", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("lists the seeded program with its status", async ({ page }) => {
    await page.goto("/portal/programs");
    await expect(
      page.getByRole("heading", { level: 1, name: "Programs", exact: true }),
    ).toBeVisible();

    const row = page
      .getByRole("row")
      .filter({ hasText: "Winter Access Program" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Active");
  });

  test("opens a program's details including its tagged events", async ({
    page,
  }) => {
    await page.goto("/portal/programs");

    await page
      .getByRole("button", { name: "View Winter Access Program" })
      .click();

    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("heading", { name: "Winter Access Program" }),
    ).toBeVisible();
    await expect(
      sheet.getByText(
        "Gear access and low-cost outdoor events for local participants.",
      ),
    ).toBeVisible();
    await expect(
      sheet.getByRole("row").filter({ hasText: "Winter Gear Swap" }),
    ).toBeVisible();
  });

  test("creates a program and edits it from the details sheet", async ({
    page,
  }) => {
    await page.goto("/portal/programs");

    const programName = `E2E Program ${Date.now()}`;

    await page.getByRole("button", { name: "New program" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(
      createDialog.getByRole("heading", { name: "Create program" }),
    ).toBeVisible();

    await createDialog.getByLabel("Program name").fill(programName);
    await createDialog
      .getByLabel("Description")
      .fill("Created by an e2e test.");
    await createDialog.getByLabel("Status").click();
    await page
      .getByRole("listbox")
      .getByText("Active", { exact: true })
      .click();
    await createDialog.getByRole("button", { name: "Create program" }).click();

    await expect(createDialog).not.toBeVisible();

    const row = page.getByRole("row").filter({ hasText: programName });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Active");

    await row.getByRole("button", { name: `View ${programName}` }).click();
    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByText("No events tagged to this program yet."),
    ).toBeVisible();

    await sheet.getByRole("button", { name: "Edit program" }).click();
    const updatedDescription = `E2E updated description ${Date.now()}`;
    await sheet.getByLabel("Description").fill(updatedDescription);
    await sheet.getByRole("button", { name: "Save changes" }).click();

    await expect(
      sheet.getByRole("button", { name: "Edit program" }),
    ).toBeVisible();
    await expect(sheet.getByText(updatedDescription)).toBeVisible();
  });
});

test.describe("portal program impact report", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("prompts for a program selection", async ({ page }) => {
    await page.goto("/portal/programs/reports");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Program Impact Report",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Select a program above to view its impact rollup."),
    ).toBeVisible();
  });

  test("renders the impact rollup for the selected program", async ({
    page,
  }) => {
    await page.goto("/portal/programs/reports");

    await page
      .getByLabel("Program")
      .selectOption({ label: "Winter Access Program" });
    await page.getByRole("button", { name: "View", exact: true }).click();

    await expect(page).toHaveURL(/programId=/);
    await expect(
      page.getByText("Select a program above to view its impact rollup."),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "All metrics" }),
    ).toBeVisible();

    // The seeded program has at least one tagged event, so the rollup
    // renders metric rows rather than the "no events yet" empty state.
    const eventsRow = page.getByRole("row").filter({ hasText: "Events" });
    await expect(eventsRow).toContainText(/\d/);
    await expect(
      page.getByRole("row").filter({ hasText: "Volunteer hours" }),
    ).toBeVisible();
  });
});
