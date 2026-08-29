// Issue #443: E2E coverage for /portal/calendar/program-suggestions.
//
// Nothing seeds calendar_program_suggestion_rules, so every test here
// creates the rule it works on. The suite runs fully parallel across two
// Playwright projects against one database, and a rule's only visible
// identity in the table is its suggested program name (shared with every
// other rule pointing at the same program), so rows are located by a
// run-unique note rather than by program or by the sheet trigger's label.
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

const SEEDED_PROGRAM = "Winter Access Program";

function uniqueNote(label: string) {
  return `E2E ${label} ${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

async function selectOption(page: Page, trigger: string, option: string) {
  await page.getByRole("dialog").getByLabel(trigger).click();
  await page.getByRole("listbox").getByText(option, { exact: true }).click();
}

/** Creates a rule through the New rule dialog and returns its table row. */
async function createRule(page: Page, note: string) {
  await page.getByRole("button", { name: "New rule" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Create program suggestion rule" }),
  ).toBeVisible();

  await selectOption(page, "Item type", "Content opportunity");
  await selectOption(page, "Category", "Chatter events");
  await selectOption(page, "Suggested program", SEEDED_PROGRAM);
  await dialog.getByLabel("Note").fill(note);
  await dialog.getByRole("button", { name: "Create rule" }).click();

  await expect(dialog).not.toBeVisible();
  return page.getByRole("row").filter({ hasText: note });
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
        name: "Program suggestions",
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
    const note = uniqueNote("suggestion");

    await page.goto("/portal/calendar/program-suggestions");
    const row = await createRule(page, note);

    await expect(row).toBeVisible();
    await expect(row).toContainText("Content opportunity");
    await expect(row).toContainText("Chatter events");
    await expect(row).toContainText(SEEDED_PROGRAM);
    await expect(row).toContainText("Yes");
  });

  test("opens a rule's details, edits it, and deletes it", async ({ page }) => {
    const note = uniqueNote("editable");
    const updatedNote = uniqueNote("edited");

    await page.goto("/portal/calendar/program-suggestions");
    const row = await createRule(page, note);
    await expect(row).toBeVisible();

    // The trigger's label is only the program name, which other rules in a
    // parallel run share -- scope to this rule's own row.
    await row.getByRole("button", { name: /^View rule suggesting/ }).click();

    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("heading", { name: SEEDED_PROGRAM }),
    ).toBeVisible();
    // ReadOnlyField renders a labelled <div>, not a form control, so these
    // read by id rather than by label.
    await expect(sheet.locator("#rule-view-itemType")).toHaveText(
      "Content opportunity",
    );
    await expect(sheet.locator("#rule-view-category")).toHaveText(
      "Chatter events",
    );
    await expect(sheet.locator("#rule-view-note")).toHaveText(note);
    await expect(sheet.locator("#rule-view-active")).toHaveText("Yes");

    await sheet.getByRole("button", { name: "Edit rule" }).click();
    await sheet.getByLabel("Note").fill(updatedNote);
    await sheet.getByRole("button", { name: "Save changes" }).click();

    await expect(
      sheet.getByRole("button", { name: "Edit rule" }),
    ).toBeVisible();
    await expect(sheet.locator("#rule-view-note")).toHaveText(updatedNote);

    await sheet.getByRole("button", { name: "Delete rule" }).click();
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog.getByText("Delete this rule?")).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();

    await expect(
      page.getByRole("row").filter({ hasText: updatedNote }),
    ).toHaveCount(0);
  });

  test("refuses a rule that would match every calendar item", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/program-suggestions");

    await page.getByRole("button", { name: "New rule" }).click();
    const dialog = page.getByRole("dialog");

    // Item type and category both left on "Any".
    await selectOption(page, "Suggested program", SEEDED_PROGRAM);
    await dialog.getByRole("button", { name: "Create rule" }).click();

    await expect(
      dialog.getByText(
        "Select an item type, a category, or both — a rule can't match every item.",
      ),
    ).toBeVisible();
  });
});
