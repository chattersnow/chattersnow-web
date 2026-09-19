// Integration test: the agenda's calendar and partnerships feeds (#1242)
// against a real local Supabase stack. Almost everything this file asserts is
// answered by Postgres rather than by the TypeScript around it -- which rows
// the window keeps, that a category key the tenant has deactivated really is
// gone from `calendar_categories`, that an annual observance stored once in
// 2024 projects into a 2028 window exactly once, and that a closed partnership
// never surfaces. A mocked client can answer none of them. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createCalendarItem,
  createContentPiece,
  createGovernanceMeeting,
  createPerson,
  signInAs,
} from "../../../../../../test/integration-setup";

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { listAgendaCalendarItemsAction, listOpenPartnershipsAction } =
  await import("./agenda-calendar-actions");

// Far enough out that nothing the seed creates lands in the window, so every
// assertion below is about rows this file made. 11am Mountain, the zone
// `app_settings.org.timezone` pins for the seeded tenant.
const MEETING_DATE = "2028-03-08T18:00:00.000Z";

// Version 2's Community & Partnerships source, plus a key no tenant has: an
// unknown key must narrow the filter, not empty the section.
const COMMUNITY_SOURCE = {
  kind: "calendar",
  categories: ["partner_opportunities", "never_seeded_anywhere"],
  item_types: ["partner_event"],
};

// Version 2's Marketing & Social source: the same reader, a different section
// (#1243). Naming content item types is also what turns the content pieces on.
const MARKETING_SOURCE = {
  kind: "calendar",
  categories: ["campaigns_fundraising"],
  item_types: [
    "content_campaign",
    "content_opportunity",
    "winter_outdoor_sports_moment",
  ],
};

const cleanups: (() => Promise<unknown>)[] = [];
function track<T extends { cleanup: () => Promise<unknown> }>(fixture: T): T {
  cleanups.push(fixture.cleanup);
  return fixture;
}

const meeting = track(
  await createGovernanceMeeting({ meetingDate: MEETING_DATE }),
);

// --- Inside the window (2028-03-08 .. 2028-06-06, cut in Denver) -----------
// Matches on its category alone: its item type is not one the section names.
track(
  await createCalendarItem({
    title: "Coalition brunch",
    itemType: "community_observance",
    startsAt: "2028-03-20T06:00:00.000Z",
    categories: ["partner_opportunities"],
  }),
);
// Matches on its item type alone, with no category at all -- a partner event
// nobody tagged still belongs to the section. It has a content piece against
// it, which Community & Partnerships' read must not go and fetch.
const chamberMixer = track(
  await createCalendarItem({
    title: "Chamber mixer",
    itemType: "partner_event",
    startsAt: "2028-04-02T06:00:00.000Z",
  }),
);
track(
  await createContentPiece(chamberMixer.id, {
    title: "Mixer recap",
    contentStatus: "idea",
    publishDueAt: "2020-04-01T16:00:00.000Z",
  }),
);
// Matches neither half of Community & Partnerships' filter, and both halves
// of Marketing & Social's. Two pieces planned against it: one still in draft
// and long past its publish date, one already out.
const newsletterPush = track(
  await createCalendarItem({
    title: "Newsletter push",
    itemType: "content_campaign",
    startsAt: "2028-03-25T06:00:00.000Z",
    categories: ["campaigns_fundraising"],
  }),
);
track(
  await createContentPiece(newsletterPush.id, {
    title: "Launch post",
    contentStatus: "draft",
    publishDueAt: "2020-06-01T16:00:00.000Z",
  }),
);
track(
  await createContentPiece(newsletterPush.id, {
    title: "Follow-up post",
    contentStatus: "published",
    publishDueAt: "2020-05-01T16:00:00.000Z",
  }),
);
// Everything planned against it is out: nothing is owed, however old the
// dates on it are.
const skiTeaser = track(
  await createCalendarItem({
    title: "Ski season teaser",
    itemType: "content_campaign",
    startsAt: "2028-03-27T06:00:00.000Z",
    categories: ["campaigns_fundraising"],
  }),
);
track(
  await createContentPiece(skiTeaser.id, {
    title: "Teaser reel",
    contentStatus: "published",
    publishDueAt: "2020-05-01T16:00:00.000Z",
  }),
);
// A date Marketing & Social reads with nothing planned against it at all --
// the row the section most needs to keep.
track(
  await createCalendarItem({
    title: "First snow day",
    itemType: "winter_outdoor_sports_moment",
    startsAt: "2028-03-29T06:00:00.000Z",
  }),
);
// Inside the window but put away; must never appear.
track(
  await createCalendarItem({
    title: "Archived meetup",
    itemType: "partner_event",
    startsAt: "2028-03-30T06:00:00.000Z",
    calendarStatus: "archived",
  }),
);

