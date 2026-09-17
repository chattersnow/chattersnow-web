// Integration test: the agenda's "Next 30 days" read against a real local
// Supabase stack. Mocks cannot answer the two questions this action exists to
// get right -- what a role with governance but not events actually sees, and
// which rows the window filter keeps -- because both are decided by RLS and by
// Postgres, not by the TypeScript around them. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  TENANT_TIME_ZONE,
  createCalendarItem,
  createGovernanceMeeting,
  createPublishedEvent,
  signInAs,
} from "../../../../../../test/integration-setup";

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { listMeetingDatedContextAction } =
  await import("./meeting-context-actions");

// A meeting far enough out that nothing the seed creates lands in its window,
// so every assertion below is about rows this file made. 11am Mountain on the
// 10th -- the day the window anchors on.
const MEETING_DATE = "2027-03-10T18:00:00.000Z";

const cleanups: (() => Promise<unknown>)[] = [];
function track<T extends { cleanup: () => Promise<unknown> }>(fixture: T): T {
  cleanups.push(fixture.cleanup);
  return fixture;
}

const meeting = track(
  await createGovernanceMeeting({ meetingDate: MEETING_DATE }),
);

// In the window (2027-03-10 .. 2027-04-09, cut in America/Denver).
track(
  await createPublishedEvent({
    name: "Spring gear swap",
    startsAt: "2027-03-20T18:00:00.000Z",
  }),
);
// Began before the meeting and still running on it: upcoming as far as the
// board is concerned, and dropped entirely by a filter on `starts_at` alone.
track(
  await createPublishedEvent({
    name: "Season-long mentorship",
    startsAt: "2027-03-01T18:00:00.000Z",
    endsAt: "2027-03-15T18:00:00.000Z",
  }),
);
track(
  await createPublishedEvent({
    name: "Summer picnic",
    startsAt: "2027-05-01T18:00:00.000Z",
  }),
);
track(
  await createPublishedEvent({
    name: "Cancelled clinic",
    startsAt: "2027-03-21T18:00:00.000Z",
    status: "archived",
  }),
);

track(
  await createCalendarItem({
    title: "Newsletter deadline",
    startsAt: "2027-03-25T18:00:00.000Z",
  }),
);
track(
  await createCalendarItem({
    title: "Summer campaign",
    startsAt: "2027-06-01T18:00:00.000Z",
  }),
);
// Anchored three years before the meeting. Its `starts_at` is nowhere near the
// window; its next instance lands squarely inside it.
const recurringItem = track(
  await createCalendarItem({
    title: "Trans Day of Visibility",
    startsAt: "2024-03-31T06:00:00.000Z",
    timeZone: TENANT_TIME_ZONE,
    priorityTier: 1,
    seriesKey: crypto.randomUUID(),
    recurrenceStartMonth: 3,
    recurrenceStartDay: 31,
    recurrenceEndMonth: 3,
    recurrenceEndDay: 31,
  }),
);

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
});

async function contextAs(email: string) {
  currentSupabase = await signInAs(email);
  const result = await listMeetingDatedContextAction(meeting.id);
  if ("error" in result) throw new Error(result.error.message);
  return result.data;
}

const titles = (context: { entries: { title: string }[] }) =>
  context.entries.map((entry) => entry.title);

describe("listMeetingDatedContextAction (integration)", () => {
  test("cuts the window on the organization's day, not the database's", async () => {
    const context = await contextAs(SEEDED_USERS.admin);

    expect(context.timeZone).toBe(TENANT_TIME_ZONE);
    expect(context.window).toEqual({
      fromDate: "2027-03-10",
      toDate: "2027-04-09",
    });
    expect(context.gaps).toEqual([]);
  });

  test("keeps what is in the window and leaves out what is not", async () => {
    const context = await contextAs(SEEDED_USERS.admin);
    const shown = titles(context);

    expect(shown).toContain("Spring gear swap");
    expect(shown).toContain("Season-long mentorship");
    expect(shown).toContain("Newsletter deadline");

    expect(shown).not.toContain("Summer picnic");
    expect(shown).not.toContain("Cancelled clinic");
    expect(shown).not.toContain("Summer campaign");
  });

  test("includes a recurring observance for its next instance, dated to it", async () => {
    const context = await contextAs(SEEDED_USERS.admin);
    const entry = context.entries.find(
      (row) => row.title === "Trans Day of Visibility",
    );

    expect(entry).toBeDefined();
    // The instance's date, not the 2024 anchor's.
    expect(entry?.starts_at.slice(0, 4)).toBe("2027");
    expect(entry?.href).toBe(`/portal/calendar/${recurringItem.id}`);
  });

  test("sorts the merged list soonest first", async () => {
    const context = await contextAs(SEEDED_USERS.admin);
    const instants = context.entries.map((entry) =>
      Date.parse(entry.starts_at),
    );
    expect(instants).toEqual([...instants].sort((a, b) => a - b));
  });

  test("tells a board member that events are missing rather than showing none", async () => {
    // `board` holds governance at manage and content_calendar at view, but
    // events at none -- exactly the split this shape exists for.
    const context = await contextAs(SEEDED_USERS.board);
    const shown = titles(context);

    expect(shown).toContain("Newsletter deadline");
    expect(shown).not.toContain("Spring gear swap");
    expect(context.gaps).toEqual([{ source: "events", reason: "forbidden" }]);
  });

  test("refuses a caller without governance access at all", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    const result = await listMeetingDatedContextAction(meeting.id);

    expect("error" in result && result.error.code).toBe("forbidden");
  });

  test("reports a meeting that no longer exists as a conflict", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await listMeetingDatedContextAction(
      "00000000-0000-4000-8000-000000000000",
    );

    expect("error" in result && result.error.code).toBe("conflict");
  });
});
