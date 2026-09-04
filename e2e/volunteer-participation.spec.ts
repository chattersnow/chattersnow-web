// Issue #446: E2E coverage for /portal/volunteers/participation from the
// manage side -- logging hours on another volunteer's behalf, editing an
// entry, and removing it, plus what a volunteers:view-only role sees.
// The self-log-only path (issue #352) is covered by
// volunteer-hours-self-log.spec.ts and deliberately not repeated here.
//
// The volunteer each test logs against is created fresh rather than reusing
// seeded Priya Natarajan: test:e2e:pr runs the chromium and mobile-chromium
// projects fully in parallel against one Supabase instance, and both would
// otherwise write and delete hours on the same person's rows.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { seedUserWithRole } from "./helpers/rbac";
import { modal } from "./helpers/dialog";
import { pickPerson } from "./helpers/people";

type AdminClient = ReturnType<typeof createAdminClient>;

async function seedVolunteer(admin: AdminClient) {
  const id = crypto.randomUUID().slice(0, 8);
  const name = `E2E Volunteer ${id}`;

  const { data, error } = await admin
    .from("people")
    .insert({
      name,
      email: `e2e-participation-${id}@example.test`,
      source_type: "individual",
    })
    .select("id")
    .single();
  if (error) throw error;

  // The volunteer role is derived from records, and this person has none yet
  // -- the test logs their first hours through the UI -- so the tag is what
  // makes them a volunteer until then. It cascades with the person row.
  const { error: tagError } = await admin
    .from("person_role_tags")
    .insert({ person_id: data.id, role: "volunteer" });
  if (tagError) throw tagError;

  return {
    id: data.id as string,
    name,
    async cleanup() {
      await admin.from("volunteer_hours").delete().eq("person_id", data.id);
      await admin.from("people").delete().eq("id", data.id);
    },
  };
}

test.describe("portal volunteer participation", () => {
  test("logs hours for another volunteer, then edits and removes the entry", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const volunteer = await seedVolunteer(admin);

    try {
      await signIn(page);
      await page.goto("/portal/volunteers/participation");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Participation",
          exact: true,
        }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Log hours" }).click();
      const dialog = page.getByRole("dialog", { name: "Log volunteer hours" });
      await expect(dialog).toBeVisible();

      await pickPerson(dialog, volunteer.name);
      await dialog.getByLabel("Hours").fill("3.25");

      // Both selects render their popup outside the dialog, so the options
      // are only reachable from the page root. "Winter Gear Swap" and
      // "Ride Buddy" are seeded by supabase/seed.sql and only ever read by
      // the other specs, so they're stable to pick here.
      await dialog.getByRole("combobox", { name: "Event (optional)" }).click();
      await page
        .getByRole("option", { name: "Winter Gear Swap", exact: true })
        .click();
      await dialog
        .getByRole("combobox", { name: "Role type (optional)" })
        .click();
      await page
        .getByRole("option", { name: "Ride Buddy", exact: true })
        .click();
      await dialog.getByLabel("Notes").fill("Logged by an e2e test.");

      await dialog.getByRole("button", { name: "Log hours" }).click();
      await expect(dialog).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: volunteer.name });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Winter Gear Swap");
      await expect(row).toContainText("Ride Buddy");
      await expect(row).toContainText("3.25");

      await row
        .getByRole("button", { name: `View hours for ${volunteer.name}` })
        .click();
      // Not matched by name: the sheet's title flips to "Edit hours" as
      // soon as edit mode is on.
      const sheet = modal(page);
      await expect(sheet.getByText("Logged by an e2e test.")).toBeVisible();
      await expect(sheet.getByText("Winter Gear Swap")).toBeVisible();

      await sheet.getByRole("button", { name: "Edit hours entry" }).click();
      await sheet.getByLabel("Hours").fill("4.5");
      await sheet.getByRole("button", { name: "Save changes" }).click();

      // Saving returns the sheet to view mode, showing what just landed.
      await expect(
        sheet.getByRole("button", { name: "Edit hours entry" }),
      ).toBeVisible();
      await expect(sheet.getByText("4.5")).toBeVisible();

      // The sheet is modal, so the table behind it is aria-hidden until
      // it's closed -- no role-based locator resolves against the row
      // before then.
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(sheet).not.toBeVisible();
      await expect(row).toContainText("4.5");

      await row.getByRole("button", { name: "Remove hours entry" }).click();
      // Logged hours feed grant reporting and there's no undo, so the delete
      // confirms first.
      const confirmDelete = page.getByRole("alertdialog");
      await expect(confirmDelete).toContainText("logged hours?");
      await confirmDelete
        .getByRole("button", { name: "Remove", exact: true })
        .click();
      await expect(row).toHaveCount(0);
    } finally {
      await volunteer.cleanup();
    }
  });

  test("a view-only user sees logged hours but can't log or change them", async ({
    page,
  }) => {
    const admin = createAdminClient();
    // event_coordinator holds volunteers:view and volunteer_hours_logging:none,
    // so the whole logging surface should be absent for them.
    const coordinator = await seedUserWithRole(admin, "event_coordinator");
    const volunteer = await seedVolunteer(admin);

    try {
      const { error } = await admin.from("volunteer_hours").insert({
        person_id: volunteer.id,
        hours: 2.5,
        notes: "Seeded by an e2e test.",
        // Defaults to auth.uid(), which is null for the service role.
        logged_by: coordinator.userId,
      });
      if (error) throw error;

      await signIn(page, {
        email: coordinator.email,
        password: coordinator.password,
      });
      await page.goto("/portal/volunteers/participation");

      const row = page.getByRole("row").filter({ hasText: volunteer.name });
      await expect(row).toBeVisible();
      await expect(row).toContainText("2.5");
      await expect(
        page.getByRole("button", { name: "Log hours" }),
      ).not.toBeAttached();
      await expect(
        row.getByRole("button", { name: "Remove hours entry" }),
      ).not.toBeAttached();

      await row
        .getByRole("button", { name: `View hours for ${volunteer.name}` })
        .click();
      const sheet = modal(page);
      await expect(sheet.getByText("Seeded by an e2e test.")).toBeVisible();
      await expect(
        sheet.getByRole("button", { name: "Edit hours entry" }),
      ).not.toBeAttached();
    } finally {
      await volunteer.cleanup();
      await coordinator.cleanup();
    }
  });
});
