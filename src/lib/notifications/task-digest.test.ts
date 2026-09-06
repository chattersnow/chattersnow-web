import { describe, expect, test } from "bun:test";
import {
  addCalendarDays,
  dedupeKeyFor,
  digestDay,
  groupForDigest,
  includesUndated,
  qualifies,
  type ActionItemRow,
  type DigestPerson,
} from "./task-digest";

// Noon Mountain time, so nothing here is sitting on a zone boundary except the
// cases that mean to.
const WEDNESDAY = new Date("2026-03-11T19:00:00Z");
const MONDAY = new Date("2026-03-09T19:00:00Z");

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

function item(overrides: Partial<ActionItemRow> = {}): ActionItemRow {
  return {
    id: crypto.randomUUID(),
    tenant_id: TENANT_A,
    description: "Send the insurance certificate",
    due_date: "2026-03-12",
    owner_person_id: "person-a",
    meeting_id: "meeting-1",
    meeting_date: null,
    ...overrides,
  };
}

function person(overrides: Partial<DigestPerson> = {}): DigestPerson {
  return {
    id: "person-a",
    tenant_id: TENANT_A,
    email: "avery@example.test",
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
        item({ description: "Due soon", due_date: "2026-03-12" }),
        item({ description: "Too far out", due_date: "2026-04-01" }),
      ],
      [person()],
      WEDNESDAY,
    );

    expect(recipients).toHaveLength(1);
    expect(recipients[0].email).toBe("avery@example.test");
    expect(recipients[0].items.map((i) => i.description)).toEqual(["Due soon"]);
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
        item({ description: "Late", due_date: "2026-03-01" }),
        item({ description: "Soon", due_date: "2026-03-12" }),
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
        item({ description: "No date", due_date: null }),
        item({ description: "Later", due_date: "2026-03-12" }),
        item({ description: "Sooner", due_date: "2026-03-10" }),
      ],
      [person()],
      // Monday, so the undated item is in scope at all.
      MONDAY,
    );
    expect(recipients[0].items.map((i) => i.description)).toEqual([
      "Sooner",
      "Later",
      "No date",
    ]);
  });

  test("deep-links each item at its meeting's action items", () => {
    const recipients = groupForDigest(
      [item({ meeting_id: "meeting-9" })],
      [person()],
      WEDNESDAY,
    );
    expect(recipients[0].items[0].href).toBe(
      "/portal/governance/meetings/meeting-9?tab=overview#action-items-section",
    );
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
        item({ tenant_id: TENANT_A, description: "Tenant A item" }),
        item({ tenant_id: TENANT_B, description: "Tenant B item" }),
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
      recipients.find((r) => r.tenantId === TENANT_A)?.items[0].description,
    ).toBe("Tenant A item");
    expect(
      recipients.find((r) => r.tenantId === TENANT_B)?.items[0].description,
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
