// Issue #656: /portal/events/[eventId] is the busiest page in the portal --
// 18 cards across 4 phases -- and the only spec that reached it deep-linked
// in from the dashboard to check in a registrant. Per-card unit and DOM tests
// mock the server actions, so nothing exercised the page as a signed-in user
// actually uses it. #649 is the cautionary tale: a rollup bug shipped because
// its suite was pure functions over fixtures and no test ever called the RPC.
//
// A few whole journeys rather than card-by-card coverage. Each seeds its own
// event_coordinator + event through the service-role client (the pattern
// portal-event-checkin.spec.ts uses, for the reasons in #474 and #587): the
// tests run in parallel across Playwright projects, and every one of them
// mutates its event.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";
import { markOnboarded } from "./helpers/onboarding";
import { pickPerson } from "./helpers/people";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * An event that has already started, with no attendance, report or impact
 * recorded -- the state the phase strip counts as three outstanding tasks
 * (one on During, two on After) and the state every test here starts from.
 */
async function seedEventFixture(admin: AdminClient) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `e2e-eventdetail-${suffix}@example.test`;
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
      name: `E2E Detail Coordinator ${suffix}`,
      email,
      source_type: "individual",
      auth_user_id: userId,
    })
    .select("id")
    .single();
  if (personError) throw personError;

  const walkInName = `E2E Walk-in ${suffix}`;
  const { data: walkIn, error: walkInError } = await admin
    .from("people")
    .insert({ name: walkInName, source_type: "individual" })
    .select("id")
    .single();
  if (walkInError) throw walkInError;

  const eventName = `E2E Detail Event ${suffix}`;
  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      name: eventName,
      // Two hours ago: the phase strip only counts attendance and the
      // after-report as outstanding once the event has started.
      starts_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      timezone: "UTC",
      status: "published",
      visibility: "private",
      // events.created_by is `not null default auth.uid()`, which resolves to
      // null over the service-role admin client (no user JWT).
      created_by: userId,
    })
    .select("id")
    .single();
  if (eventError) throw eventError;

  const registrantName = `E2E Registrant ${suffix}`;
  const { error: registrationError } = await admin
    .from("event_registrations")
    .insert({
      event_id: event.id,
      name: registrantName,
      email: `e2e-detail-registrant-${suffix}@example.test`,
      party_size: 1,
    });
  if (registrationError) throw registrationError;

  return {
    email,
    password,
    eventId: event.id as string,
    eventName,
    registrantName,
    walkInName,
    async cleanup() {
      // event_registrations, event_impact_notes and the rest cascade from the
      // event row.
      await admin.from("events").delete().eq("id", event.id);
      await admin.from("people").delete().in("id", [person.id, walkIn.id]);
      await admin.auth.admin.deleteUser(userId);
    },
  };
}

/** The phase strip's tab for `label`. */
function phaseTab(page: import("@playwright/test").Page, label: string) {
  return page.getByRole("tab", { name: new RegExp(`^${label}`) });
}

/** A phase card, addressed by its own title rather than any text inside it. */
function card(page: import("@playwright/test").Page, title: string) {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: title }),
  });
}

