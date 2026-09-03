// Issue #446: E2E coverage for /portal/volunteers/applications, the review
// queue for volunteer interest submitted from the public site.
//
// Every test seeds its own application (plus the person row its FK needs)
// rather than acting on the seeded Morgan Ellis / Taylor Kim rows:
// test:e2e:pr runs the chromium and mobile-chromium projects fully in
// parallel against one Supabase instance, so two runs moving the same
// application through its statuses would race (same reasoning as
// volunteer-hours-self-log.spec.ts).
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { seedUserWithRole } from "./helpers/rbac";
import { modal } from "./helpers/dialog";

type AdminClient = ReturnType<typeof createAdminClient>;

async function seedApplication(admin: AdminClient, status = "new") {
  const id = crypto.randomUUID().slice(0, 8);
  const name = `E2E Applicant ${id}`;
  const email = `e2e-applicant-${id}@example.test`;

  const { data: person, error: personError } = await admin
    .from("people")
    .insert({ name, email, source_type: "individual", is_volunteer: true })
    .select("id")
    .single();
  if (personError) throw personError;

  const { data: application, error } = await admin
    .from("volunteer_applications")
    .insert({
      person_id: person.id,
      name,
      email,
      phone: "555-0199",
      role_interest: "Ride Buddy",
      availability: "Weekend mornings",
      status,
      // The column only requires uniqueness -- the public intake path's
      // friendlier generator (generate_volunteer_reference_code) isn't
      // granted to the service role, so a uuid slice stands in here.
      reference_code: id.toUpperCase(),
    })
    .select("id")
    .single();
  if (error) throw error;

  return {
    name,
    email,
    /** The list is ordered newest-first and paginated, so filtering by the
     * application's unique name is what keeps the row reachable however
     * many other rows a parallel run has added. */
    url: `/portal/volunteers/applications?search=${encodeURIComponent(name)}`,
    async cleanup() {
      await admin
        .from("volunteer_applications")
        .delete()
        .eq("id", application.id);
      await admin.from("people").delete().eq("id", person.id);
    },
  };
}

test.describe("portal volunteer applications", () => {
  test("lists a submitted application with its status", async ({ page }) => {
    const admin = createAdminClient();
    const application = await seedApplication(admin);

    try {
      await signIn(page);
      await page.goto(application.url);

      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Applications",
          exact: true,
        }),
      ).toBeVisible();

      const row = page.getByRole("row").filter({ hasText: application.name });
      await expect(row).toBeVisible();
      await expect(row).toContainText(application.email);
      await expect(row).toContainText("Ride Buddy");
      await expect(row).toContainText("New");
    } finally {
      await application.cleanup();
    }
  });

  test("searches the queue and filters it by status", async ({ page }) => {
    const admin = createAdminClient();
    const application = await seedApplication(admin, "being reviewed");

    try {
      await signIn(page);
      await page.goto("/portal/volunteers/applications");

      await page.getByRole("button", { name: /^Filters/ }).click();
      const filters = modal(page);
      await filters.getByLabel("Search").fill(application.name);
      await filters
        .getByRole("button", { name: "Filter", exact: true })
        .click();

      await expect(page).toHaveURL(/search=E2E/);
      const row = page.getByRole("row").filter({ hasText: application.name });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Being reviewed");

      // Apply the status filter by URL: the sheet's form-submit path is
      // covered just above, and a click issued right after that native GET
      // navigation can be swallowed while the page re-hydrates (same
      // pattern as portal-people.spec.ts).
      await page.goto(`${application.url}&status=declined`);
      await expect(
        page.getByText("No applications match your filters"),
      ).toBeVisible();
    } finally {
      await application.cleanup();
    }
  });

  test("reviews an application and moves it to placed", async ({ page }) => {
    const admin = createAdminClient();
    const application = await seedApplication(admin);

    try {
      await signIn(page);
      await page.goto(application.url);

      await page
        .getByRole("button", {
          name: `View application from ${application.name}`,
        })
        .click();

      const sheet = modal(page);
      await expect(
        sheet.getByRole("heading", { name: "Volunteer application" }),
      ).toBeVisible();
      await expect(sheet.getByText(application.email)).toBeVisible();
      await expect(sheet.getByText("555-0199")).toBeVisible();
      await expect(sheet.getByText("Weekend mornings")).toBeVisible();

      const status = sheet.getByRole("combobox", {
        name: "Application status",
      });
      await status.click();
      // Base UI renders the popup outside the sheet, so the options are
      // only reachable from the page root.
      await page.getByRole("option", { name: "Placed", exact: true }).click();
      await expect(status).toContainText("Placed");

      // The sheet is modal, so the table behind it is aria-hidden until
      // it's closed -- no role-based locator resolves against the row
      // before then.
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(sheet).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: application.name });
      await expect(row).toContainText("Placed");
    } finally {
      await application.cleanup();
    }
  });

  test("a view-only user sees the status but can't change it", async ({
    page,
  }) => {
    const admin = createAdminClient();
    // event_coordinator holds volunteers:view, not volunteers:manage.
    const coordinator = await seedUserWithRole(admin, "event_coordinator");
    const application = await seedApplication(admin);

    try {
      await signIn(page, {
        email: coordinator.email,
        password: coordinator.password,
      });
      await page.goto(application.url);

      await page
        .getByRole("button", {
          name: `View application from ${application.name}`,
        })
        .click();

      const sheet = modal(page);
      await expect(sheet.getByText("Weekend mornings")).toBeVisible();
      await expect(sheet.getByText("New", { exact: true })).toBeVisible();
      await expect(
        sheet.getByRole("combobox", { name: "Application status" }),
      ).not.toBeAttached();
    } finally {
      await application.cleanup();
      await coordinator.cleanup();
    }
  });
});
