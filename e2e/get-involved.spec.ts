import { test, expect } from "@playwright/test";
import { clickNavLink } from "./helpers/nav";
import { createAdminClient } from "./helpers/admin-client";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * A volunteer application the status-lookup tests can look up by reference
 * code. Seeded directly rather than driven through the apply form: the
 * per-email throttle in submit_volunteer_application rejects a second
 * application for a day, and the lookup cases should not depend on the
 * apply flow passing first.
 */
async function seedVolunteerApplication(admin: AdminClient) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `e2e-volunteer-status-${suffix}@example.test`;
  const name = `E2E Applicant ${suffix}`;
  // lookup_volunteer_application_status compares against upper(btrim(input)),
  // so a stored code has to be upper case to ever match.
  const referenceCode = suffix.toUpperCase();

  const { data: person, error: personError } = await admin
    .from("people")
    .insert({ name, email, source_type: "individual", is_volunteer: true })
    .select("id")
    .single();
  if (personError) throw personError;

  const { error: applicationError } = await admin
    .from("volunteer_applications")
    .insert({
      person_id: person.id,
      name,
      email,
      reference_code: referenceCode,
      status: "new",
    });
  if (applicationError) throw applicationError;

  return {
    email,
    referenceCode,
    async cleanup() {
      await admin.from("volunteer_applications").delete().eq("email", email);
      await admin.from("people").delete().eq("id", person.id);
    },
  };
}

test.describe("public get-involved pages", () => {
  test("get-involved index page loads", async ({ page }) => {
    await page.goto("/get-involved");
    await expect(page).toHaveURL(/\/get-involved$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Get involved" }),
    ).toBeVisible();
  });

  test("nav resolves to Attend", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Attend", { group: "Get Involved" });

    await expect(page).toHaveURL(/\/get-involved\/attend$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Get involved" }),
    ).toBeVisible();
  });

  test("nav resolves to Volunteer", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Volunteer", { group: "Get Involved" });

    await expect(page).toHaveURL(/\/get-involved\/volunteer$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Volunteer" }),
    ).toBeVisible();
  });

  test("nav resolves to Become a Partner", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Become a Partner", { group: "Get Involved" });

    await expect(page).toHaveURL(/\/get-involved\/partner$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Become a partner" }),
    ).toBeVisible();
  });

  test("submitting a volunteer application shows a reference code", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `e2e-volunteer-apply-${suffix}@example.test`;

    try {
      await page.goto("/get-involved/volunteer");
      await page.getByRole("button", { name: "Apply to volunteer" }).click();

      const sheet = page.getByRole("dialog", { name: "Apply to volunteer" });
      await sheet
        .getByLabel("Name", { exact: true })
        .fill(`E2E Applicant ${suffix}`);
      await sheet.getByLabel("Email").fill(email);
      await sheet
        .getByLabel("What are you interested in helping with?")
        .fill("On-Snow Mentor");
      await sheet.getByRole("button", { name: "Apply to volunteer" }).click();

      await expect(sheet.getByText("Thanks for applying!")).toBeVisible();
      // The code is what the applicant needs to check their status later, so
      // assert it is actually rendered in the shape the lookup expects
      // (8 chars, no confusable 0/O/1/I/L -- see
      // generate_volunteer_reference_code).
      await expect(sheet.locator("strong")).toHaveText(
        /^[A-HJ-KM-NP-Z2-9]{8}$/,
      );
      await expect(
        sheet.getByRole("link", { name: "Check your status" }),
      ).toBeVisible();
    } finally {
      await admin.from("volunteer_applications").delete().eq("email", email);
      await admin.from("people").delete().eq("email", email);
    }
  });

  test("checking the status of an existing volunteer application", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const application = await seedVolunteerApplication(admin);

    try {
      await page.goto("/get-involved/volunteer/status");
      await page.getByLabel("Email").fill(application.email);
      await page.getByLabel("Reference code").fill(application.referenceCode);
      await page.getByRole("button", { name: "Check status" }).click();

      // "new" is never shown to applicants as-is -- it maps to "Received".
      await expect(page.getByText("Status: Received")).toBeVisible();
    } finally {
      await application.cleanup();
    }
  });

  test("checking a status with the wrong reference code reports no match", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const application = await seedVolunteerApplication(admin);

    try {
      await page.goto("/get-involved/volunteer/status");
      await page.getByLabel("Email").fill(application.email);
      await page.getByLabel("Reference code").fill("ZZZZZZZZ");
      await page.getByRole("button", { name: "Check status" }).click();

      await expect(
        page.getByText(
          "We couldn't find an application matching that email and reference code.",
        ),
      ).toBeVisible();
      await expect(page.getByText(/^Status:/)).toHaveCount(0);
    } finally {
      await application.cleanup();
    }
  });
});