// --- Outside the window ----------------------------------------------------
track(
  await createCalendarItem({
    title: "Autumn summit",
    itemType: "partner_event",
    startsAt: "2028-10-01T06:00:00.000Z",
  }),
);
// The day before the meeting: the window opens on the meeting's own day.
track(
  await createCalendarItem({
    title: "Last week's mixer",
    itemType: "partner_event",
    startsAt: "2028-03-07T06:00:00.000Z",
  }),
);

// --- Recurring -------------------------------------------------------------
// Stored once, dated in 2024, recurring every 20-22 May: the window filter
// alone cannot see it, and the section has to show it on its 2028 date.
track(
  await createCalendarItem({
    title: "Pride weekend",
    itemType: "partner_event",
    startsAt: "2024-05-20T06:00:00.000Z",
    priorityTier: 1,
    seriesKey: crypto.randomUUID(),
    recurrenceStartMonth: 5,
    recurrenceStartDay: 20,
    recurrenceEndMonth: 5,
    recurrenceEndDay: 22,
  }),
);
// A series whose own row is already inside the window: it is the dated read's
// row and the projection's candidate both, and must still be listed once.
track(
  await createCalendarItem({
    title: "Trailhead cleanup",
    itemType: "partner_event",
    startsAt: "2028-04-10T06:00:00.000Z",
    priorityTier: 1,
    seriesKey: crypto.randomUUID(),
    recurrenceStartMonth: 4,
    recurrenceStartDay: 10,
    recurrenceEndMonth: 4,
    recurrenceEndDay: 10,
  }),
);

// --- Partnerships ----------------------------------------------------------
const overdueOrg = track(await createPerson({ name: "Mountain Pride Co-op" }));
const undatedOrg = track(await createPerson({ name: "Nordic Center" }));
const closedOrg = track(await createPerson({ name: "Former Sponsor Ltd" }));
const partnershipOwner = track(await createPerson({ name: "Dana Lead" }));

async function createPartnership(fields: {
  organizationPersonId: string;
  ownerPersonId?: string | null;
  stage: string;
  nextStepDate?: string | null;
}) {
  const { data, error } = await adminClient
    .from("partnership_opportunities")
    .insert({
      organization_person_id: fields.organizationPersonId,
      owner_person_id: fields.ownerPersonId ?? null,
      stage: fields.stage,
      next_step_date: fields.nextStepDate ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("partnership_opportunities").delete().eq("id", id);
    },
  };
}

track(
  await createPartnership({
    organizationPersonId: overdueOrg.id,
    ownerPersonId: partnershipOwner.id,
    stage: "negotiating",
    // Long past whatever day the suite runs on.
    nextStepDate: "2020-01-15",
  }),
);
track(
  await createPartnership({
    organizationPersonId: undatedOrg.id,
    stage: "prospecting",
  }),
);
track(
  await createPartnership({
    organizationPersonId: closedOrg.id,
    stage: "closed_won",
    nextStepDate: "2020-02-01",
  }),
);

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
});

async function feedFor(email: string, source: unknown = COMMUNITY_SOURCE) {
  currentSupabase = await signInAs(email);
  const result = await listAgendaCalendarItemsAction(
    meeting.id,
    MEETING_DATE,
    source,
  );
  if ("error" in result) throw new Error(result.error);
  return result.data;
}

const titles = (feed: { items: { title: string }[] }) =>
  feed.items.map((item) => item.title);

/** The day an occurrence falls on, in its own zone -- what the block renders. */
const dayOf = (item: { starts_at: string; time_zone: string }) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: item.time_zone }).format(
    new Date(item.starts_at),
  );

