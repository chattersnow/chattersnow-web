import { test, expect } from "@playwright/test";
import { signIn, reloadStayingSignedIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { seedPerson } from "./helpers/people";

// Governance routes that revolve around the board and its meeting record
// (#442). The document-shaped routes -- bylaws, policies, conflict of
// interest, annual requirements -- are covered by
// governance-records.spec.ts; nonprofit-status has its own spec.

function uniqueSuffix() {
  return crypto.randomUUID().slice(0, 8);
}

// Badge pills render their raw database value and are capitalized in CSS
// only, so assertions against them have to use the lowercase DOM text.

test.describe("portal governance board, meetings, and resolutions", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("adds a board member, then edits their role title", async ({ page }) => {
    const admin = createAdminClient();
    const person = await seedPerson(admin, "Board Member");
    const roleTitle = `E2E Role ${uniqueSuffix()}`;
    const updatedRoleTitle = `${roleTitle} (revised)`;

    try {
      await page.goto("/portal/governance/board-members");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Board Members",
          exact: true,
        }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Add board member" }).click();
      const addDialog = page.getByRole("dialog");
      await expect(
        addDialog.getByRole("heading", { name: "Add board member" }),
      ).toBeVisible();

      await addDialog
        .getByPlaceholder("Search by name or email...")
        .fill(person.name);
      await addDialog.getByRole("button", { name: person.name }).click();
      await expect(addDialog.getByText(person.name)).toBeVisible();

      await addDialog.getByLabel("Role / title").fill(roleTitle);
      await addDialog.getByLabel("Term start").fill("2026-01-05");
      await addDialog.getByRole("button", { name: "Add board member" }).click();
      await expect(addDialog).not.toBeVisible();

      // The table defaults to the Active filter, and the form defaults to an
      // active term, so a new member shows without touching the filters.
      const row = page.getByRole("row").filter({ hasText: roleTitle });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText(person.name);
      await expect(row).toContainText("Active");

      await row.getByRole("button", { name: "View board member" }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet.getByText(roleTitle)).toBeVisible();
      await expect(sheet.getByText(person.name)).toBeVisible();

      await sheet.getByRole("button", { name: "Edit board member" }).click();
      await sheet.getByLabel("Role / title").fill(updatedRoleTitle);
      await sheet.getByRole("button", { name: "Save changes" }).click();

      // Saving drops back to view mode against the refreshed server data.
      await expect(sheet.getByText(updatedRoleTitle)).toBeVisible({
        timeout: 15_000,
      });

      // Reload rather than closing the sheet: the table behind an open
      // sheet is aria-hidden (invisible to role-based locators), and a
      // fresh load also proves the edit round-tripped to the database
      // instead of only reaching the sheet's own client state.
      await reloadStayingSignedIn(page);
      await expect(
        page.getByRole("row").filter({ hasText: updatedRoleTitle }),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await admin.from("board_members").delete().eq("person_id", person.id);
      await admin.from("people").delete().eq("id", person.id);
    }
  });

  test("schedules a meeting, logs an action item, and completes it", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const owner = await seedPerson(admin, "Action Owner");
    // Location is the only free-text column the meetings table renders, so
    // it doubles as this meeting's row identifier.
    const location = `E2E Meeting Room ${uniqueSuffix()}`;
    const actionItem = `E2E Action Item ${uniqueSuffix()}`;

    try {
      await page.goto("/portal/governance/meetings");
      await expect(
        page.getByRole("heading", { level: 1, name: "Meetings", exact: true }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Schedule meeting" }).click();
      const addDialog = page.getByRole("dialog");
      await expect(
        addDialog.getByRole("heading", { name: "Schedule meeting" }),
      ).toBeVisible();

      await addDialog.getByLabel("Date & time").fill("2026-11-12T18:30");
      await addDialog.getByLabel("Location").fill(location);
      await addDialog.getByRole("button", { name: "Schedule meeting" }).click();
      await expect(addDialog).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: location });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText("scheduled");

      await row.getByRole("button", { name: "View meeting on" }).click();
      await expect(page).toHaveURL(/\/portal\/governance\/meetings\/[^/]+$/, {
        timeout: 15_000,
      });
      // The detail page's sections are flat and always visible (no dialog
      // to scope into), so assert straight against the page.
      await expect(page.getByText(location)).toBeVisible({
        timeout: 15_000,
      });

      // Editing is per card on the detail page now -- no sheet -- and the
      // sub-record sections sit directly under Overview, already live for a
      // manager, so there is no shared edit-mode toggle to flip first.
      await page.getByRole("button", { name: "+ Add action item" }).click();
      const actionItemForm = page
        .locator("form")
        .filter({ hasText: "Add action item" });
      await actionItemForm
        .getByPlaceholder("Search by name or email...")
        .fill(owner.name);
      await actionItemForm.getByRole("button", { name: owner.name }).click();
      await actionItemForm.getByLabel("Description").fill(actionItem);
      await actionItemForm
        .getByRole("button", { name: "Add action item", exact: true })
        .click();

      const actionItemRow = page
        .getByRole("row")
        .filter({ hasText: actionItem });
      await expect(actionItemRow).toBeVisible({ timeout: 15_000 });
      await expect(actionItemRow).toContainText(owner.name);

      // A plain click, not check(): the checkbox is fully controlled by the
      // server-side status, so it only flips once the update round-trips and
      // the tab refetches. check() asserts the state changed synchronously
      // with the click and fails on that gap.
      await actionItemRow.getByRole("checkbox").click();
      await expect(actionItemRow.getByRole("checkbox")).toBeChecked({
        timeout: 15_000,
      });

      // Status lives on the meeting-details card, edited in place.
      await page.getByRole("button", { name: "Edit meeting details" }).click();
      const statusSelect = page.getByLabel("Status");
      await statusSelect.click();
      await page
        .getByRole("listbox")
        .getByRole("option", { name: "Completed" })
        .click();
      // Confirm the selection actually landed in form state before
      // submitting -- the trigger renders the selected item's label.
      await expect(statusSelect).toContainText("Completed");

      await page.getByRole("button", { name: "Save changes" }).click();
      // Saving drops the card back to view mode, where its edit trigger
      // reappears; a rejected action would instead keep the form up with an
      // error alert.
      await expect(
        page.getByRole("button", { name: "Edit meeting details" }),
      ).toBeVisible({ timeout: 15_000 });

      // Reload the detail page (not the list -- #462 moved this flow off
      // it) to prove the status update round-tripped to the database.
      await reloadStayingSignedIn(page);
      await expect(page.locator("#meeting-status-view")).toContainText(
        "completed",
        { timeout: 15_000 },
      );
    } finally {
      // governance_meeting_action_items cascades from the meeting.
      await admin.from("governance_meetings").delete().eq("location", location);
      await admin.from("people").delete().eq("id", owner.id);
    }
  });

  test("records a resolution and updates its vote outcome", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const mover = await seedPerson(admin, "Mover");
    const motionText = `E2E Motion ${uniqueSuffix()}`;

    try {
      await page.goto("/portal/governance/resolutions");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Resolutions",
          exact: true,
        }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Add resolution" }).click();
      const addDialog = page.getByRole("dialog");
      await expect(
        addDialog.getByRole("heading", { name: "Add resolution" }),
      ).toBeVisible();

      // The dialog holds a mover picker and a seconder picker; the mover
      // comes first, and the seconder is optional.
      await addDialog
        .getByPlaceholder("Search by name or email...")
        .first()
        .fill(mover.name);
      await addDialog.getByRole("button", { name: mover.name }).click();

      await addDialog.getByLabel("Motion text").fill(motionText);
      const newOutcome = addDialog.getByLabel("Vote outcome");
      await newOutcome.click();
      await page
        .getByRole("listbox")
        .getByRole("option", { name: "Passed" })
        .click();
      await expect(newOutcome).toContainText("Passed");
      await addDialog.getByRole("button", { name: "Add resolution" }).click();
      await expect(addDialog).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: motionText });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText(mover.name);
      await expect(row).toContainText("passed");

      await row.getByRole("button", { name: "View resolution" }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet.getByText(motionText)).toBeVisible();

      // The Save button only renders in edit mode, so it doubles as the
      // confirmation that the mode switch landed.
      await sheet.getByRole("button", { name: "Edit resolution" }).click();
      const editOutcome = sheet.getByLabel("Vote outcome");
      await expect(
        sheet.getByRole("button", { name: "Save changes" }),
      ).toBeVisible();

      await editOutcome.click();
      await page
        .getByRole("listbox")
        .getByRole("option", { name: "Tabled" })
        .click();
      // Confirm the selection actually landed in form state before
      // submitting -- the trigger renders the selected item's label.
      await expect(editOutcome).toContainText("Tabled");

      await sheet.getByRole("button", { name: "Save changes" }).click();
      // Saving drops back to view mode, where the Edit button reappears; a
      // rejected action would instead keep the form up with an error alert.
      await expect(
        sheet.getByRole("button", { name: "Edit resolution" }),
      ).toBeVisible({ timeout: 15_000 });

      await reloadStayingSignedIn(page);
      await expect(
        page.getByRole("row").filter({ hasText: motionText }),
      ).toContainText("tabled", { timeout: 15_000 });
    } finally {
      await admin.from("resolutions").delete().eq("mover_person_id", mover.id);
      await admin.from("people").delete().eq("id", mover.id);
    }
  });
});
