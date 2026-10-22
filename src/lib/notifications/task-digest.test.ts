import { describe, expect, test } from "bun:test";
import {
  addCalendarDays,
  dedupeKeyFor,
  digestDay,
  digestHref,
  eventGroup,
  groupForDigest,
  includesUndated,
  meetingGroup,
  qualifies,
  type DigestPerson,
  type DigestSourceRow,
} from "./task-digest";

// Noon Mountain time, so nothing here is sitting on a zone boundary except the
// cases that mean to.
const WEDNESDAY = new Date("2026-03-11T19:00:00Z");
const MONDAY = new Date("2026-03-09T19:00:00Z");

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

function item(overrides: Partial<DigestSourceRow> = {}): DigestSourceRow {
  return {
    kind: "action_item",
    id: crypto.randomUUID(),
    tenant_id: TENANT_A,
    title: "Send the insurance certificate",
    due_date: "2026-03-12",
    owner_person_id: "person-a",
    href: digestHref("action_item", "meeting-1"),
    group: { key: "meeting:meeting-1", label: "Board meeting, Mar 1, 2026" },
    ...overrides,
  };
}

function person(overrides: Partial<DigestPerson> = {}): DigestPerson {
  return {
    id: "person-a",
    tenant_id: TENANT_A,
    email: "avery@example.test",
    notification_email: null,
    name: "Avery Stone",
    preferred_name: null,
    ...overrides,
  };
}

describe("digestDay", () => {
  test("reads the calendar date in the digest's zone, not UTC", () => {
    // 01:00 UTC on the 12th is still the evening of the 11th in Mountain time.
    expect(digestDay(new Date("2026-03-12T01:00:00Z"))).toBe("2026-03-11");
  });
});

describe("addCalendarDays", () => {
  test("adds days on the calendar", () => {
    expect(addCalendarDays("2026-03-11", 7)).toBe("2026-03-18");
  });

  test("crosses a month boundary", () => {
    expect(addCalendarDays("2026-02-27", 3)).toBe("2026-03-02");
  });
});

describe("dedupeKeyFor", () => {
  test("is one key per calendar day", () => {
    expect(dedupeKeyFor(WEDNESDAY)).toBe("task-digest:2026-03-11");
  });
});

describe("includesUndated", () => {
  test("only on Mondays", () => {
    expect(includesUndated(MONDAY)).toBe(true);
    expect(includesUndated(WEDNESDAY)).toBe(false);
  });
});

describe("qualifies", () => {
  const today = "2026-03-11";

  test("includes an overdue item", () => {
    expect(qualifies(item({ due_date: "2026-02-01" }), today, false)).toBe(
      true,
    );
  });

  test("includes an item due today", () => {
    expect(qualifies(item({ due_date: today }), today, false)).toBe(true);
  });

  test("includes an item due on the seventh day", () => {
    expect(qualifies(item({ due_date: "2026-03-18" }), today, false)).toBe(
      true,
    );
  });

  test("excludes an item due on the eighth day", () => {
    expect(qualifies(item({ due_date: "2026-03-19" }), today, false)).toBe(
      false,
    );
  });

  test("excludes an undated item except when undated items are allowed", () => {
    expect(qualifies(item({ due_date: null }), today, false)).toBe(false);
    expect(qualifies(item({ due_date: null }), today, true)).toBe(true);
  });
});

