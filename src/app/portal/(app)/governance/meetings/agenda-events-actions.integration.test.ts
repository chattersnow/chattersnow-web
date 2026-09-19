// Integration test: the agenda Events section's feed (#1241) against a real
// local Supabase stack. Three of its four questions are answered by Postgres
// and by RLS rather than by the TypeScript around them -- which rows each
// window keeps, that archived events never surface, and what a board member
// with no events entitlement gets -- and a mocked client can answer none of
// them. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createGovernanceMeeting,
  createPerson,
  createPublishedEvent,
  signInAs,
} from "../../../../../../test/integration-setup";

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { listAgendaEventsAction } = await import("./agenda-events-actions");

// Far enough out that nothing the seed creates lands in either window, so
// every assertion below is about rows this file made. Both meetings are 11am
// Mountain, the zone `app_settings.org.timezone` pins for the seeded tenant.
const PREVIOUS_MEETING_DATE = "2028-02-09T18:00:00.000Z";
const MEETING_DATE = "2028-03-08T18:00:00.000Z";

const cleanups: (() => Promise<unknown>)[] = [];
function track<T extends { cleanup: () => Promise<unknown> }>(fixture: T): T {
  cleanups.push(fixture.cleanup);
  return fixture;
}

const previousMeeting = track(
  await createGovernanceMeeting({ meetingDate: PREVIOUS_MEETING_DATE }),
);
const meeting = track(
  await createGovernanceMeeting({ meetingDate: MEETING_DATE }),
);
const lead = track(await createPerson({ name: "Dana Lead" }));

// --- Since the last meeting (2028-02-09 .. 2028-03-08, cut in Denver) -------
track(
  await createPublishedEvent({
    name: "Winter gear swap",
    startsAt: "2028-02-20T18:00:00.000Z",
    reportStatus: "submitted",
    eventLeadId: lead.id,
  }),
);
// Past and still owing a report: the one row the board is there to act on.
track(
  await createPublishedEvent({
    name: "February fundraiser",
    startsAt: "2028-02-25T18:00:00.000Z",
    reportStatus: "not_started",
  }),
);
// The day before the previous meeting -- one day outside the window.
track(
  await createPublishedEvent({
    name: "January wrap-up",
    startsAt: "2028-02-08T18:00:00.000Z",
  }),
);
// Inside the window but put away; must never appear.
track(
  await createPublishedEvent({
    name: "Archived clinic",
    startsAt: "2028-02-22T18:00:00.000Z",
    status: "archived",
  }),
);

// --- Coming up -------------------------------------------------------------
track(
  await createPublishedEvent({
    name: "Spring ride",
    startsAt: "2028-03-20T18:00:00.000Z",
  }),
);
// Past the agenda's next meeting date once one is set, inside the bare
// 90-day lookahead until then.
track(
  await createPublishedEvent({
    name: "May picnic",
    startsAt: "2028-05-05T18:00:00.000Z",
  }),
);
// Beyond 90 days either way.
track(
  await createPublishedEvent({
    name: "Autumn gala",
    startsAt: "2028-10-01T18:00:00.000Z",
  }),
);

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
});

async function feedFor(meetingId: string, meetingDate: string, email: string) {
  currentSupabase = await signInAs(email);
  const result = await listAgendaEventsAction(meetingId, meetingDate);
  if ("error" in result) throw new Error(result.error);
  return result.data;
}

const names = (group: { events: { name: string }[] } | null) =>
  (group?.events ?? []).map((event) => event.name);

