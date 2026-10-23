// Issue #1688: a guest -- an account with no role and a per-event access grant
// (#1686, #1687) -- signs in to Events alone, sees only the event it was
// granted, and on it only the cards its areas cover.
//
// Seeds its own account, two events and one grant through the service-role
// client, the way portal-event-detail.spec.ts does, so parallel projects never
// share a fixture.
import { test, expect } from "./helpers/test";
import { submitLogin } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { markOnboarded } from "./helpers/onboarding";

type AdminClient = ReturnType<typeof createAdminClient>;

async function seedGuestFixture(admin: AdminClient) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `e2e-guest-${suffix}@example.test`;
  const password = "password123";

  const { data: userData, error: userError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (userError || !userData.user) {
    throw userError ?? new Error("createUser returned no user");
  }
  const userId = userData.user.id;
  await markOnboarded(admin, userId);

  const insertEvent = async (name: string) => {
    const { data, error } = await admin
      .from("events")
      .insert({
        name,
        starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        timezone: "UTC",
        status: "published",
        visibility: "private",
        // `not null default auth.uid()`, which is null over the service role.
        created_by: userId,
      })
      .select("id, tenant_id")
      .single();
    if (error) throw error;
    return { ...data, name };
  };
  const granted = await insertEvent(`E2E Guest Granted ${suffix}`);
  const ungranted = await insertEvent(`E2E Guest Ungranted ${suffix}`);

  // View only, Details and Registrations: no sensitive area, nothing to edit.
  const { error: grantError } = await admin.from("event_access_grants").insert({
    tenant_id: granted.tenant_id,
    event_id: granted.id,
    user_id: userId,
    level: "view",
    areas: ["details", "registrations"],
  });
  if (grantError) throw grantError;

  return {
    email,
    password,
    granted,
    ungranted,
    cleanup: async () => {
      await admin.from("events").delete().in("id", [granted.id, ungranted.id]);
      await admin.auth.admin.deleteUser(userId);
    },
  };
}

test.describe("Guest portal (#1688)", () => {
  let fixture: Awaited<ReturnType<typeof seedGuestFixture>>;

  test.beforeEach(async ({}, testInfo) => {
    // The rail and the nav are sheets behind buttons on a phone; what a guest
    // can reach is decided on the server and is the same in both shells.
    test.skip(
      testInfo.project.name.startsWith("mobile"),
      "Asserts against the desktop sidebar and rail.",
    );
    fixture = await seedGuestFixture(createAdminClient());
  });

  test.afterEach(async () => {
    await fixture?.cleanup();
  });

  test("lands on Events, sees only the granted event and its granted cards", async ({
    page,
  }) => {
    await submitLogin(page, fixture.email, fixture.password);
    await expect(page).toHaveURL(/\/portal\/events$/, { timeout: 30_000 });

    // Events is the only section; there is no Dashboard to go back to.
    const sidebar = page.locator("[data-sidebar=content]");
    await expect(sidebar.getByRole("link", { name: "Events" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Dashboard" })).toHaveCount(
      0,
    );
    await expect(sidebar.getByRole("link", { name: "People" })).toHaveCount(0);

    await expect(
      page.getByRole("link", { name: fixture.granted.name }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: fixture.ungranted.name }),
    ).toHaveCount(0);

    // Another section's guard refuses, and the refusal lands back on Events.
    await page.goto("/portal/finance");
    await expect(page).toHaveURL(/\/portal\/events$/);

    await page.goto(`/portal/events/${fixture.ungranted.id}`);
    await expect(
      page.getByRole("heading", { name: "Not found", level: 1 }),
    ).toBeVisible();

    await page.goto(`/portal/events/${fixture.granted.id}`);
    await expect(
      page.getByRole("heading", { name: fixture.granted.name, level: 1 }),
    ).toBeVisible();
    const rail = page.getByRole("navigation", { name: "Event sections" });
    await expect(
      rail.getByRole("button", { name: /^Event details/ }),
    ).toBeVisible();
    await expect(
      rail.getByRole("button", { name: /^Registrants/ }),
    ).toBeVisible();
    for (const sensitive of ["Expenses", "Revenue", "Sponsors", "Giveaway"]) {
      await expect(
        rail.getByRole("button", { name: new RegExp(`^${sensitive}`) }),
      ).toHaveCount(0);
    }
    // Outside the grant's areas, though not sensitive.
    await expect(rail.getByRole("button", { name: /^Staff/ })).toHaveCount(0);

    // A view grant edits nothing, and no grant deletes an event.
    await expect(
      page.getByRole("button", { name: "Edit event details" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Delete event" }),
    ).toHaveCount(0);
  });
});
