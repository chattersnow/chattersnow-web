// Integration test: exercises getOpsInboxSummary's "awaiting check-in today"
// item (issue #418: one deep-linked item per today's event, rather than a
// single item pointing at the generic events list) against a real local
// Supabase stack (RLS-scoped events/event_registrations selects).
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  createPublishedEvent,
  signInAs,
  uniqueEmail,
  unprivilegedActors,
} from "../../../test/integration-setup";
import {
  getAccessManagementAttentionSummary,
  getCalendarCoverageReminderSummary,
  getEventTaskSummary,
  getOpsInboxSummary,
  getPendingApprovalsSummary,
} from "./attention-items";

async function seedRegistration(eventId: string, checkedIn: boolean) {
  const { error } = await adminClient.from("event_registrations").insert({
    event_id: eventId,
    name: "Integration Test Registrant",
    email: uniqueEmail("registrant"),
    party_size: 1,
    checked_in_at: checkedIn ? new Date().toISOString() : null,
  });
  if (error) throw error;
}

// 20260903060000 refuses to delete an event that still has registrations, so
// a fixture has to clear its own before `event.cleanup()` -- otherwise the
// delete is silently rejected and the event stays in the shared local stack,
// permanently "awaiting check-in", for every later run.
async function cleanupEvent(event: {
  id: string;
  cleanup: () => Promise<void>;
}) {
  await adminClient
    .from("event_registrations")
    .delete()
    .eq("event_id", event.id);
  await event.cleanup();
}

function todayIso() {
  return new Date().toISOString();
}

describe("getOpsInboxSummary event check-ins (integration)", () => {
  test("produces one deep-linked item per today's event with pending check-ins", async () => {
    const eventA = await createPublishedEvent({
      startsAt: todayIso(),
      timezone: "UTC",
    });
    const eventB = await createPublishedEvent({
      startsAt: todayIso(),
      timezone: "UTC",
    });
    await seedRegistration(eventA.id, false);
    await seedRegistration(eventA.id, false);
    await seedRegistration(eventB.id, true); // already checked in: not pending
    const supabase = await signInAs(SEEDED_USERS.admin);

    const result = await getOpsInboxSummary(supabase, {
      canSeeVolunteerApplications: false,
      canSeeContactMessages: false,
      canSeeEventCheckins: true,
    });

    const itemA = result.items.find((item) => item.href.includes(eventA.id));
    expect(itemA).toBeDefined();
    expect(itemA?.count).toBe(2);
    expect(itemA?.label).toBe(`2 awaiting check-in · ${eventA.name}`);
    expect(itemA?.href).toBe(`/portal/events/${eventA.id}?tab=registrants`);

    expect(result.items.some((item) => item.href.includes(eventB.id))).toBe(
      false,
    );

    await cleanupEvent(eventA);
    await cleanupEvent(eventB);
  });

  test("omits an event once every registrant is checked in", async () => {
    const event = await createPublishedEvent({
      startsAt: todayIso(),
      timezone: "UTC",
    });
    await seedRegistration(event.id, true);
    const supabase = await signInAs(SEEDED_USERS.admin);

    const result = await getOpsInboxSummary(supabase, {
      canSeeVolunteerApplications: false,
      canSeeContactMessages: false,
      canSeeEventCheckins: true,
    });

    expect(result.items.some((item) => item.href.includes(event.id))).toBe(
      false,
    );

    await cleanupEvent(event);
  });

  test("returns no check-in items when the viewer can't see event check-ins", async () => {
    const event = await createPublishedEvent({
      startsAt: todayIso(),
      timezone: "UTC",
    });
    await seedRegistration(event.id, false);
    const supabase = await signInAs(SEEDED_USERS.admin);

    const result = await getOpsInboxSummary(supabase, {
      canSeeVolunteerApplications: false,
      canSeeContactMessages: false,
      canSeeEventCheckins: false,
    });

    expect(result.items.some((item) => item.href.includes(event.id))).toBe(
      false,
    );

    await cleanupEvent(event);
  });
});

