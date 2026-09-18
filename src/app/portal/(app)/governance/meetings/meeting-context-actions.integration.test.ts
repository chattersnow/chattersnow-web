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
  adminClient,
  createCalendarItem,
  createGovernanceMeeting,
  createPerson,
  createPublishedEvent,
  signInAs,
} from "../../../../../../test/integration-setup";

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { getMeetingTopicContextAction, listMeetingDatedContextAction } =
  await import("./meeting-context-actions");
const { isContextUnavailable } = await import("./meeting-context-catalog");
type ContextUnavailable =
  import("./meeting-context-catalog").ContextUnavailable;

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

// ---------------------------------------------------------------------------
// The records behind each standing agenda section (#1224).
//
// Every fixture below is dated in 2020 on purpose. The blocks show the three
// soonest-due rows and the seed has governance data of its own, so a fixture
// dated near the meeting would be crowded out of the list it is asserting on;
// dating it far in the past puts it first under the same ascending order the
// action uses, and makes it overdue, which is the other half of what these
// tests are about.
// ---------------------------------------------------------------------------

async function insertTracked(
  table: string,
  values: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await adminClient
    .from(table)
    .insert(values)
    .select("id")
    .single();
  if (error) throw error;
  const id = data.id as string;
  cleanups.push(async () => {
    await adminClient.from(table).delete().eq("id", id);
  });
  return id;
}

// A budgeted event inside the lookahead window, so the forward-looking half of
// the finance block has something to total. `createPublishedEvent` has no
// budget of its own.
const budgetedEvent = track(
  await createPublishedEvent({
    name: "Budgeted spring clinic",
    startsAt: "2027-03-22T18:00:00.000Z",
  }),
);
await adminClient
  .from("events")
  .update({ budget_amount: 2500 })
  .eq("id", budgetedEvent.id);

await insertTracked("grants", {
  funder_name: "Integration Open Funder",
  amount: 10000,
  application_deadline: "2020-01-05",
  status: "submitted",
});
await insertTracked("grants", {
  funder_name: "Integration Awarded Funder",
  amount: 5000,
  application_deadline: "2020-01-04",
  status: "awarded",
});

await insertTracked("annual_requirements", {
  name: "Integration overdue filing",
  due_date: "2020-01-01",
  status: "not_started",
});
await insertTracked("annual_requirements", {
  name: "Integration completed filing",
  due_date: "2020-01-02",
  status: "done",
});

await insertTracked("nonprofit_status_milestones", {
  description: "Integration 1023-EZ",
  phase: "Federal exemption",
  due_date: "2020-01-01",
  status: "in_progress",
});
await insertTracked("nonprofit_status_milestones", {
  description: "Integration cancelled step",
  phase: "Federal exemption",
  due_date: "2020-01-02",
  status: "cancelled",
});

const partner = track(await createPerson({ name: "Integration Ski Co" }));
await insertTracked("partnership_opportunities", {
  organization_person_id: partner.id,
  stage: "negotiating",
});
const closedPartner = track(
  await createPerson({ name: "Integration Closed Co" }),
);
await insertTracked("partnership_opportunities", {
  organization_person_id: closedPartner.id,
  stage: "closed_won",
});

async function topicContextAs(email: string, meetingId = meeting.id) {
  currentSupabase = await signInAs(email);
  const result = await getMeetingTopicContextAction(meetingId);
  if ("error" in result) throw new Error(result.error.message);
  return result.data;
}

/** Asserts a source answered, and narrows it away from its absent-with-reason form. */
function present<T>(value: T): Exclude<T, ContextUnavailable> {
  if (isContextUnavailable(value as object)) {
    throw new Error(
      `expected a payload, got ${(value as ContextUnavailable).unavailable}`,
    );
  }
  return value as Exclude<T, ContextUnavailable>;
}

