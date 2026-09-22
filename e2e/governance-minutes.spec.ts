import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";
import { pickPerson, seedPerson } from "./helpers/people";

// Taking minutes against the agenda (#1200). There was no e2e coverage of the
// agenda or the minutes at all before this.
//
// The assertion this spec exists for is the navigation round-trip: the
// complaint behind #1199-#1201 is that looking something up elsewhere in the
// portal mid-meeting discarded everything typed, so the test leaves the
// Minutes tab and comes back, and reads the notes off a server round-trip
// rather than off client state.

function uniqueSuffix() {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * An event inside the meeting's 30-day lookahead, so the Events section of the
 * minutes has a reference to open (#1223/#1225).
 *
 * `events.created_by` is `not null default auth.uid()`, which resolves to null
 * over the service-role client, so the row is stamped with the seeded admin's
 * own user id.
 */
async function seedLookaheadEvent(
  admin: ReturnType<typeof createAdminClient>,
  name: string,
) {
  const { data: adminPerson, error: personError } = await admin
    .from("people")
    .select("auth_user_id")
    .eq("email", "admin@example.test")
    .not("auth_user_id", "is", null)
    .limit(1)
    .single();
  if (personError) throw personError;

  const { data, error } = await admin
    .from("events")
    .insert({
      name,
      // Six days after the meeting below, and well inside its lookahead.
      starts_at: "2026-11-25T18:00:00.000Z",
      timezone: "America/Denver",
      location: "Riverside Park",
      status: "published",
      visibility: "private",
      created_by: adminPerson.auth_user_id,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

test.describe("portal governance minutes", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("starts minutes from the agenda, autosaves, survives a tab switch, then finalizes", async ({
    page,
  }) => {
    const admin = createAdminClient();
    // Location is the only free-text column the meetings table renders, so it
    // doubles as this meeting's row identifier.
    const location = `E2E Minutes Room ${uniqueSuffix()}`;
    const openingNote = `Quorum reached at 18:04 ${uniqueSuffix()}`;
    const secondNote = `Discussion recorded ${uniqueSuffix()}`;
    const actionItemText = `Chase the grant report ${uniqueSuffix()}`;
    const owner = await seedPerson(admin, "Minutes owner");
    const eventName = `E2E Minutes Lookahead ${uniqueSuffix()}`;
    const eventId = await seedLookaheadEvent(admin, eventName);

    try {
      await page.goto("/portal/governance/meetings");
      await page.getByRole("button", { name: "Schedule meeting" }).click();
      const scheduleDialog = modal(page);
      await scheduleDialog.getByLabel("Date & time").fill("2026-11-19T18:30");
      await scheduleDialog.getByLabel("Location").fill(location);
      await scheduleDialog
        .getByRole("button", { name: "Schedule meeting" })
        .click();
      await expect(scheduleDialog).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: location });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.getByRole("button", { name: "View meeting on" }).click();
      await expect(page).toHaveURL(/\/portal\/governance\/meetings\/[^/]+$/, {
        timeout: 15_000,
      });

      // An agenda first, so the minutes have something to be seeded from --
      // its meeting notes become the minutes' closing notes.
      await page.getByRole("tab", { name: "Agenda" }).click();
      await page.getByRole("button", { name: "Edit agenda" }).click();
      // "Agenda notes" since #1201 -- the field was called "Meeting notes"
      // while it *was* the minutes.
      await page.getByLabel("Agenda notes").fill("Planned: budget review.");
      await page.getByRole("button", { name: "Save agenda" }).click();
      await expect(
        page.getByRole("button", { name: "Edit agenda" }),
      ).toBeVisible({ timeout: 15_000 });

      await page.getByRole("tab", { name: "Minutes" }).click();
      await page
        .getByRole("button", { name: "Start minutes from agenda" })
        .click();

      // One notes box per frozen snapshot item. The opening, decisions,
      // parking lot and next meeting are always there, so there are at least
      // two regardless of which agenda template is active locally.
      const noteBoxes = page.getByRole("textbox", { name: /^Notes for / });
      await expect(noteBoxes.first()).toBeVisible({ timeout: 15_000 });
      // Through the locator so the count retries (#1294). The first box being
      // visible says nothing about the rest of the list having arrived, and
      // `await noteBoxes.count()` made that first sample the verdict.
      await expect(noteBoxes).not.toHaveCount(1);

      await noteBoxes.nth(0).fill(openingNote);
      await noteBoxes.nth(1).fill(secondNote);
      // No Save button anywhere in this tab: the status line is the receipt.
      await expect(page.getByText(/^Saved /)).toBeVisible({ timeout: 15_000 });

      // The quick-reference panel (#1201): raise an action item without
      // leaving the minutes. On a phone it is behind the Reference button; on
      // a desktop it is the sticky column beside the notes.
      // `exact`, because a role name is matched as a substring: without it
      // this also picks up every "N reference topics" tooltip trigger beside
      // the snapshot items, and there are eight of them.
      const reference = page.getByRole("button", {
        name: "Reference",
        exact: true,
      });
      if (await reference.isVisible()) await reference.click();
      await page.getByRole("button", { name: "Add", exact: true }).click();
      // Scoped by its own title: on a phone the reference sheet is still open
      // behind this one, and both carry role="dialog".
      const actionItemDialog = modal(page).filter({
        has: page.getByRole("heading", { name: "Add action item" }),
      });
      await pickPerson(actionItemDialog, owner.name);
      await actionItemDialog.getByLabel("Description").fill(actionItemText);
      await actionItemDialog
        .getByRole("button", { name: "Add action item" })
        .click();
      await expect(actionItemDialog).not.toBeVisible({ timeout: 15_000 });
      // Back in the panel's own list -- and the notes are still on screen,
      // which is the whole point of the panel.
      await expect(page.getByText(actionItemText).first()).toBeVisible({
        timeout: 15_000,
      });
      // Closed through its own button rather than with Escape, and waited on:
      // Base UI marks the page behind an open sheet inert, so the note
      // textboxes are out of the accessibility tree — and therefore out of
      // `getByRole`'s reach — until this has actually gone.
      const referenceSheet = modal(page).filter({
        has: page.getByRole("heading", { name: "Quick reference" }),
      });
      if (await referenceSheet.isVisible()) {
        await referenceSheet.getByRole("button", { name: "Close" }).click();
        await expect(referenceSheet).not.toBeVisible();
      }
      await expect(noteBoxes.nth(0)).toHaveValue(openingNote);

      // #1225: the other half of "without leaving". The Events section carries
      // the calendar's next 30 days, and opening one of those rows must show
      // the record without costing the notetaker a single word.
      await page.getByRole("button", { name: eventName }).click();
      const previewSheet = modal(page).filter({
        has: page.getByRole("heading", { name: eventName }),
      });
      await expect(previewSheet).toBeVisible({ timeout: 15_000 });
      // The event's own clock, not the runner's: the sheet says which evening.
      await expect(previewSheet.getByText(/MST|MDT/)).toBeVisible();
      await expect(previewSheet.getByText("Riverside Park")).toBeVisible();
      // "More details" has a floor -- whatever the sheet leaves out is one
      // click away.
      await expect(
        previewSheet.getByRole("link", { name: "Open full record" }),
      ).toHaveAttribute("href", `/portal/events/${eventId}`);

      await previewSheet.getByRole("button", { name: "Close" }).click();
      await expect(previewSheet).not.toBeVisible();
      // The regression worth a test: a reference lookup that costs somebody
      // their notes. Still on the page, still unsaved-free, still exactly what
      // was typed.
      await expect(noteBoxes.nth(0)).toHaveValue(openingNote);
      await expect(noteBoxes.nth(1)).toHaveValue(secondNote);

      // The whole point. Leaving for another part of the meeting record used
      // to discard every word of this.
      await page.getByRole("tab", { name: "Overview" }).click();
      await expect(page.getByText("Meeting details")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("tab", { name: "Minutes" }).click();

      // Base UI unmounted this panel on the way out, so these values come back
      // from the database, not from client state that was never thrown away.
      await expect(noteBoxes.nth(0)).toHaveValue(openingNote, {
        timeout: 15_000,
      });
      await expect(noteBoxes.nth(1)).toHaveValue(secondNote);

      await page.getByRole("button", { name: "Finalize" }).click();
      // `alertdialog`, not `modal()`: a lifecycle confirm is a question, not a
      // form, so it stays on `AlertDialog` and centred on both devices.
      const finalizeDialog = page.getByRole("alertdialog");
      await expect(
        finalizeDialog.getByRole("heading", {
          name: "Finalize these minutes?",
        }),
      ).toBeVisible();
      await finalizeDialog.getByRole("button", { name: "Finalize" }).click();

      // Final minutes are a document, not a form.
      await expect(page.getByText("Final", { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(openingNote)).toBeVisible();
      await expect(noteBoxes).toHaveCount(0);

      await page.getByRole("button", { name: "Reopen" }).click();
      const reopenDialog = page.getByRole("alertdialog");
      await expect(
        reopenDialog.getByRole("heading", { name: "Reopen these minutes?" }),
      ).toBeVisible();
      await reopenDialog.getByRole("button", { name: "Reopen" }).click();

      await expect(noteBoxes.nth(0)).toHaveValue(openingNote, {
        timeout: 15_000,
      });
    } finally {
      // `meeting_minutes` and the action items both cascade from the meeting,
      // and the owner has to outlive the items that point at it.
      await admin.from("governance_meetings").delete().eq("location", location);
      await admin.from("events").delete().eq("id", eventId);
      await admin.from("people").delete().eq("id", owner.id);
    }
  });
});