describe("listAgendaCalendarItemsAction (integration)", () => {
  test("cuts the window from the meeting's own day", async () => {
    const feed = await feedFor(SEEDED_USERS.admin);

    expect(feed.timeZone).toBe("America/Denver");
    expect(feed.window).toEqual({
      fromDate: "2028-03-08",
      toDate: "2028-06-06",
    });
    expect(feed.unavailable).toBeNull();
  });

  test("keeps an item matching either the category or the item type", async () => {
    const shown = titles(await feedFor(SEEDED_USERS.admin));

    expect(shown).toContain("Coalition brunch");
    expect(shown).toContain("Chamber mixer");
    expect(shown).not.toContain("Newsletter push");
  });

  test("leaves out what is outside the window", async () => {
    const shown = titles(await feedFor(SEEDED_USERS.admin));

    expect(shown).not.toContain("Autumn summit");
    expect(shown).not.toContain("Last week's mixer");
  });

  test("never shows an archived item", async () => {
    const shown = titles(await feedFor(SEEDED_USERS.admin));

    expect(shown).not.toContain("Archived meetup");
  });

  test("shows a recurring item once, on the occurrence in the window", async () => {
    const feed = await feedFor(SEEDED_USERS.admin);
    const pride = feed.items.filter((item) => item.title === "Pride weekend");

    expect(pride).toHaveLength(1);
    // Projected forward from the 2024 row it is stored as.
    expect(dayOf(pride[0]!)).toBe("2028-05-20");
  });

  test("does not double a series whose own row is already in the window", async () => {
    const feed = await feedFor(SEEDED_USERS.admin);
    const cleanup = feed.items.filter(
      (item) => item.title === "Trailhead cleanup",
    );

    expect(cleanup).toHaveLength(1);
    expect(dayOf(cleanup[0]!)).toBe("2028-04-10");
  });

  test("orders by the date each occurrence falls on", async () => {
    const feed = await feedFor(SEEDED_USERS.admin);
    const ours = feed.items
      .filter((item) =>
        [
          "Coalition brunch",
          "Chamber mixer",
          "Trailhead cleanup",
          "Pride weekend",
        ].includes(item.title),
      )
      .map((item) => item.title);

    expect(ours).toEqual([
      "Coalition brunch",
      "Chamber mixer",
      "Trailhead cleanup",
      "Pride weekend",
    ]);
  });

  test("carries the tenant's own words for its categories", async () => {
    const feed = await feedFor(SEEDED_USERS.admin);
    const brunch = feed.items.find((item) => item.title === "Coalition brunch");

    expect(brunch?.categories).toEqual(["partner_opportunities"]);
    expect(
      feed.categoryOptions.find(
        (option) => option.value === "partner_opportunities",
      )?.label,
    ).toBe("Partner opportunities");
  });

  test("ends the window at the agenda's next meeting date", async () => {
    const { error } = await adminClient
      .from("agendas")
      .insert({ meeting_id: meeting.id, next_meeting_date: "2028-04-05" });
    if (error) throw error;
    cleanups.push(async () => {
      await adminClient.from("agendas").delete().eq("meeting_id", meeting.id);
    });

    const feed = await feedFor(SEEDED_USERS.admin);

    expect(feed.window.toDate).toBe("2028-04-05");
    expect(titles(feed)).toContain("Chamber mixer");
    // Both now fall after the next meeting.
    expect(titles(feed)).not.toContain("Trailhead cleanup");
    expect(titles(feed)).not.toContain("Pride weekend");

    await adminClient.from("agendas").delete().eq("meeting_id", meeting.id);
  });

  test("skips a category the tenant has deactivated and keeps the rest of the filter", async () => {
    const { error } = await adminClient
      .from("calendar_categories")
      .update({ is_active: false })
      .eq("key", "partner_opportunities");
    if (error) throw error;

    try {
      const shown = titles(await feedFor(SEEDED_USERS.admin));

      // Matched only through the deactivated key.
      expect(shown).not.toContain("Coalition brunch");
      // The item types beside it still apply.
      expect(shown).toContain("Chamber mixer");
    } finally {
      await adminClient
        .from("calendar_categories")
        .update({ is_active: true })
        .eq("key", "partner_opportunities");
    }
  });

  test("refuses a source that does not read from the calendar", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await listAgendaCalendarItemsAction(
      meeting.id,
      MEETING_DATE,
      { kind: "events" },
    );

    expect("error" in result).toBe(true);
  });

  test("refuses a caller without governance access at all", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    const result = await listAgendaCalendarItemsAction(
      meeting.id,
      MEETING_DATE,
      COMMUNITY_SOURCE,
    );

    expect("error" in result).toBe(true);
  });
});

