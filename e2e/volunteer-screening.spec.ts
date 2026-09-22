// Issue #1360: recording that a volunteer was screened, and nothing else.
//
// The three things worth driving a browser for: that an outcome recorded on a
// person's profile shows up there and on their volunteer application, that the
// level catalog is reachable and writable, and that a coordinator -- who holds
// volunteers:view and no screening at all -- sees none of it. The last one is
// the ticket's whole premise and is invisible to a unit test.
//
// Levels created here carry a unique name so the chromium and
// mobile-chromium projects, which test:e2e:pr runs fully in parallel against
// one Supabase instance, never touch each other's rows.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { seedUserWithRole } from "./helpers/rbac";
import { modal } from "./helpers/dialog";

type AdminClient = ReturnType<typeof createAdminClient>;

function levelName() {
  return `E2E Level ${crypto.randomUUID().slice(0, 8)}`;
}

/** A person of this spec's own, so no other spec's assertions move. */
async function seedPerson(admin: AdminClient) {
  const name = `E2E Screened ${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await admin
    .from("people")
    .insert({ name, source_type: "individual" })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, name };
}

test.describe("volunteer screening outcomes", () => {
  test("records an outcome and shows it on the person and the application", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const name = levelName();
    const person = await seedPerson(admin);
    let applicationId: string | null = null;

    try {
      await signIn(page);

      // The catalog ships empty on every tenant, so the level has to exist
      // before anything can be recorded against it.
      await page.goto("/portal/volunteers/screening");
      await expect(
        page.getByRole("heading", { level: 1, name: "Screening levels" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "New screening level" }).click();
      const createDialog = modal(page);
      await createDialog.getByLabel("Level").fill(name);
      await createDialog
        .getByLabel("What it covers")
        .fill("Created by an e2e test.");
      await createDialog
        .getByRole("button", { name: "Add screening level" })
        .click();
      await expect(createDialog).not.toBeVisible();
      await expect(
        page.getByRole("row").filter({ hasText: name }),
      ).toBeVisible();

      // An application, so the sheet has somewhere to show the outcome.
      const applicationId8 = crypto.randomUUID().slice(0, 8);
      const { data: application, error } = await admin
        .from("volunteer_applications")
        .insert({
          person_id: person.id,
          name: person.name,
          email: `${applicationId8}@example.test`,
          role_interest: "Ride Buddy",
          status: "being reviewed",
          // `reference_code` is NOT NULL and nothing supplies a default: the
          // column is filled by submit_volunteer_application(), so a direct
          // insert has to bring its own (#1372). The column only requires
          // uniqueness -- the public intake path's friendlier generator
          // (generate_volunteer_reference_code) is not granted to the service
          // role -- so a uuid slice stands in, exactly as
          // volunteer-applications.spec.ts already does.
          reference_code: applicationId8.toUpperCase(),
        })
        .select("id")
        .single();
      if (error) throw error;
      applicationId = application.id as string;

      // Recorded from the profile, which is the only place it can be.
      await page.goto(`/portal/people/${person.id}`);
      const card = page
        .locator('[data-slot="card"]')
        .filter({ hasText: "Screening" });
      await expect(card).toContainText("No screening outcome recorded");

      await card.getByRole("button", { name: "Record an outcome" }).click();
      const recordDialog = modal(page);
      await recordDialog
        .getByRole("combobox", { name: "Screening level" })
        .click();
      await page.getByRole("option", { name }).click();
      await recordDialog
        .getByRole("button", { name: "Record outcome" })
        .click();
      await expect(recordDialog).not.toBeVisible();

      await expect(card).toContainText(`Cleared for ${name}`);

      // And the same row, read-only, on the application sheet.
      await page.goto(
        `/portal/volunteers/applications?application=${applicationId}`,
      );
      const sheet = modal(page);
      await expect(
        sheet.getByRole("heading", { name: "Screening" }),
      ).toBeVisible();
      await expect(sheet).toContainText(`Cleared for ${name}`);
      // Read only: the outcome is recorded from the person, not from here.
      await expect(
        sheet.getByRole("button", { name: "Record an outcome" }),
      ).toHaveCount(0);
    } finally {
      if (applicationId) {
        await admin
          .from("volunteer_applications")
          .delete()
          .eq("id", applicationId);
      }
      await admin.from("person_screenings").delete().eq("person_id", person.id);
      await admin.from("volunteer_screening_tiers").delete().eq("name", name);
      await admin.from("people").delete().eq("id", person.id);
    }
  });

  // The premise of the whole ticket: volunteers:manage is not a way in.
  test("a coordinator sees no screening nav entry, no card and no section", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const person = await seedPerson(admin);
    const user = await seedUserWithRole(admin, "event_coordinator");

    try {
      await signIn(page, { email: user.email });

      await page.goto("/portal/volunteers/roles");
      await expect(
        page.getByRole("link", { name: "Screening levels" }),
      ).toHaveCount(0);

      // Reachable only by typing it, and refused by the route's own guard.
      await page.goto("/portal/volunteers/screening");
      await expect(page).toHaveURL(/\/portal\/home\?denied=/);

      await page.goto(`/portal/people/${person.id}`);
      await expect(
        page.locator('[data-slot="card"]').filter({ hasText: "Screening" }),
      ).toHaveCount(0);
    } finally {
      await admin.from("people").delete().eq("id", person.id);
      await user.cleanup();
    }
  });
});
