// Issue #443: E2E coverage for /portal/calendar/program-suggestions.
//
// Nothing seeds calendar_program_suggestion_rules, so every test here
// creates the rule it works on -- against a program of its own. The table
// carries a unique index on
// (coalesce(item_type,''), coalesce(category,''), program_id), so two runs
// mapping the same type/category pair to the same program collide, and the
// suite runs fully parallel across Playwright projects against one
// database. A per-test program keeps every triple distinct, and doubles as
// the rule's identity: both the table row and the details-sheet trigger are
// labelled by program name.
import { test, expect } from "./helpers/test";
import type { Page } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";

const SEEDED_PROGRAM = "Winter Access Program";

type ProgramFixture = { name: string; cleanup: () => Promise<void> };

async function seedProgram(label: string): Promise<ProgramFixture> {
  const admin = createAdminClient();
  const name = `E2E Suggest ${label} ${crypto.randomUUID().slice(0, 8)}`;

  // programs.created_by is NOT NULL and defaults to auth.uid(), which is
  // null for the service-role client -- borrow the seeded program's creator
  // rather than reaching into auth.users.
  const { data: seeded, error: seededError } = await admin
    .from("programs")
    .select("created_by")
    .eq("name", SEEDED_PROGRAM)
    .single();
  if (seededError) throw seededError;

  const { data, error } = await admin
    .from("programs")
    .insert({ name, status: "active", created_by: seeded.created_by })
    .select("id")
    .single();
  if (error) throw error;

  return {
    name,
    // calendar_program_suggestion_rules.program_id is ON DELETE CASCADE, so
    // dropping the program takes the test's rule with it.
    cleanup: async () => {
      await admin.from("programs").delete().eq("id", data.id);
    },
  };
}

async function selectOption(page: Page, trigger: string, option: string) {
  await modal(page).getByLabel(trigger).click();
  await page.getByRole("listbox").getByText(option, { exact: true }).click();
}

/** Creates a rule through the New rule dialog and returns its table row. */
async function createRule(page: Page, programName: string, note: string) {
  await page.getByRole("button", { name: "New rule" }).click();
  const dialog = modal(page);
  await expect(
    dialog.getByRole("heading", { name: "Create program suggestion rule" }),
  ).toBeVisible();

  await selectOption(page, "Item type", "Content opportunity");
  await selectOption(page, "Category", "Chatter events");
  await selectOption(page, "Suggested program", programName);
  await dialog.getByLabel("Note").fill(note);
  await dialog.getByRole("button", { name: "Create rule" }).click();

  await expect(dialog).not.toBeVisible();
  return page.getByRole("row").filter({ hasText: programName });
}

test.describe("portal calendar program suggestions", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("explains that suggestions are never applied automatically", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/program-suggestions");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Program Suggestions",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("nothing here assigns a program automatically", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "New rule" })).toBeVisible();
  });

  test("creates a rule and shows its mapping in the table", async ({
    page,
  }) => {
    const program = await seedProgram("mapping");
    try {
      await page.goto("/portal/calendar/program-suggestions");
      const row = await createRule(page, program.name, "E2E suggestion note");

      await expect(row).toBeVisible();
      await expect(row).toContainText("Content opportunity");
      await expect(row).toContainText("Chatter events");
      await expect(row).toContainText("E2E suggestion note");
      await expect(row).toContainText("Yes");
    } finally {
      await program.cleanup();
    }
  });

  test("opens a rule's details, edits it, and deletes it", async ({ page }) => {
    const program = await seedProgram("details");
    try {
      await page.goto("/portal/calendar/program-suggestions");
      const row = await createRule(page, program.name, "E2E editable note");
      await expect(row).toBeVisible();

      await row
        .getByRole("button", { name: `View rule suggesting ${program.name}` })
        .click();

      const sheet = modal(page);
      await expect(
        sheet.getByRole("heading", { name: program.name }),
      ).toBeVisible();
      // ReadOnlyField renders a labelled <div>, not a form control, so these
      // read by id rather than by label.
      await expect(sheet.locator("#rule-view-itemType")).toHaveText(
        "Content opportunity",
      );
      await expect(sheet.locator("#rule-view-category")).toHaveText(
        "Chatter events",
      );
      await expect(sheet.locator("#rule-view-note")).toHaveText(
        "E2E editable note",
      );
      await expect(sheet.locator("#rule-view-active")).toHaveText("Yes");

      await sheet.getByRole("button", { name: "Edit rule" }).click();
      await sheet.getByLabel("Note").fill("E2E edited note");
      await sheet.getByRole("button", { name: "Save changes" }).click();

      await expect(
        sheet.getByRole("button", { name: "Edit rule" }),
      ).toBeVisible();
      await expect(sheet.locator("#rule-view-note")).toHaveText(
        "E2E edited note",
      );

      await sheet.getByRole("button", { name: "Delete rule" }).click();
      const confirmDialog = page.getByRole("alertdialog");
      await expect(confirmDialog.getByText("Delete this rule?")).toBeVisible();
      await confirmDialog.getByRole("button", { name: "Delete" }).click();

      // Deleting closes the sheet. Wait for that before checking the table:
      // while a modal is open the rows behind it are out of the
      // accessibility tree, so a row query would come back empty either way.
      await expect(modal(page)).toHaveCount(0);
      await expect(
        page.getByRole("row").filter({ hasText: program.name }),
      ).toHaveCount(0);
    } finally {
      await program.cleanup();
    }
  });

  test("refuses a rule that would match every calendar item", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/program-suggestions");

    await page.getByRole("button", { name: "New rule" }).click();
    const dialog = modal(page);

    // Item type and category both left on "Any". Nothing is created, so this
    // one can point at the seeded program without risking the unique index.
    await selectOption(page, "Suggested program", SEEDED_PROGRAM);
    await dialog.getByRole("button", { name: "Create rule" }).click();

    await expect(
      dialog.getByText(
        "Select an item type, a category, or both — a rule can't match every item.",
      ),
    ).toBeVisible();
  });
});