async function openEvent(
  page: import("@playwright/test").Page,
  fixture: Awaited<ReturnType<typeof seedEventFixture>>,
  query = "",
) {
  await signIn(page, { email: fixture.email, password: fixture.password });
  // The detail route may still need compiling under `next dev`, so give the
  // first paint room rather than the default 5s.
  await page.goto(`/portal/events/${fixture.eventId}${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: fixture.eventName }),
  ).toBeVisible({ timeout: 30_000 });
}

test.describe("portal event detail", () => {
  // Each journey signs in, compiles the route on demand and drives several
  // server actions through it.
  test.setTimeout(120_000);

  test("the phase survives Back, a refresh and a shared link", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const fixture = await seedEventFixture(admin);

    try {
      await openEvent(page, fixture);

      // No ?phase= yet: the page opens on Overview, whose card is the one
      // on screen.
      await expect(card(page, "Event details")).toBeVisible();

      await phaseTab(page, "During").click();
      await expect(page).toHaveURL(/[?&]phase=during/);
      await expect(card(page, "Attendance")).toBeVisible();

      await phaseTab(page, "After").click();
      await expect(page).toHaveURL(/[?&]phase=after/);
      await expect(card(page, "Impact")).toBeVisible();

      // The tab is history, not component state -- Back returns to the
      // previous phase rather than leaving the event.
      await page.goBack();
      await expect(page).toHaveURL(/[?&]phase=during/);
      await expect(card(page, "Attendance")).toBeVisible();

      // And it survives a refresh, which is what makes the URL shareable.
      await page.reload();
      await expect(page).toHaveURL(/[?&]phase=during/);
      await expect(card(page, "Attendance")).toBeVisible();

      // ?tab= stays the deep-link entry point: it resolves to the phase that
      // holds the card. Registrants lives on During.
      await page.goto(`/portal/events/${fixture.eventId}?tab=registrants`);
      await expect(card(page, "Registrants")).toBeVisible();
      await expect(page.getByText(fixture.registrantName)).toBeVisible();
    } finally {
      await fixture.cleanup();
    }
  });

  test("recording attendance feeds the Impact card and clears the During task", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const fixture = await seedEventFixture(admin);

    try {
      await openEvent(page, fixture, "?phase=during");

      // One outstanding task on During ("Attendance not logged"), two on
      // After ("After-report not started", "Impact not recorded").
      await expect(
        phaseTab(page, "During").getByLabel("1 outstanding"),
      ).toBeVisible();

      const attendance = card(page, "Attendance");
      await attendance.getByRole("button", { name: "Edit attendance" }).click();
      await attendance.getByLabel("Attendance headcount").fill("42");
      await attendance.getByLabel("Notes").fill("Counted at the lift line.");
      await attendance.getByRole("button", { name: "Save attendance" }).click();

      await expect(
        attendance.getByText("Counted at the lift line."),
      ).toBeVisible();

      // The phase strip is server-derived, so this proves the write landed
      // rather than that the card cleared its own form.
      await expect(
        phaseTab(page, "During").getByLabel(/outstanding/),
      ).toHaveCount(0);

      // The Impact card's participation figures come from an RPC over the
      // same definitions the program rollup uses, not from anything the page
      // just typed -- the derivation #649 shipped a bug in because no test
      // ever called it. Participants is the typed headcount when there is one.
      await phaseTab(page, "After").click();
      const impact = card(page, "Impact");
      const participants = impact
        .locator('[data-slot="card"]')
        .filter({ hasText: "Participants" })
        .first();
      await expect(participants).toContainText("42", { timeout: 15_000 });
    } finally {
      await fixture.cleanup();
    }
  });

  test("submitting the after-report locks the cards it covers", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const fixture = await seedEventFixture(admin);

    try {
      await openEvent(page, fixture, "?phase=basic");

      // Editable to begin with, on both cards the submit locks.
      await expect(
        card(page, "Event details").getByRole("button", {
          name: "Edit event details",
        }),
      ).toBeVisible();
      await phaseTab(page, "Planning").click();
      await expect(
        card(page, "Registration & planning").getByRole("button", {
          name: "Edit registration & planning",
        }),
      ).toBeVisible();

      await phaseTab(page, "After").click();
      const report = card(page, "Report");
      await report.getByRole("button", { name: "Submit report" }).click();

      await expect(report.getByText("Submitted")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        report.getByRole("button", { name: "Submit report" }),
      ).toHaveCount(0);
      // The After phase is down to its one remaining task, the impact note.
      await expect(
        phaseTab(page, "After").getByLabel("1 outstanding"),
      ).toBeVisible();

      // Submitted report data must not shift underneath it, so the cards it
      // covers lose their edit affordance entirely.
      await phaseTab(page, "Overview").click();
      await expect(
        card(page, "Event details").getByRole("button", {
          name: "Edit event details",
        }),
      ).toHaveCount(0);
      await phaseTab(page, "Planning").click();
      await expect(
        card(page, "Registration & planning").getByRole("button", {
          name: "Edit registration & planning",
        }),
      ).toHaveCount(0);
    } finally {
      await fixture.cleanup();
    }
  });

  test("checks in a walk-in from the event's own Registrants card", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const fixture = await seedEventFixture(admin);

    try {
      await openEvent(page, fixture, "?phase=during");

      const registrants = card(page, "Registrants");
      await registrants
        .getByRole("button", { name: "+ Check in walk-in" })
        .click();

      const dialog = modal(page);
      await expect(dialog.getByText("Check in a walk-in")).toBeVisible();
      await pickPerson(dialog, fixture.walkInName);
      await dialog
        .getByRole("button", { name: "Check in walk-in", exact: true })
        .click();

      await expect(dialog).toHaveCount(0, { timeout: 15_000 });
      await expect(registrants.getByText(fixture.walkInName)).toBeVisible({
        timeout: 15_000,
      });

      // The walk-in arrives already checked in, so the Attendance card's
      // check-in reference -- the same derived figures the Impact card reads
      // -- has to agree with the door.
      const attendance = card(page, "Attendance");
      const checkedIn = attendance
        .locator('[data-slot="card"]')
        .filter({ hasText: "Checked in" })
        .first();
      await expect(checkedIn).toContainText("1", { timeout: 15_000 });
    } finally {
      await fixture.cleanup();
    }
  });
});