describe("listAgendaEventsAction (integration)", () => {
  test("cuts both windows on the organization's day", async () => {
    const feed = await feedFor(meeting.id, MEETING_DATE, SEEDED_USERS.admin);

    expect(feed.timeZone).toBe("America/Denver");
    expect(feed.since).toMatchObject({
      fromDate: "2028-02-09",
      toDate: "2028-03-08",
    });
    // The day after the meeting, so nothing is in both groups.
    expect(feed.upcoming.fromDate).toBe("2028-03-09");
    expect(feed.upcoming.toDate).toBe("2028-06-06");
    expect(feed.unavailable).toBeNull();
  });

  test("puts each event in the group its date belongs to", async () => {
    const feed = await feedFor(meeting.id, MEETING_DATE, SEEDED_USERS.admin);

    expect(names(feed.since)).toEqual([
      "Winter gear swap",
      "February fundraiser",
    ]);
    expect(names(feed.upcoming)).toContain("Spring ride");
    expect(names(feed.upcoming)).toContain("May picnic");
  });

  test("leaves out what is outside either window", async () => {
    const feed = await feedFor(meeting.id, MEETING_DATE, SEEDED_USERS.admin);
    const shown = [...names(feed.since), ...names(feed.upcoming)];

    expect(shown).not.toContain("January wrap-up");
    expect(shown).not.toContain("Autumn gala");
  });

  test("never shows an archived event", async () => {
    const feed = await feedFor(meeting.id, MEETING_DATE, SEEDED_USERS.admin);
    const shown = [...names(feed.since), ...names(feed.upcoming)];

    expect(shown).not.toContain("Archived clinic");
  });

  test("carries the report status and the lead's name", async () => {
    const feed = await feedFor(meeting.id, MEETING_DATE, SEEDED_USERS.admin);
    const swap = feed.since?.events.find((e) => e.name === "Winter gear swap");
    const fundraiser = feed.since?.events.find(
      (e) => e.name === "February fundraiser",
    );

    expect(swap?.report_status).toBe("submitted");
    expect(swap?.event_lead_name).toBe("Dana Lead");
    // What the section flags: behind the meeting, report still not in.
    expect(fundraiser?.report_status).toBe("not_started");
    expect(fundraiser?.event_lead_name).toBeNull();
  });

  test("ends the lookahead at the agenda's next meeting date", async () => {
    const { error } = await adminClient
      .from("agendas")
      .insert({ meeting_id: meeting.id, next_meeting_date: "2028-04-12" });
    if (error) throw error;
    cleanups.push(async () => {
      await adminClient.from("agendas").delete().eq("meeting_id", meeting.id);
    });

    const feed = await feedFor(meeting.id, MEETING_DATE, SEEDED_USERS.admin);

    expect(feed.upcoming.toDate).toBe("2028-04-12");
    expect(names(feed.upcoming)).toContain("Spring ride");
    expect(names(feed.upcoming)).not.toContain("May picnic");
  });

  test("has no period to review for the earliest meeting", async () => {
    // `previousMeeting` is the earliest of the pair, but the seed has meetings
    // of its own before it -- so this asks for a meeting dated before all of
    // them, which is the case the null is for.
    const first = track(
      await createGovernanceMeeting({
        meetingDate: "1999-01-01T18:00:00.000Z",
      }),
    );
    const feed = await feedFor(
      first.id,
      "1999-01-01T18:00:00.000Z",
      SEEDED_USERS.admin,
    );

    expect(feed.since).toBeNull();
    expect(feed.upcoming.fromDate).toBe("1999-01-02");
  });

  test("resolves the previous meeting as the one just before this one", async () => {
    const feed = await feedFor(meeting.id, MEETING_DATE, SEEDED_USERS.admin);

    // Not the seed's older meetings: the window starts on the fixture dated a
    // month back, which is what `findPreviousMeeting` is there to pick.
    expect(feed.since?.fromDate).toBe("2028-02-09");
    expect(previousMeeting.id).toBeTruthy();
  });

  test("gives a board member without Events an empty feed, not a failure", async () => {
    // `board` holds governance at manage and events at none -- the split this
    // whole shape exists for. The agenda must stay usable in the meeting.
    const feed = await feedFor(meeting.id, MEETING_DATE, SEEDED_USERS.board);

    expect(feed.unavailable).toBe("forbidden");
    expect(feed.since?.events).toEqual([]);
    expect(feed.upcoming.events).toEqual([]);
    // Still says which days it would have covered, so the section reads the
    // same as it does for anyone else.
    expect(feed.since?.fromDate).toBe("2028-02-09");
  });

  test("refuses a caller without governance access at all", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    const result = await listAgendaEventsAction(meeting.id, MEETING_DATE);

    expect("error" in result).toBe(true);
  });
});
