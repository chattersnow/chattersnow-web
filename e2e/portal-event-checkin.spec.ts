// Issue #418: a one-click check-in quick action on the portal home page's
// "Happening now" card, and a deep link from the "awaiting check-in today"
// attention item straight to that event's Registrants tab.
//
// Uses a freshly created event_coordinator user per test (rather than the
// shared seeded accounts) for the same reason as
// volunteer-hours-self-log.spec.ts: this file's tests may run fully in
// parallel across Playwright projects, and each needs its own "today"
// event + registrant without racing another run's fixtures.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";

async function seedCheckinFixture(admin: ReturnType<typeof createAdminClient>) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `e2e-checkin-${suffix}@example.test`;
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

  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("name", "event_coordinator")
    .single();
  if (roleError) throw roleError;

  const { error: userRoleError } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_id: role.id, created_by: userId });
  if (userRoleError) throw userRoleError;

  const { data: person, error: personError } = await admin
    .from("people")
    .insert({
      name: `E2E Checkin Coordinator ${suffix}`,
      email,
      source_type: "individual",
      auth_user_id: userId,
    })
    .select("id")
    .single();
  if (personError) throw personError;

  const eventName = `E2E Checkin Event ${suffix}`;
  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      name: eventName,
      starts_at: new Date().toISOString(),
      timezone: "UTC",
      status: "published",
      visibility: "private",
      // events.created_by is `not null default auth.uid()`, which resolves
      // to null over the service-role admin client (no user JWT), so it
      // must be set explicitly here.
      created_by: userId,
    })
    .select("id")
    .single();
  if (eventError) throw eventError;

  const { error: volunteerError } = await admin
    .from("event_volunteers")
    .insert({ event_id: event.id, person_id: person.id, created_by: userId });
  if (volunteerError) throw volunteerError;

  const registrantName = `E2E Registrant ${suffix}`;
  const { error: registrationError } = await admin
    .from("event_registrations")
    .insert({
      event_id: event.id,
      name: registrantName,
      email: `e2e-registrant-${suffix}@example.test`,
      party_size: 1,
    });
  if (registrationError) throw registrationError;

  return {
    email,
    password,
    eventId: event.id as string,
    eventName,
    registrantName,
    async cleanup() {
      // event_volunteers and event_registrations both reference events
      // with `on delete cascade`, so deleting the event is enough for them.
      await admin.from("events").delete().eq("id", event.id);
      await admin.from("people").delete().eq("id", person.id);
      await admin.auth.admin.deleteUser(userId);
    },
  };
}

test("checks in a registrant from the Happening Now quick action", async ({
  page,
}) => {
  const admin = createAdminClient();
  const fixture = await seedCheckinFixture(admin);

  try {
    await signIn(page, { email: fixture.email, password: fixture.password });
    await page.goto("/portal/home");

    await expect(page.getByText("Happening now")).toBeVisible();
    // Scope to the card's own title rather than any text in the card
    // (the "Needs your attention" card also mentions this event, via the
    // deep-linked check-in attention item this same issue adds).
    const card = page.locator('[data-slot="card"]').filter({
      has: page.locator('[data-slot="card-title"]', {
        hasText: fixture.eventName,
      }),
    });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Check in", exact: true }).click();

    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByText(`Check in · ${fixture.eventName}`),
    ).toBeVisible();
    await expect(sheet.getByText(fixture.registrantName)).toBeVisible();

    // exact: true -- otherwise this also matches "+ Check in walk-in".
    await sheet.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(
      sheet.getByRole("button", { name: "Undo check-in" }),
    ).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("deep-links from the awaiting check-in attention item to the event's Registrants tab", async ({
  page,
}) => {
  const admin = createAdminClient();
  const fixture = await seedCheckinFixture(admin);

  try {
    await signIn(page, { email: fixture.email, password: fixture.password });
    await page.goto("/portal/home");

    await page
      .getByRole("button", { name: /items? needing attention/ })
      .click();

    const reviewLink = page.locator(
      `a[href="/portal/events/${fixture.eventId}?tab=registrants"]`,
    );
    await expect(reviewLink).toBeVisible();
    await reviewLink.click();

    await expect(page).toHaveURL(
      new RegExp(`/portal/events/${fixture.eventId}\\?tab=registrants`),
    );

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(fixture.eventName)).toBeVisible();
    await expect(sheet.getByText(fixture.registrantName)).toBeVisible();
    // exact: true -- otherwise this also matches "+ Check in walk-in".
    await expect(
      sheet.getByRole("button", { name: "Check in", exact: true }),
    ).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