// The content work state Marketing & Social adds on top of the same reader
// (#1243): what is written for each date, and what is already late.
describe("listAgendaCalendarItemsAction content work state (integration)", () => {
  const itemNamed = <T extends { title: string }>(
    feed: { items: T[] },
    title: string,
  ) => feed.items.find((item) => item.title === title);

  test("answers the marketing section with its own rows", async () => {
    const shown = titles(await feedFor(SEEDED_USERS.admin, MARKETING_SOURCE));

    expect(shown).toContain("Newsletter push");
    expect(shown).toContain("First snow day");
    // The section beside it reads different rows out of the same action.
    expect(shown).not.toContain("Chamber mixer");
  });

  test("carries the pieces and flags what is past its publish date", async () => {
    const feed = await feedFor(SEEDED_USERS.admin, MARKETING_SOURCE);
    const push = itemNamed(feed, "Newsletter push");

    // The embed has no order of its own, so compare it as a set would be.
    const statuses = (push?.content_pieces ?? [])
      .map((piece) => piece.content_status)
      .sort();
    expect(statuses).toEqual(["draft", "published"]);
    // The earliest deadline still owed -- the published piece owes nothing,
    // however much older its own date is.
    expect(Date.parse(push?.publish_due_at ?? "")).toBe(
      Date.parse("2020-06-01T16:00:00Z"),
    );
    expect(push?.content_overdue).toBe(true);
  });

  test("owes nothing once every piece is out", async () => {
    const feed = await feedFor(SEEDED_USERS.admin, MARKETING_SOURCE);
    const teaser = itemNamed(feed, "Ski season teaser");

    expect(teaser?.content_pieces).toEqual([{ content_status: "published" }]);
    expect(teaser?.publish_due_at).toBeNull();
    expect(teaser?.content_overdue).toBe(false);
  });

  test("keeps a date with nothing planned against it", async () => {
    const feed = await feedFor(SEEDED_USERS.admin, MARKETING_SOURCE);
    const snowDay = itemNamed(feed, "First snow day");

    expect(snowDay).toBeDefined();
    expect(snowDay?.content_pieces).toEqual([]);
    expect(snowDay?.publish_due_at).toBeNull();
    expect(snowDay?.content_overdue).toBe(false);
  });

  test("a section that shows no content columns does not read the pieces", async () => {
    const feed = await feedFor(SEEDED_USERS.admin);
    const mixer = itemNamed(feed, "Chamber mixer");

    // The row has a piece against it; Community & Partnerships' read never
    // joined it, which is the join its section should not pay for.
    expect(mixer).toBeDefined();
    expect(mixer?.content_pieces).toEqual([]);
    expect(mixer?.publish_due_at).toBeNull();
  });
});

describe("listOpenPartnershipsAction (integration)", () => {
  async function partnershipsFor(email: string) {
    currentSupabase = await signInAs(email);
    const result = await listOpenPartnershipsAction();
    if ("error" in result) throw new Error(result.error);
    return result.data;
  }

  test("lists the open stages and never a closed one", async () => {
    const feed = await partnershipsFor(SEEDED_USERS.admin);
    const names = feed.partnerships.map((row) => row.organization);

    expect(feed.unavailable).toBeNull();
    expect(names).toContain("Mountain Pride Co-op");
    expect(names).toContain("Nordic Center");
    expect(names).not.toContain("Former Sponsor Ltd");
  });

  test("flags a next step that is already behind the organization's today", async () => {
    const feed = await partnershipsFor(SEEDED_USERS.admin);
    const overdue = feed.partnerships.find(
      (row) => row.organization === "Mountain Pride Co-op",
    );
    const undated = feed.partnerships.find(
      (row) => row.organization === "Nordic Center",
    );

    expect(overdue?.overdue).toBe(true);
    expect(overdue?.stage).toBe("negotiating");
    expect(overdue?.owner_name).toBe("Dana Lead");
    // No date is not a late date.
    expect(undated?.overdue).toBe(false);
    expect(undated?.next_step_date).toBeNull();
  });

  test("puts the dated rows ahead of the undated ones", async () => {
    const feed = await partnershipsFor(SEEDED_USERS.admin);
    const dated = feed.partnerships.filter(
      (row) => row.next_step_date !== null,
    );
    const firstUndated = feed.partnerships.findIndex(
      (row) => row.next_step_date === null,
    );

    expect(dated.length).toBeGreaterThan(0);
    if (firstUndated !== -1) {
      expect(
        feed.partnerships
          .slice(firstUndated)
          .every((row) => row.next_step_date === null),
      ).toBe(true);
    }
  });

  test("refuses a caller without governance access at all", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    const result = await listOpenPartnershipsAction();

    expect("error" in result).toBe(true);
  });
});
