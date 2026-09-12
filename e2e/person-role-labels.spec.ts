// Issue #911 (phase A): the six person roles are nonprofit vocabulary, and a
// tenant that runs classes has students rather than attendees.
//
// The words reach the browser through four different mechanisms -- the nav
// tree's templates resolved in a server component, a segment config resolved
// per page, a `<select>` built from the registry, and a React context the
// client-side person form reads -- so a unit test that resolves a template
// proves none of them are actually wired up. This is the pass over the
// directory the ticket asks for.
//
// It writes the tenant's own `people.role_labels`, which every other spec in
// the run would read, so it belongs to the `mutating` project.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { initialTenantId } from "./helpers/tenant";

const SETTING_KEY = "people.role_labels";

/** A studio: it teaches, so its attendees are students. */
const STUDIO = {
  is_attendee: { singular: "Student", plural: "Students" },
};

async function setRoleLabels(labels: unknown | null) {
  const admin = createAdminClient();
  const tenantId = await initialTenantId();

  if (labels === null) {
    const { error } = await admin
      .from("app_settings")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("key", SETTING_KEY);
    if (error) throw new Error(`Could not clear role labels: ${error.message}`);
    return;
  }

  const { error } = await admin
    .from("app_settings")
    .upsert(
      { tenant_id: tenantId, key: SETTING_KEY, value: labels },
      { onConflict: "tenant_id,key" },
    );
  if (error) throw new Error(`Could not set role labels: ${error.message}`);
}

// Serial: both tests write the one tenant's role labels, and in parallel each
// would see the other's vocabulary.
test.describe.configure({ mode: "serial" });

/** What the tenant had before this file ran, so it can be given back. */
let original: unknown | null = null;

test.beforeAll(async () => {
  const admin = createAdminClient();
  const tenantId = await initialTenantId();
  const { data, error } = await admin
    .from("app_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(`Could not read role labels: ${error.message}`);
  original = data?.value ?? null;
});

test.afterAll(async () => {
  await setRoleLabels(original);
});

test.describe("person role labels", () => {
  test("a tenant that sets nothing reads the platform's words", async ({
    page,
  }) => {
    await setRoleLabels(null);
    await signIn(page);

    await page.goto("/portal/people/attendees");
    await expect(
      page.getByRole("heading", { level: 1, name: "Attendees" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New Attendee" }),
    ).toBeVisible();
  });

  test("the tenant's own word reaches the directory, the nav and the form", async ({
    page,
  }) => {
    await setRoleLabels(STUDIO);
    await signIn(page);

    // The segment page: heading and the "New X" trigger.
    await page.goto("/portal/people/attendees");
    await expect(
      page.getByRole("heading", { level: 1, name: "Students" }),
    ).toBeVisible();
    const newStudent = page.getByRole("button", { name: "New Student" });
    await expect(newStudent).toBeVisible();

    // The segment strip, which is where "Attendees" sat whether or not the
    // tenant ran events people register for. It was eight sidebar entries
    // until #957 folded them into the one page they are all views of.
    await expect(
      page
        .getByRole("navigation", { name: "People segments" })
        .getByRole("link", { name: "Students" }),
    ).toBeVisible();

    // The person form's role checkboxes, a client component reading the
    // shell's context rather than anything this page fetched.
    //
    // By role rather than by label: a Base UI checkbox is a `role="checkbox"`
    // span *and* a hidden `<input type="checkbox">` sharing one label, so
    // getByLabel matches both and trips strict mode.
    await newStudent.click();
    await expect(
      page.getByRole("dialog").getByRole("checkbox", { name: "Student" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // The strip on the full list too, built from the same registry. It
    // replaced the Role facet in #957 -- a dropdown offering the same six
    // choices as the strip beside it was two ways to do one thing.
    await page.goto("/portal/people");
    const strip = page.getByRole("navigation", { name: "People segments" });
    await expect(strip.getByRole("link", { name: "Students" })).toBeVisible();

    // ...and the route itself is untouched: a URL is not a label.
    await strip.getByRole("link", { name: "Students" }).click();
    await expect(page).toHaveURL(/\/portal\/people\/attendees$/);
  });
});