// Every summary in attention-items.ts takes its "can this viewer see X" flags
// from the portal layout and otherwise trusts RLS for the rows -- no
// checkPermission anywhere in the module. The cases above all run as admin,
// so nothing proved the RLS half (#746). These force every flag on, which is
// exactly the question worth asking: if the layout's permission derivation
// were ever wrong, would the database still refuse?
const ALL_FLAGS_ON = {
  canSeeVolunteerApplications: true,
  canSeeContactMessages: true,
  canSeeEventCheckins: true,
};

const EMPTY = { items: [] };

describe("attention summaries for unprivileged actors (integration)", () => {
  test("no unprivileged session gets rows from the approval or access-management summaries", async () => {
    const event = await createPublishedEvent({
      startsAt: todayIso(),
      timezone: "UTC",
    });
    await seedRegistration(event.id, false);

    // The privileged baseline, so the empties below can't be a quiet database.
    expect(
      (await getOpsInboxSummary(adminClient, ALL_FLAGS_ON)).items.length,
    ).toBeGreaterThan(0);
    expect(
      (
        await getPendingApprovalsSummary(adminClient, {
          canSeeExpenseApprovals: true,
          canSeeReimbursementApprovals: true,
        })
      ).items.length,
    ).toBeGreaterThan(0);
    expect(
      (
        await getAccessManagementAttentionSummary(adminClient, {
          canSeeAccessManagement: true,
        })
      ).items.length,
    ).toBeGreaterThan(0);
    expect(
      (await getEventTaskSummary(adminClient, { canManageEvents: true })).items
        .length,
    ).toBeGreaterThan(0);

    for (const { name, client } of await unprivilegedActors()) {
      // The volunteer role holds volunteers:view and events:view, so its ops
      // inbox and event tasks are covered separately below.
      if (name !== "volunteer") {
        expect({
          actor: name,
          ...(await getOpsInboxSummary(client, ALL_FLAGS_ON)),
        }).toEqual({ actor: name, ...EMPTY });
        expect({
          actor: name,
          ...(await getEventTaskSummary(client, { canManageEvents: true })),
        }).toEqual({ actor: name, ...EMPTY });
      }

      expect({
        actor: name,
        ...(await getPendingApprovalsSummary(client, {
          canSeeExpenseApprovals: true,
          canSeeReimbursementApprovals: true,
        })),
      }).toEqual({ actor: name, ...EMPTY });
      expect({
        actor: name,
        ...(await getAccessManagementAttentionSummary(client, {
          canSeeAccessManagement: true,
        })),
      }).toEqual({ actor: name, ...EMPTY });
    }

    await cleanupEvent(event);
  });

  test("the volunteer role sees only the ops-inbox items its own grants cover", async () => {
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    const result = await getOpsInboxSummary(volunteer, ALL_FLAGS_ON);

    // volunteers:view and events:view -- both intentional, both matched by
    // the portal layout's own flags for this role.
    expect(
      result.items.some((item) => item.key === "volunteer_applications_new"),
    ).toBe(true);
    // communications:view, which the volunteer role does not hold: the flag
    // was forced on above and RLS still returned nothing.
    expect(
      result.items.some((item) => item.key === "contact_messages_new"),
    ).toBe(false);
  });

  test("the calendar coverage reminder stays empty without content_calendar access", async () => {
    // The reminder only surfaces from October 1, so the date is pinned rather
    // than left to whenever the suite runs.
    const october = new Date("2026-10-15T12:00:00.000Z");
    const options = { canManageContentCalendar: true };

    expect(
      (await getCalendarCoverageReminderSummary(adminClient, options, october))
        .items.length,
    ).toBeGreaterThan(0);

    for (const { name, client } of await unprivilegedActors()) {
      if (name === "volunteer") continue; // holds content_calendar:view
      expect({
        actor: name,
        ...(await getCalendarCoverageReminderSummary(client, options, october)),
      }).toEqual({ actor: name, ...EMPTY });
    }
  });
});
