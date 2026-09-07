// #742: the volunteer-application notification email links at one application
// (?application=<id>), and that queue is filtered, sorted and server-paginated
// -- so the row the link names is not necessarily on the page it lands on.
// Both cases below matter: the ordinary one, and the one where the page has to
// fetch the application on its own to keep the link's promise.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";

async function seedApplication(admin: ReturnType<typeof createAdminClient>) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const name = `E2E Applicant ${suffix}`;
  const email = `e2e-applicant-${suffix}@example.test`;

  // volunteer_applications has no insert grant -- the public RPC is the only
  // way in -- so the fixture arrives the way a real applicant would.
  const { data: referenceCode, error } = await admin.rpc(
    "submit_volunteer_application",
    {
      p_name: name,
      p_email: email,
      p_phone: null,
      p_role_interest: "Trip lead",
      p_availability: "Weekends",
      p_honeypot: null,
      p_ip_address: null,
    },
  );
  if (error) throw error;

  const { data, error: rowError } = await admin
    .from("volunteer_applications")
    .select("id")
    .eq("reference_code", referenceCode as string)
    .single();
  if (rowError || !data) throw rowError ?? new Error("no application row");

  return {
    id: data.id as string,
    name,
    async cleanup() {
      await admin.from("volunteer_applications").delete().eq("id", data.id);
      await admin.from("people").delete().eq("email", email);
    },
  };
}

test("an email's ?application= link opens that application and takes the parameter back out", async ({
  page,
}) => {
  const admin = createAdminClient();
  const fixture = await seedApplication(admin);

  try {
    await signIn(page);
    await page.goto(
      `/portal/volunteers/applications?application=${fixture.id}`,
    );

    const sheet = modal(page);
    await expect(sheet.getByText("Volunteer application")).toBeVisible();
    await expect(sheet.getByText(fixture.name)).toBeVisible();

    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL(/\/portal\/volunteers\/applications$/);
  } finally {
    await fixture.cleanup();
  }
});

test("the link still opens an application the current filter would hide", async ({
  page,
}) => {
  const admin = createAdminClient();
  const fixture = await seedApplication(admin);

  try {
    await signIn(page);
    // A filter the fixture cannot match: it is 'new'. This stands in for the
    // ordinary case of a link followed a week later, when the application has
    // long since fallen off page one.
    await page.goto(
      `/portal/volunteers/applications?status=placed&application=${fixture.id}`,
    );

    const sheet = modal(page);
    await expect(sheet.getByText("Volunteer application")).toBeVisible();
    await expect(sheet.getByText(fixture.name)).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