describe("groupForDigest", () => {
  test("gives a person one digest with their qualifying items", () => {
    const recipients = groupForDigest(
      [
        item({ title: "Due soon", due_date: "2026-03-12" }),
        item({ title: "Too far out", due_date: "2026-04-01" }),
      ],
      [person()],
      WEDNESDAY,
    );

    expect(recipients).toHaveLength(1);
    expect(recipients[0].email).toBe("avery@example.test");
    expect(recipients[0].items.map((i) => i.title)).toEqual(["Due soon"]);
  });

  test("addresses the override rather than the sign-in address (#1042)", () => {
    const recipients = groupForDigest(
      [item()],
      [person({ notification_email: "avery@chattersnow.test" })],
      WEDNESDAY,
    );
    expect(recipients[0].email).toBe("avery@chattersnow.test");
  });

  test("prefers a preferred name for the greeting", () => {
    const recipients = groupForDigest(
      [item()],
      [person({ preferred_name: "Ave" })],
      WEDNESDAY,
    );
    expect(recipients[0].name).toBe("Ave");
  });

  test("marks an overdue item urgent and a future one attention", () => {
    const recipients = groupForDigest(
      [
        item({ title: "Late", due_date: "2026-03-01" }),
        item({ title: "Soon", due_date: "2026-03-12" }),
      ],
      [person()],
      WEDNESDAY,
    );
    expect(recipients[0].items.map((i) => i.severity)).toEqual([
      "urgent",
      "attention",
    ]);
  });

  test("sorts soonest first and puts undated items last", () => {
    const recipients = groupForDigest(
      [
        item({ title: "No date", due_date: null }),
        item({ title: "Later", due_date: "2026-03-12" }),
        item({ title: "Sooner", due_date: "2026-03-10" }),
      ],
      [person()],
      // Monday, so the undated item is in scope at all.
      MONDAY,
    );
    expect(recipients[0].items.map((i) => i.title)).toEqual([
      "Sooner",
      "Later",
      "No date",
    ]);
  });

  test("keeps an item's link and group as its producer set them", () => {
    const group = {
      key: "event:event-9",
      label: "Winter Social, Jan 10, 2027",
    };
    const recipients = groupForDigest(
      [
        item({
          kind: "checklist",
          href: digestHref("checklist", "event-9"),
          group,
        }),
      ],
      [person()],
      WEDNESDAY,
    );
    expect(recipients[0].items[0]).toMatchObject({
      kind: "checklist",
      href: "/portal/events/event-9?tab=checklist",
      group,
    });
  });

  test("keys items by kind, since ids are only unique within a source", () => {
    const id = "same-id";
    const recipients = groupForDigest(
      [item({ id }), item({ id, kind: "checklist" })],
      [person()],
      WEDNESDAY,
    );
    expect(recipients[0].items.map((i) => i.key).sort()).toEqual([
      "action_item:same-id",
      "checklist:same-id",
    ]);
  });

  test("sends nothing to a person with no qualifying items", () => {
    const recipients = groupForDigest(
      [item({ due_date: "2026-06-01" })],
      [person()],
      WEDNESDAY,
    );
    expect(recipients).toEqual([]);
  });

  test("drops an item whose owner is not a possible recipient", () => {
    // No email, or no portal account: fetchRecipients never returns them, so
    // there is nobody for the item to attach to.
    const recipients = groupForDigest([item()], [], WEDNESDAY);
    expect(recipients).toEqual([]);
  });

  test("never puts two tenants' items in one email", () => {
    // The same person id in two tenants is not a realistic row, but it is
    // precisely the shape a grouping bug would produce -- and the job runs on
    // the service-role client, so nothing underneath would catch it.
    const recipients = groupForDigest(
      [
        item({ tenant_id: TENANT_A, title: "Tenant A item" }),
        item({ tenant_id: TENANT_B, title: "Tenant B item" }),
      ],
      [
        person({ tenant_id: TENANT_A, email: "a@example.test" }),
        person({ tenant_id: TENANT_B, email: "b@example.test" }),
      ],
      WEDNESDAY,
    );

    expect(recipients).toHaveLength(2);
    for (const recipient of recipients) {
      expect(recipient.items).toHaveLength(1);
    }
    expect(
      recipients.find((r) => r.tenantId === TENANT_A)?.items[0].title,
    ).toBe("Tenant A item");
    expect(
      recipients.find((r) => r.tenantId === TENANT_B)?.items[0].title,
    ).toBe("Tenant B item");
  });

  test("does not match an item to a person in another tenant", () => {
    const recipients = groupForDigest(
      [item({ tenant_id: TENANT_B })],
      [person({ tenant_id: TENANT_A })],
      WEDNESDAY,
    );
    expect(recipients).toEqual([]);
  });
});

describe("digestHref", () => {
  test("lands an action item on its meeting's action items", () => {
    expect(digestHref("action_item", "meeting-9")).toBe(
      "/portal/governance/meetings/meeting-9?tab=overview#action-items-section",
    );
  });

  test("lands each event task on the tab that edits it", () => {
    expect(digestHref("checklist", "e")).toBe("/portal/events/e?tab=checklist");
    expect(digestHref("retro_action", "e")).toBe(
      "/portal/events/e?tab=results",
    );
    expect(digestHref("sponsor_follow_up", "e")).toBe(
      "/portal/events/e?tab=sponsors",
    );
  });
});

describe("group labels", () => {
  test("names a meeting by type and its day in the digest's zone", () => {
    // 02:00 UTC on the 2nd is the evening of the 1st in Mountain time.
    expect(
      meetingGroup({
        id: "m",
        meeting_date: "2026-03-02T02:00:00Z",
        meeting_type: "board",
      }),
    ).toEqual({ key: "meeting:m", label: "Board meeting, Mar 1, 2026" });
  });

  test("names an event and the day it starts", () => {
    expect(
      eventGroup({
        id: "e",
        name: "Winter Social",
        starts_at: "2027-01-11T01:00:00Z",
      }),
    ).toEqual({ key: "event:e", label: "Winter Social, Jan 10, 2027" });
  });
});
