// Issue #656: /portal/events/[eventId] is the busiest page in the portal --
// 19 cards behind one entry -- and the only spec that reached it deep-linked
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
 * recorded -- the state the rail counts as three outstanding sections
 * (Attendance, Report and Impact) and the state every test here starts from.
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
      // Two hours ago: the rail only counts attendance and the
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

/**
 * The section rail's row for `title` (#1008). The rail replaced the phase tabs
 * and the card strip under them: every section is listed at once, so reaching
 * one is a single click from wherever you are.
 *
 * Call `showRail` first -- below `lg` the rail is behind a disclosure button,
 * and this spec runs in the mobile projects as well as the desktop ones.
 */
function railRow(page: import("@playwright/test").Page, title: string) {
  return page
    .getByRole("navigation", { name: "Event sections" })
    .getByRole("button", { name: new RegExp(`^${title}`) });
}

/**
 * Expands the rail if it is collapsed. A no-op above `lg`, where the toggle is
 * `lg:hidden`.
 *
 * Retried because the toggle is server-rendered before React attaches to it,
 * so a click that lands in that window does nothing and would otherwise leave
 * the rail shut for the rest of the test.
 */
async function showRail(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: /^Sections · / });
  if (!(await toggle.isVisible())) return;
  const rail = page.getByRole("navigation", { name: "Event sections" });
  await expect(async () => {
    if (!(await rail.isVisible())) await toggle.click();
    await expect(rail).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Opens a section the way a reader does. Picking one collapses the rail again
 * below `lg`, so the card is not pushed off the screen by the list that named
 * it.
 */
async function openSection(
  page: import("@playwright/test").Page,
  title: string,
) {
  await showRail(page);
  await railRow(page, title).click();
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

  test("the section survives Back, a refresh and a shared link", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const fixture = await seedEventFixture(admin);

    try {
      await openEvent(page, fixture);

      // No ?tab= yet: the page opens on the first section.
      await expect(card(page, "Event details")).toBeVisible();

      // One click, from the first group to the last, without selecting a
      // phase on the way -- which is the whole reason the rail replaced the
      // two tab strips (#1008).
      await openSection(page, "Impact");
      await expect(page).toHaveURL(/[?&]tab=impact/);
      await expect(card(page, "Impact")).toBeVisible();
      await expect(card(page, "Event details")).toHaveCount(0);

      // And straight back to a Planning section afterwards: the lifecycle is
      // not one-way, and correcting the budget after the event is ordinary.
      await openSection(page, "Registration & planning");
      await expect(page).toHaveURL(/[?&]tab=planning/);
      await expect(card(page, "Registration & planning")).toBeVisible();

      // History, not component state -- Back returns to the previous section
      // rather than leaving the event.
      await page.goBack();
      await expect(page).toHaveURL(/[?&]tab=impact/);
      await expect(card(page, "Impact")).toBeVisible();

      // And it survives a refresh, which is what makes the URL shareable.
      await page.reload();
      await expect(page).toHaveURL(/[?&]tab=impact/);
      await expect(card(page, "Impact")).toBeVisible();

      // #958's two parameters still open the right section, so bookmarks
      // from before the rail keep working -- and the first thing the reader
      // does here drops them, so what they go on to share names only `tab`.
      await page.goto(
        `/portal/events/${fixture.eventId}?phase=during&card=incidents`,
      );
      await expect(card(page, "Incidents")).toBeVisible();
      await openSection(page, "Staff");
      await expect(page).toHaveURL(/[?&]tab=staff/);
      await expect(page).not.toHaveURL(/[?&](phase|card)=/);

      // ?tab= is the deep-link entry point every notification and the
      // outstanding-tasks sheet already used, and now the only parameter.
      await page.goto(`/portal/events/${fixture.eventId}?tab=registrants`);
      await expect(card(page, "Registrants")).toBeVisible();
      await expect(page.getByText(fixture.registrantName)).toBeVisible();
    } finally {
      await fixture.cleanup();
    }
  });

  test("search finds a section by what it holds, not by its name", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const fixture = await seedEventFixture(admin);

    try {
      await openEvent(page, fixture);

      // "Which phase is the budget on?" was the question the phase tabs could
      // not answer without opening them. The budget is on a card called
      // Registration & planning.
      await showRail(page);
      await page
        .getByRole("searchbox", { name: "Search this event's sections" })
        .fill("budget");
      const results = page.getByRole("navigation", { name: "Search results" });
      await expect(results.getByRole("button")).toHaveCount(1);
      await results.getByRole("button").click();

      await expect(card(page, "Registration & planning")).toBeVisible();
      await expect(page).toHaveURL(/[?&]tab=planning/);
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
      await openEvent(page, fixture, "?tab=attendance");

      // The badge sits on the section the work is done on (#1008), not on a
      // phase heading covering six of them.
      await showRail(page);
      await expect(
        railRow(page, "Attendance").getByLabel("1 outstanding"),
      ).toBeVisible();

      const attendance = card(page, "Attendance");
      await attendance.getByRole("button", { name: "Edit attendance" }).click();
      await attendance.getByLabel("Attendance headcount").fill("42");
      await attendance.getByLabel("Notes").fill("Counted at the lift line.");
      await attendance.getByRole("button", { name: "Save attendance" }).click();

      // Scoped to the read-only view, which renders from the server's copy
      // of the event -- that is what makes this a wait for the save to land.
      // The unscoped locator is not: Playwright reads a textarea's value as
      // its text, so it matches the form this test just typed into and is
      // already true before the write leaves the browser.
      await expect(
        attendance
          .locator('[data-slot="read-only-field"]')
          .getByText("Counted at the lift line."),
      ).toBeVisible();

      // The rail's badges are server-derived, so this proves the write landed
      // rather than that the card cleared its own form.
      await showRail(page);
      await expect(
        railRow(page, "Attendance").getByLabel(/outstanding/),
      ).toHaveCount(0);

      // The Impact card's participation figures come from an RPC over the
      // same definitions the program rollup uses, not from anything the page
      // just typed -- the derivation #649 shipped a bug in because no test
      // ever called it. Participants is the typed headcount when there is one.
      await openSection(page, "Impact");
      const impact = card(page, "Impact");
      const participants = impact
        .locator('[data-slot="card"]')
        .filter({ hasText: "Participants" })
        .first();
      await expect(participants).toContainText("42");
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
      await openEvent(page, fixture);

      // Editable to begin with, on both cards the submit locks.
      await expect(
        card(page, "Event details").getByRole("button", {
          name: "Edit event details",
        }),
      ).toBeVisible();
      await openSection(page, "Registration & planning");
      await expect(
        card(page, "Registration & planning").getByRole("button", {
          name: "Edit registration & planning",
        }),
      ).toBeVisible();

      await openSection(page, "Report");
      const report = card(page, "Report");
      await report.getByRole("button", { name: "Submit report" }).click();

      await expect(report.getByText("Submitted")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        report.getByRole("button", { name: "Submit report" }),
      ).toHaveCount(0);
      // The Report row's badge is gone; the impact note's is still there, on
      // its own row.
      await showRail(page);
      await expect(
        railRow(page, "Report").getByLabel(/outstanding/),
      ).toHaveCount(0);
      await expect(
        railRow(page, "Impact").getByLabel("1 outstanding"),
      ).toBeVisible();

      // Submitted report data must not shift underneath it, so the cards it
      // covers lose their edit affordance entirely.
      await openSection(page, "Event details");
      await expect(
        card(page, "Event details").getByRole("button", {
          name: "Edit event details",
        }),
      ).toHaveCount(0);
      await openSection(page, "Registration & planning");
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
      // Straight to the card, which is what a link from elsewhere in the
      // portal can now do.
      await openEvent(page, fixture, "?tab=registrants");

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
      await openSection(page, "Attendance");
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