describe("getMeetingTopicContextAction (integration)", () => {
  test("reviews back to the previous meeting and looks ahead 30 days", async () => {
    const context = await topicContextAs(SEEDED_USERS.admin);

    expect(context.timeZone).toBe(TENANT_TIME_ZONE);
    expect(context.lookahead).toEqual({
      fromDate: "2027-03-10",
      toDate: "2027-04-09",
    });
    // The seed's meetings all predate this fixture, so the review window opens
    // on one of them rather than on a flat 30 days back.
    expect(context.review.toDate).toBe("2027-03-10");
    expect(context.review.fromDate < "2027-02-08").toBe(true);
  });

  test("hands a board member the finance aggregate without table access", async () => {
    // `board` holds finance_reports:view but event_expenses, event_revenue and
    // finance at none. The figures come back because get_finance_report_data is
    // SECURITY DEFINER -- this is the case most likely to regress.
    const finance = present(
      (await topicContextAs(SEEDED_USERS.board)).finance_activity,
    );

    expect(typeof finance.net).toBe("number");
    expect(finance.window).toEqual({
      fromDate: (await topicContextAs(SEEDED_USERS.admin)).review.fromDate,
      toDate: "2027-03-10",
    });
    // Events are a plain RLS read and board holds events:none, so the forward
    // half is absent rather than zero.
    expect(finance.upcomingEventBudget).toBeNull();
    // Reimbursements are readable through reimbursement_approvals:manage.
    expect(finance.outstandingReimbursements).not.toBeNull();
  });

  test("totals upcoming event budgets for a caller who can see events", async () => {
    const finance = present(
      (await topicContextAs(SEEDED_USERS.admin)).finance_activity,
    );

    expect(finance.upcomingEventBudget).not.toBeNull();
    expect(finance.upcomingEventBudget!.total).toBeGreaterThanOrEqual(2500);
    expect(finance.upcomingEventBudget!.count).toBeGreaterThanOrEqual(1);
  });

  test("lists an overdue requirement and leaves a completed one out", async () => {
    const compliance = present(
      (await topicContextAs(SEEDED_USERS.admin)).nonprofit_compliance,
    );
    const labels = compliance.requirements.rows.map((row) => row.label);

    expect(labels).toContain("Integration overdue filing");
    expect(labels).not.toContain("Integration completed filing");
    const overdue = compliance.requirements.rows.find(
      (row) => row.label === "Integration overdue filing",
    );
    expect(overdue?.overdue).toBe(true);
  });

  test("lists an open milestone and leaves a cancelled one out", async () => {
    const compliance = present(
      (await topicContextAs(SEEDED_USERS.admin)).nonprofit_compliance,
    );
    const labels = compliance.milestones.rows.map((row) => row.label);

    expect(labels).toContain("Integration 1023-EZ");
    expect(labels).not.toContain("Integration cancelled step");
  });

  test("keeps undated milestones, which the seeded checklist is made of", async () => {
    // Every milestone the seed ships leaves `due_date` null. Requiring one
    // would leave this block permanently empty under the heading that asks
    // where the 501(c)(3) application stands.
    const compliance = present(
      (await topicContextAs(SEEDED_USERS.admin)).nonprofit_compliance,
    );

    expect(compliance.milestones.rows.some((row) => row.dueDate === null)).toBe(
      true,
    );
    // The dated fixture still sorts ahead of them.
    expect(compliance.milestones.rows[0]?.label).toBe("Integration 1023-EZ");
  });

  test("lists open grants by deadline and leaves awarded ones out", async () => {
    const grants = present((await topicContextAs(SEEDED_USERS.admin)).grants);
    const funders = grants.rows.map((row) => row.funderName);

    expect(funders).toContain("Integration Open Funder");
    expect(funders).not.toContain("Integration Awarded Funder");
    expect(grants.total).toBeGreaterThanOrEqual(grants.rows.length);
  });

  test("lists live partnerships and leaves closed ones out", async () => {
    const partnerships = present(
      (await topicContextAs(SEEDED_USERS.admin)).partnerships,
    );
    const names = partnerships.rows.map((row) => row.organization);

    expect(names).toContain("Integration Ski Co");
    expect(names).not.toContain("Integration Closed Co");
  });

  test("counts the disclosure gap against the fiscal year, not the calendar", async () => {
    // September 2027 is calendar 2027 and fiscal 2028 under the seeded July
    // start, which is the whole point of this case: a disclosure filed under
    // the calendar year does not satisfy the fiscal one.
    const fiscalMeeting = track(
      await createGovernanceMeeting({
        meetingDate: "2027-09-10T18:00:00.000Z",
      }),
    );
    const before = present(
      (await topicContextAs(SEEDED_USERS.admin, fiscalMeeting.id))
        .nonprofit_compliance,
    ).disclosures;
    expect(before.year).toBe(2028);

    const calendarOnly = track(
      await createPerson({ name: "Integration FY Gap" }),
    );
    const fiscalFiled = track(
      await createPerson({ name: "Integration FY Filed" }),
    );
    for (const person of [calendarOnly, fiscalFiled]) {
      await insertTracked("board_members", {
        person_id: person.id,
        role_title: "Director",
        term_start: "2026-07-01",
        is_active: true,
      });
    }
    await insertTracked("conflict_of_interest_disclosures", {
      person_id: calendarOnly.id,
      disclosure_year: 2027,
    });
    await insertTracked("conflict_of_interest_disclosures", {
      person_id: fiscalFiled.id,
      disclosure_year: 2028,
    });

    const after = present(
      (await topicContextAs(SEEDED_USERS.admin, fiscalMeeting.id))
        .nonprofit_compliance,
    ).disclosures;

    expect(after.boardMembers).toBe(before.boardMembers + 2);
    // Only the calendar-year filing is still a gap.
    expect(after.missing).toBe(before.missing + 1);
  });

  test("refuses a caller without governance access at all", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    const result = await getMeetingTopicContextAction(meeting.id);

    expect("error" in result && result.error.code).toBe("forbidden");
  });

  test("reports a meeting that no longer exists as a conflict", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getMeetingTopicContextAction(
      "00000000-0000-4000-8000-000000000000",
    );

    expect("error" in result && result.error.code).toBe("conflict");
  });
});
